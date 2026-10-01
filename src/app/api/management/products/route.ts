import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
  mapPriceConstraintError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// List query schema
const listQuerySchema = z.object({
  id: z.string().uuid().optional(), // For single product lookup (backward compat)
  q: z.string().trim().max(200).optional(),
  status: z
    .enum(["draft", "active", "hidden", "archived", "all"])
    .optional()
    .default("all"),
  category: z.string().uuid().optional(),
  supplier: z.string().uuid().optional(),
  sort: z
    .enum([
      "created_at",
      "updated_at",
      "name_he",
      "name_en",
      "sort_order",
      "price",
    ])
    .optional()
    .default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(25),
});

// Product creation schema
const productSchema = z
  .object({
    category_id: z.string().uuid().nullable().optional(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name_he: z.string().min(1).max(255),
    name_en: z.string().min(1).max(255),
    status: z.literal("draft").optional(),
  })
  .strict();

// PATCH payload for public.update_product(p_id, p_patch): exactly the RPC
// whitelist plus the optional target status. Unknown keys are rejected loudly
// (never silently discarded — the field-loss bug this RPC fixes).
const productPatchSchema = z
  .object({
    id: z.string().uuid(),
    name_he: z.string().min(1).max(255).optional(),
    name_en: z.string().min(1).max(255).optional(),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
    category_id: z.string().uuid().nullable().optional(),
    brand: z.string().max(255).nullable().optional(),
    model_number: z.string().max(255).nullable().optional(),
    short_description_he: z.string().max(500).nullable().optional(),
    short_description_en: z.string().max(500).nullable().optional(),
    description_he: z.string().max(20000).nullable().optional(),
    description_en: z.string().max(20000).nullable().optional(),
    tags: z.array(z.string().min(1).max(100)).max(50).optional(),
    warranty_he: z.string().max(1000).nullable().optional(),
    warranty_en: z.string().max(1000).nullable().optional(),
    sort_order: z.number().int().optional(),
    out_of_stock_policy: z
      .enum([
        "inherit",
        "keep_visible_contact",
        "keep_visible_restock",
        "hide_from_public",
      ])
      .optional(),
    is_featured: z.boolean().optional(),
    seo_title_he: z.string().max(255).nullable().optional(),
    seo_title_en: z.string().max(255).nullable().optional(),
    seo_description_he: z.string().max(1000).nullable().optional(),
    seo_description_en: z.string().max(1000).nullable().optional(),
    price: z.number().positive().nullable().optional(),
    compare_at_price: z.number().positive().nullable().optional(),
    sale_price: z.number().positive().nullable().optional(),
    purchase_cost: z.number().nonnegative().nullable().optional(),
    status: z.enum(["draft", "active", "hidden", "archived"]).optional(),
  })
  .strict();

// update_product raises these exact texts with errcode 22023 when a requested
// publish transition fails validation against the final patched state.
const PUBLISH_INCOMPLETE_REASONS = [
  "Missing Hebrew name",
  "Missing English name",
  "Missing category",
  "Category is not active",
  "at least one active variant",
];

async function revalidateCatalog() {
  revalidatePath("/he/store");
  revalidatePath("/en/store");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
  revalidatePath("/he/store/[category]/[slug]", "page");
  revalidatePath("/en/store/[category]/[slug]", "page");
}

// Helper to sanitize text for ilike queries
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[%_]/g, "");
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { id, q, status, category, supplier, sort, order, page, limit } =
    parsed.data;
  const { admin } = auth;

  // If ID is provided, return single product (backward compat)
  if (id) {
    const { data: product, error } = await admin
      .from("products")
      .select(
        `
        id, slug, category_id, name_he, name_en, short_description_he, short_description_en,
        description_he, description_en, price, compare_at_price, sale_price, inventory_count,
        is_active, is_featured, image_url, metadata, created_at, updated_at,
        brand, model_number, tags, specifications, warranty_he, warranty_en,
        seo_title_he, seo_title_en, seo_description_he, seo_description_en,
        sort_order, currency, purchase_cost, recommended_price, out_of_stock_policy,
        expected_restock_date, tracking_mode, supplier_id, status,
        categories (id, slug, name_he, name_en, sort_order, is_active),
        product_images (id, image_url, alt_he, alt_en, sort_order),
        product_prices (role, price),
        product_variants (id, sku, barcode, color_he, color_en, color_hex, price_override, cost_override, supplier_id, supplier_sku, is_default, is_active, stock_qty, low_stock_threshold, reorder_point, reorder_qty),
        suppliers (id, company_name)
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return mapPostgresError(error);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ product });
  }

  // Build list query
  let query = admin
    .from("products")
    .select(
      `
      id, slug, category_id, name_he, name_en, short_description_he, short_description_en,
      description_he, description_en, price, compare_at_price, sale_price, inventory_count,
      is_active, is_featured, image_url, metadata, created_at, updated_at,
      brand, model_number, tags, specifications, warranty_he, warranty_en,
      seo_title_he, seo_title_en, seo_description_he, seo_description_en,
      sort_order, currency, purchase_cost, recommended_price, out_of_stock_policy,
      expected_restock_date, tracking_mode, supplier_id, status,
      categories (id, slug, name_he, name_en, sort_order, is_active),
      product_images (id, image_url, alt_he, alt_en, sort_order),
      product_prices (role, price),
      product_variants (id, sku, barcode, color_he, color_en, color_hex, price_override, cost_override, supplier_id, supplier_sku, is_default, is_active, stock_qty, low_stock_threshold, reorder_point, reorder_qty),
      suppliers (id, company_name)
    `,
      { count: "exact" },
    )
    .order(sort, { ascending: order === "asc" });

  // Apply filters
  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (category) {
    query = query.eq("category_id", category);
  }
  if (supplier) {
    query = query.eq("supplier_id", supplier);
  }
  if (q) {
    const term = sanitizeSearchTerm(q.trim());
    if (term) {
      const { data: matchingVariants, error: variantSearchError } = await admin
        .from("product_variants")
        .select("product_id")
        .ilike("sku", `%${term}%`)
        .limit(100);
      if (variantSearchError) return mapPostgresError(variantSearchError);

      const matchingProductIds = Array.from(
        new Set((matchingVariants ?? []).map((variant) => variant.product_id)),
      );
      const filters = [
        `name_he.ilike.%${term}%`,
        `name_en.ilike.%${term}%`,
        `slug.ilike.%${term}%`,
      ];
      if (matchingProductIds.length > 0) {
        filters.push(`id.in.(${matchingProductIds.join(",")})`);
      }
      query = query.or(filters.join(","));
    }
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data: products, error: productsError, count } = await query;

  if (productsError) {
    return mapPostgresError(productsError);
  }

  // Fetch categories for dropdowns
  const { data: categories, error: categoriesError } = await admin
    .from("categories")
    .select("id, slug, name_he, name_en, sort_order, is_active")
    .order("sort_order");

  if (categoriesError) {
    return mapPostgresError(categoriesError);
  }

  return NextResponse.json({
    products: products ?? [],
    categories: categories ?? [],
    totalCount: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { data: product, error: productError } = await client.rpc(
    "create_catalog_product",
    {
      p_slug: parsed.data.slug,
      p_name_he: parsed.data.name_he,
      p_name_en: parsed.data.name_en,
      p_category_id: parsed.data.category_id ?? null,
    },
  );

  if (productError) {
    return mapPostgresError(productError);
  }

  await revalidateCatalog();

  return NextResponse.json({ product });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productPatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { id, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return errorResponse("Nothing to update", 400);
  }

  // One transactional call: applies all whitelisted fields, optionally
  // transitions status (publish rules validated against the final patched
  // state) and writes the audit row. Self-authorizing RPC, so it must run
  // through the user-context client (auth.uid()), not the service client.
  const client = await createServerSupabaseClient();
  const { data: product, error: rpcError } = await client.rpc(
    "update_product",
    { p_id: id, p_patch: patch },
  );

  if (rpcError) {
    console.error("update_product failed:", rpcError.code, rpcError.message);
    if (rpcError.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (rpcError.code === "23514") {
      return mapPriceConstraintError(rpcError);
    }
    if (rpcError.code === "22023") {
      const message = rpcError.message ?? "";
      if (message.includes("Product not found")) {
        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 },
        );
      }
      if (
        PUBLISH_INCOMPLETE_REASONS.some((reason) => message.includes(reason))
      ) {
        return NextResponse.json(
          {
            error: "Publish validation failed",
            code: "publish_incomplete",
            details: message,
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Invalid input", code: "invalid_input" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  await revalidateCatalog();

  return NextResponse.json({ product });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return errorResponse("Valid product ID required", 400);
  }

  // Archiving preserves stock, order and audit history. update_product writes
  // the product change and actor audit event in one database transaction.
  if (searchParams.get("hard") === "true") {
    return NextResponse.json(
      { error: "Archive this product to preserve its history" },
      { status: 409 },
    );
  }
  const client = await createServerSupabaseClient();
  const { error: archiveError } = await client.rpc("update_product", {
    p_id: id,
    p_patch: { status: "archived" },
  });
  if (archiveError) return mapPostgresError(archiveError);

  await revalidateCatalog();

  return NextResponse.json({ ok: true, archived: true });
}
