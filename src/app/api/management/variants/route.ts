import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).nullable().optional(),
  color_he: z.string().max(100).nullable().optional(),
  color_en: z.string().max(100).nullable().optional(),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  price_override: z.number().nonnegative().nullable().optional(),
  cost_override: z.number().nonnegative().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),
  supplier_sku: z.string().max(100).nullable().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  low_stock_threshold: z.number().int().nonnegative().default(0),
  reorder_point: z.number().int().nonnegative().nullable().optional(),
  reorder_qty: z.number().int().nonnegative().nullable().optional(),
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
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  let query = admin
    .from("product_variants")
    .select(
      `
      id, product_id, sku, barcode, color_he, color_en, color_hex,
      price_override, cost_override, supplier_id, supplier_sku,
      is_default, is_active, low_stock_threshold, reorder_point, reorder_qty,
      stock_qty, created_at, updated_at,
      suppliers (id, company_name)
    `,
    )
    .order("created_at", { ascending: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error: variantsError } = await query;

  if (variantsError) {
    return errorResponse(variantsError.message);
  }

  return NextResponse.json({ variants: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = variantSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { ...insertData } = parsed.data;

  // Default-flag flips go through the atomic RPC (advisory-locked).
  const wantsDefault = insertData.is_default;
  insertData.is_default = false;

  const { data: variant, error: variantError } = await admin
    .from("product_variants")
    .insert(insertData)
    .select()
    .single();

  if (variantError) {
    return mapPostgresError(variantError);
  }

  if (wantsDefault) {
    const client = await createServerSupabaseClient();
    const { error: defaultError } = await client.rpc("set_default_variant", {
      p_variant: variant.id,
    });
    if (defaultError) return mapPostgresError(defaultError);
    variant.is_default = true;
  }

  await admin.from("audit_events").insert({
    action: "variant_created",
    user_id: actor.user.id,
    details: {
      variant_id: variant.id,
      product_id: variant.product_id,
      sku: variant.sku,
      is_default: variant.is_default,
    },
    entity_type: "product_variant",
    entity_id: variant.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ variant });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = variantSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, product_id, ...updateData } = parsed.data;

  // Default-flag flips go through the atomic RPC (advisory-locked).
  const wantsDefault = updateData.is_default === true;
  if (wantsDefault) {
    delete updateData.is_default;
  }

  const { data: variant, error: variantError } = await admin
    .from("product_variants")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (variantError) {
    return mapPostgresError(variantError);
  }

  if (wantsDefault) {
    const client = await createServerSupabaseClient();
    const { error: defaultError } = await client.rpc("set_default_variant", {
      p_variant: id,
    });
    if (defaultError) return mapPostgresError(defaultError);
    variant.is_default = true;
  }

  await admin.from("audit_events").insert({
    action: "variant_updated",
    user_id: actor.user.id,
    details: {
      variant_id: variant.id,
      product_id: variant.product_id,
      sku: variant.sku,
      changes: Object.keys(updateData),
      requested_product_id: product_id ?? null,
    },
    entity_type: "product_variant",
    entity_id: variant.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ variant });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Variant ID required", 400);
  }

  const { admin, actor } = auth;

  // Check if stock_movements exist for this variant
  const { count: movementsCount, error: countError } = await admin
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("variant_id", id);

  if (countError) {
    return mapPostgresError(countError);
  }

  const hasMovements = (movementsCount ?? 0) > 0;

  if (hasMovements) {
    // Soft delete: set is_active = false
    const { data: variant, error: updateError } = await admin
      .from("product_variants")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return mapPostgresError(updateError);
    }

    await admin.from("audit_events").insert({
      action: "variant_archived",
      user_id: actor.user.id,
      details: {
        variant_id: id,
        product_id: variant.product_id,
        sku: variant.sku,
        reason: "referenced_by_stock_movements",
      },
      entity_type: "product_variant",
      entity_id: id,
    });

    await revalidateCatalog();

    return NextResponse.json({ ok: true, archived: true });
  }

  // Hard delete: no movements
  const { error: deleteError } = await admin
    .from("product_variants")
    .delete()
    .eq("id", id);

  if (deleteError) {
    // Check for FK constraint violation (23503) from stock_movements
    if (deleteError.code === "23503") {
      return NextResponse.json(
        {
          error: "Cannot delete variant with stock movements",
          code: "has_stock_movements",
        },
        { status: 409 },
      );
    }
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "variant_deleted",
    user_id: actor.user.id,
    details: { variant_id: id },
    entity_type: "product_variant",
    entity_id: id,
  });

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
