import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const productSchema = z.object({
  id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional(),
  slug: z.string().min(1).max(255),
  name_he: z.string().min(1).max(255),
  name_en: z.string().min(1).max(255),
  short_description_he: z.string().optional(),
  short_description_en: z.string().optional(),
  description_he: z.string().optional(),
  description_en: z.string().optional(),
  price: z.number().nonnegative().nullable().optional(),
  compare_at_price: z.number().nonnegative().nullable().optional(),
  sale_price: z.number().nonnegative().nullable().optional(),
  inventory_count: z.number().int().nonnegative().default(0),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().default(false),
  image_url: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  brand: z.string().optional().nullable(),
  model_number: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  specifications: z.record(z.string(), z.unknown()).default({}),
  warranty_he: z.string().optional().nullable(),
  warranty_en: z.string().optional().nullable(),
  seo_title_he: z.string().optional().nullable(),
  seo_title_en: z.string().optional().nullable(),
  seo_description_he: z.string().optional().nullable(),
  seo_description_en: z.string().optional().nullable(),
  sort_order: z.number().int().default(0),
  currency: z.string().default("ILS"),
  purchase_cost: z.number().nonnegative().nullable().optional(),
  recommended_price: z.number().nonnegative().nullable().optional(),
  out_of_stock_policy: z
    .enum([
      "inherit",
      "keep_visible_contact",
      "keep_visible_restock",
      "hide_from_public",
    ])
    .default("inherit"),
  expected_restock_date: z.string().date().nullable().optional(),
  tracking_mode: z.enum(["none", "serial", "lot"]).default("none"),
  supplier_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "active", "hidden", "archived"]).default("draft"),
});

async function revalidateCatalog() {
  revalidatePath("/he/store");
  revalidatePath("/en/store");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const [
    { data: products, error: productsError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    admin
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
        product_prices (role, price),
        product_variants (id, sku, barcode, color_he, color_en, color_hex, price_override, cost_override, supplier_id, supplier_sku, is_default, is_active, stock_qty, low_stock_threshold, reorder_point, reorder_qty),
        suppliers (id, company_name)
      `,
      )
      .order("created_at", { ascending: false }),
    admin
      .from("categories")
      .select("id, slug, name_he, name_en, sort_order, is_active")
      .order("sort_order"),
  ]);

  if (productsError || categoriesError) {
    return errorResponse(
      productsError?.message ?? categoriesError?.message ?? "Database error",
    );
  }

  return NextResponse.json({
    products: products ?? [],
    categories: categories ?? [],
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

  const { admin, actor } = auth;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _, ...insertData } = parsed.data;

  const { data: product, error: productError } = await admin
    .from("products")
    .insert(insertData)
    .select()
    .single();

  if (productError) {
    return mapPostgresError(productError);
  }

  await admin.from("audit_events").insert({
    action: "product_created",
    user_id: actor.user.id,
    details: {
      product_id: product.id,
      slug: product.slug,
      status: product.status,
    },
    entity_type: "product",
    entity_id: product.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ product });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, status: statusFromBody, ...updateData } = parsed.data;

  // Handle status transitions specially
  if (
    statusFromBody &&
    statusFromBody !== "draft" &&
    statusFromBody !== "hidden" &&
    statusFromBody !== "archived"
  ) {
    // Target is 'active' - call publish_product RPC
    const client = await createServerSupabaseClient();
    const { error: rpcError } = await client.rpc("publish_product", {
      p_product: id,
    });

    if (rpcError) {
      if (rpcError.code === "22023") {
        console.error("publish_product validation failed:", rpcError.message);
        return NextResponse.json(
          {
            error: "Publish validation failed",
            code: "publish_incomplete",
          },
          { status: 422 },
        );
      }
      if (rpcError.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      console.error("publish_product failed:", rpcError.code, rpcError.message);
      return NextResponse.json(
        { error: "Failed to publish product" },
        { status: 500 },
      );
    }

    // Fetch updated product
    const { data: product, error: fetchError } = await admin
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      return errorResponse("Failed to fetch updated product");
    }

    await revalidateCatalog();

    return NextResponse.json({ product });
  }

  // For other status changes (draft, hidden, archived) or non-status updates
  const targetStatus = statusFromBody ?? parsed.data.status;
  if (targetStatus && ["draft", "hidden", "archived"].includes(targetStatus)) {
    // Call unpublish_product RPC for transitions away from active
    const client = await createServerSupabaseClient();
    const { error: rpcError } = await client.rpc("unpublish_product", {
      p_product: id,
      p_status: targetStatus,
    });

    if (rpcError) {
      if (rpcError.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      console.error(
        "unpublish_product failed:",
        rpcError.code,
        rpcError.message,
      );
      return NextResponse.json(
        { error: "Failed to update product status" },
        { status: 500 },
      );
    }

    const { data: product, error: fetchError } = await admin
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      return errorResponse("Failed to fetch updated product");
    }

    await revalidateCatalog();

    return NextResponse.json({ product });
  }

  // Regular update (no status change to active)
  const { data: product, error: productError } = await admin
    .from("products")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (productError) {
    return mapPostgresError(productError);
  }

  await admin.from("audit_events").insert({
    action: "product_updated",
    user_id: actor.user.id,
    details: { product_id: product.id, slug: product.slug },
    entity_type: "product",
    entity_id: product.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ product });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Product ID required", 400);
  }

  const { admin, actor } = auth;

  // Default is soft-archive; historical references (order_items, cart_items)
  // restrict hard deletes anyway.
  if (searchParams.get("hard") !== "true") {
    const { data: product, error: archiveError } = await admin
      .from("products")
      .update({ status: "archived" })
      .eq("id", id)
      .select("id")
      .single();

    if (archiveError) {
      return mapPostgresError(archiveError);
    }

    await admin.from("audit_events").insert({
      action: "product_archived",
      user_id: actor.user.id,
      details: {
        product_id: id,
        previous: "deleted_via_api",
        note: product ? "soft-archived" : "not_found",
      },
      entity_type: "product",
      entity_id: id,
    });

    await revalidateCatalog();

    return NextResponse.json({ ok: true, archived: true });
  }

  const { error: deleteError } = await admin
    .from("products")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return NextResponse.json(
        {
          error:
            "Product is referenced by orders or carts; archive it instead.",
          code: "product_has_history",
        },
        { status: 409 },
      );
    }
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "product_deleted",
    user_id: actor.user.id,
    details: { product_id: id },
    entity_type: "product",
    entity_id: id,
  });

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
