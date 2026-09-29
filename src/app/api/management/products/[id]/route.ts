import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";

const idParamSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { id } = await params;

  // Validate ID
  const parsed = idParamSchema.safeParse(id);
  if (!parsed.success) {
    return errorResponse("Invalid product ID", 400);
  }

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

  if (error) {
    return mapPostgresError(error);
  }

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ product });
}
