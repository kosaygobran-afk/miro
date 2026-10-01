import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";

const lookupQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  activeOnly: z.coerce.boolean().optional().default(true),
});

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = lookupQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { q, limit, activeOnly } = parsed.data;
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
        product_prices (role, price)
      )
    `,
    )
    .eq("is_active", activeOnly)
    .order("sku")
    .limit(limit);

  if (activeOnly) {
    query = query.eq("products.status", "active");
  }

  if (q) {
    const term = q.replace(/[%_]/g, "");
    if (term) {
      query = query.or(
        `sku.ilike.%${term}%,barcode.ilike.%${term}%,products.name_he.ilike.%${term}%,products.name_en.ilike.%${term}%`,
      );
    }
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
