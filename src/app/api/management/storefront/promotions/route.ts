import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const promotionSchema = z
  .object({
    id: z.string().uuid().optional(),
    product_id: z.string().uuid(),
    promotion_type: z.enum(["percent", "fixed"]),
    value: z.number().positive(),
    compare_at_price: z.number().positive().nullable().optional(),
    is_active: z.boolean().default(true),
    scheduled_from: z.string().datetime().nullable().optional(),
    scheduled_until: z.string().datetime().nullable().optional(),
  })
  .refine((data) => {
    if (data.promotion_type === "percent") {
      return data.value > 0 && data.value <= 95;
    }
    return true;
  }, "Percentage promotion value must be between 0 and 95")
  .refine((data) => {
    if (data.compare_at_price !== null && data.compare_at_price !== undefined) {
      if (data.promotion_type === "percent") {
        return true; // For percent, compare_at_price can be different
      }
      return data.compare_at_price > data.value;
    }
    return true;
  }, "Compare-at price must be greater than discount amount for fixed promotions")
  .refine(
    (data) =>
      !data.scheduled_from ||
      !data.scheduled_until ||
      new Date(data.scheduled_from) < new Date(data.scheduled_until),
    "Scheduled end must be later than scheduled start",
  );

async function revalidateStorefront() {
  revalidatePath("/he/store");
  revalidatePath("/en/store");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
  revalidatePath("/he/store/[category]/[slug]", "page");
  revalidatePath("/en/store/[category]/[slug]", "page");
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin, searchParams } = {
    admin: auth.admin,
    searchParams: new URL(request.url).searchParams,
  };
  const productId = searchParams.get("product_id");

  let query = admin
    .from("product_public_promotions")
    .select("*")
    .order("created_at", { ascending: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ promotions: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = promotionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;

  // Check if there's already an active promotion for this product
  const { data: existing } = await admin
    .from("product_public_promotions")
    .select("id")
    .eq("product_id", parsed.data.product_id)
    .maybeSingle();

  if (existing) {
    return errorResponse(
      "Product already has a promotion. Update the existing one instead.",
      409,
    );
  }

  const { data: promotion, error: promotionError } = await admin
    .from("product_public_promotions")
    .insert({
      ...parsed.data,
      created_by: actor.user.id,
    })
    .select()
    .single();

  if (promotionError) {
    return mapPostgresError(promotionError);
  }

  await admin.from("audit_events").insert({
    action: "product_promotion_created",
    user_id: actor.user.id,
    details: {
      promotion_id: promotion.id,
      product_id: promotion.product_id,
      type: promotion.promotion_type,
      value: promotion.value,
    },
    entity_type: "product_public_promotion",
    entity_id: promotion.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ promotion });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = promotionSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .refine(
      (data) =>
        !data.scheduled_from ||
        !data.scheduled_until ||
        new Date(data.scheduled_from) < new Date(data.scheduled_until),
      "Scheduled end must be later than scheduled start",
    )
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, ...updateData } = parsed.data;

  const { data: promotion, error: promotionError } = await admin
    .from("product_public_promotions")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (promotionError) {
    return mapPostgresError(promotionError);
  }

  await admin.from("audit_events").insert({
    action: "product_promotion_updated",
    user_id: actor.user.id,
    details: {
      promotion_id: promotion.id,
      product_id: promotion.product_id,
      type: promotion.promotion_type,
      value: promotion.value,
    },
    entity_type: "product_public_promotion",
    entity_id: promotion.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ promotion });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Promotion ID required", 400);
  }

  const { admin, actor } = auth;

  // Get the promotion first for audit
  const { data: existing } = await admin
    .from("product_public_promotions")
    .select("product_id, promotion_type, value")
    .eq("id", id)
    .single();

  const { error: deleteError } = await admin
    .from("product_public_promotions")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "product_promotion_deleted",
    user_id: actor.user.id,
    details: {
      promotion_id: id,
      product_id: existing?.product_id,
      type: existing?.promotion_type,
      value: existing?.value,
    },
    entity_type: "product_public_promotion",
    entity_id: id,
  });

  await revalidateStorefront();

  return NextResponse.json({ ok: true });
}
