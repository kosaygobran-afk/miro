import { NextResponse } from "next/server";
import { z } from "zod";
import {
  commerceFailure,
  commerceJson,
  checkRpcError,
} from "@/lib/commerce/http";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
  getClientIp,
  checkManagementRateLimit,
} from "@/app/api/management/_shared";

const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    category: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().max(10_000).optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(30),
    exact: z.enum(["1"]).optional(),
  })
  .refine((value) => !value.exact || Boolean(value.q), {
    message: "Exact scanning requires a code",
    path: ["q"],
  });

function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function searchFilterValues(term: string) {
  const literal = term.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!literal) return null;
  // .or() accepts PostgREST syntax, not a parameterized value. Quote and escape
  // the value so a comma/parenthesis in a model name cannot add another filter.
  // Supabase performs URL encoding; percent-encoding here would double it.
  const pattern = `%${literal.replace(/[\\%_*]/g, (character) => `\\${character}`)}%`;
  return {
    pattern: quoteFilterValue(pattern),
    exact: quoteFilterValue(literal),
    exactSku: quoteFilterValue(
      literal.replace(/[\\%_*]/g, (character) => `\\${character}`),
    ),
  };
}

export async function GET(request: Request) {
  // Use recordSale capability for POS access (least privilege)
  const auth = await withManagementAuth(request, "recordSale");
  if (!auth.ok) return auth.response;

  const { admin } = auth;

  // Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkManagementRateLimit(admin, ip);
  if (rateLimit === "error") {
    return commerceJson({ error: "Unable to process request" }, 503);
  }
  if (rateLimit === "limited") {
    return NextResponse.json(
      { error: "Rate limited", code: "rate_limited" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = catalogQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { q, category, page, limit, exact } = parsed.data;
  let exactNoMatches = false;

  // Build query for POS-optimized product data
  let query = admin
    .from("products")
    .select(
      `
      id,
      slug,
      name_he,
      name_en,
      price,
      sale_price,
      tracking_mode,
      image_url,
      categories!inner (id, slug, name_he, name_en, is_active),
      product_variants!inner (
        id,
        sku,
        barcode,
        color_he,
        color_en,
        color_hex,
        price_override,
        pos_price,
        pos_enabled,
        is_default,
        is_active,
        stock_qty,
        low_stock_threshold
      )
    `,
      { count: "exact" },
    )
    .eq("status", "active")
    .eq("product_variants.is_active", true)
    .eq("product_variants.pos_enabled", true)
    .eq("categories.is_active", true)
    .order("created_at", { ascending: false });

  // Apply category filter
  if (category) {
    query = query.eq("categories.id", category);
  }

  // Apply search filter
  if (q) {
    const term = searchFilterValues(q);
    if (term) {
      const { data: matchingVariants, error: variantSearchError } = await admin
        .from("product_variants")
        .select("product_id")
        .eq("is_active", true)
        .eq("pos_enabled", true)
        .or(
          exact
            ? `sku.ilike.${term.exactSku},barcode.eq.${term.exact}`
            : `sku.eq.${term.exact},barcode.eq.${term.exact},sku.ilike.${term.pattern},barcode.ilike.${term.pattern}`,
        )
        .limit(exact ? 101 : 200);
      if (variantSearchError) return mapPostgresError(variantSearchError);
      if (exact && matchingVariants && matchingVariants.length > 100)
        return commerceJson({ error: "ambiguous_code" }, 409);

      const matchingProductIds = Array.from(
        new Set((matchingVariants ?? []).map((v) => v.product_id)),
      );
      const filters = exact
        ? []
        : [
            `name_he.ilike.${term.pattern}`,
            `name_en.ilike.${term.pattern}`,
            `slug.ilike.${term.pattern}`,
          ];
      if (matchingProductIds.length > 0) {
        filters.push(`id.in.(${matchingProductIds.join(",")})`);
      }
      if (exact && matchingProductIds.length === 0) exactNoMatches = true;
      else query = query.or(filters.join(","));
    }
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const {
    data: products,
    error: productsError,
    count,
  } = exactNoMatches ? { data: [], error: null, count: 0 } : await query;

  if (productsError) {
    return mapPostgresError(productsError);
  }

  // Fetch categories for navigation
  const { data: categories, error: categoriesError } = await admin
    .from("categories")
    .select("id, slug, name_he, name_en, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order");

  if (categoriesError) {
    return mapPostgresError(categoriesError);
  }

  const variantIds = (products ?? []).flatMap((product) =>
    (product.product_variants ?? [])
      .filter((variant) => variant.is_active && variant.pos_enabled)
      .map((variant) => variant.id as string),
  );
  const availability = new Map<
    string,
    { available_qty: number; reserved_qty: number; stock_qty: number }
  >();
  // Aggregate holds in SQL so large reservation counts cannot be silently
  // truncated by the database API's row limit. Chunking bounds each RPC.
  for (let offset = 0; offset < variantIds.length; offset += 500) {
    const { data, error } = await admin.rpc("commerce_pos_available_stock", {
      p_variant_ids: variantIds.slice(offset, offset + 500),
    });
    if (error) {
      try {
        checkRpcError(error);
      } catch (failure) {
        return commerceFailure(failure, "pos_catalog_availability");
      }
    }
    if (!Array.isArray(data))
      return commerceJson(
        { error: "Catalog availability is unavailable" },
        503,
      );
    for (const row of data) availability.set(row.variant_id, row);
  }

  // Transform to POS-optimized shape
  const posProducts = (products ?? []).map((product) => {
    const variants = (product.product_variants ?? [])
      .filter((v) => v.is_active && v.pos_enabled)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        color_he: v.color_he,
        color_en: v.color_en,
        color_hex: v.color_hex,
        // Keep the established consumer contract while applying the same POS
        // price precedence as the canonical sale quote.
        price_override: v.pos_price ?? v.price_override,
        pos_price: v.pos_price,
        is_default: v.is_default,
        stock_qty:
          product.tracking_mode === "none"
            ? v.stock_qty
            : (availability.get(v.id)?.available_qty ?? 0),
        on_hand_qty: availability.get(v.id)?.stock_qty ?? v.stock_qty,
        reserved_qty: availability.get(v.id)?.reserved_qty ?? 0,
        low_stock_threshold: v.low_stock_threshold,
      }));

    const cat = product.categories;
    const firstCat = Array.isArray(cat) ? cat[0] : cat;
    return {
      id: product.id,
      slug: product.slug,
      name_he: product.name_he,
      name_en: product.name_en,
      image_url: product.image_url,
      category: firstCat
        ? {
            id: firstCat.id,
            slug: firstCat.slug,
            name_he: firstCat.name_he,
            name_en: firstCat.name_en,
          }
        : null,
      price: product.price,
      sale_price: product.sale_price,
      tracking_mode: product.tracking_mode,
      variants,
    };
  });

  return commerceJson({
    products: posProducts,
    categories: categories ?? [],
    totalCount: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}
