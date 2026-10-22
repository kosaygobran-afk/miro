import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";

const lookupQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  variant_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  activeOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

// Quote each literal pattern for PostgREST's filter grammar. Punctuation cannot
// inject another clause, and user-entered wildcard characters stay literal.
function searchPattern(term: string): string {
  const pattern = `%${term.replace(/[\\%_*]/g, (character) => `\\${character}`)}%`;
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = lookupQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { q, variant_id, limit, activeOnly } = parsed.data;
  const { admin } = auth;

  // Build query for product variants with minimal fields for pickers
  let query = admin
    .from("product_variants")
    .select(
      `
      id,
      sku,
      barcode,
      color_he,
      color_en,
      color_hex,
      price_override,
      is_default,
      is_active,
      stock_qty,
      low_stock_threshold,
      products!inner (
        id,
        name_he,
        name_en,
        slug,
        status,
        price,
        sale_price,
        tracking_mode,
        product_prices (role, price)
      )
    `,
    )
    .order("sku")
    .limit(limit);

  if (activeOnly) {
    query = query.eq("is_active", true).eq("products.status", "active");
  }
  if (variant_id) query = query.eq("id", variant_id);

  if (q) {
    const pattern = searchPattern(q);
    // PostgREST cannot OR root variant columns with embedded product columns.
    // Resolve bounded parent matches first, then filter only variant columns.
    let productQuery = admin
      .from("products")
      .select("id")
      .or(`name_he.ilike.${pattern},name_en.ilike.${pattern}`)
      .order("id")
      .limit(200);
    if (activeOnly) productQuery = productQuery.eq("status", "active");
    const matching = await productQuery;
    if (matching.error) return mapPostgresError(matching.error);
    const productIds = (matching.data ?? []).map((product) => product.id);
    const filters = [`sku.ilike.${pattern}`, `barcode.ilike.${pattern}`];
    if (productIds.length)
      filters.push(`product_id.in.(${productIds.join(",")})`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;

  if (error) return mapPostgresError(error);

  // Flatten and format for picker UI
  const results = (data ?? []).map((row) => ({
    variant: {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      color_he: row.color_he,
      color_en: row.color_en,
      color_hex: row.color_hex,
      price_override: row.price_override,
      is_default: row.is_default,
      is_active: row.is_active,
      stock_qty: row.stock_qty,
      low_stock_threshold: row.low_stock_threshold,
    },
    product: row.products,
  }));

  return NextResponse.json({ results });
}
