import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const productBadgeSchema = z
  .object({
    id: z.string().uuid().optional(),
    product_id: z.string().uuid(),
    badge_type_id: z.string().uuid(),
    priority: z.number().int().default(0),
    scheduled_from: z.string().datetime().nullable().optional(),
    scheduled_until: z.string().datetime().nullable().optional(),
  })
  .refine(
    (data) =>
      !data.scheduled_from ||
      !data.scheduled_until ||
      new Date(data.scheduled_from) < new Date(data.scheduled_until),
    { message: "Scheduled end must be later than scheduled start" },
  );

async function revalidateStorefront() {
  revalidatePath("/he");
  revalidatePath("/en");
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
    .from("product_promo_badges")
    .select(
      `
      *,
      promo_badge_types (
        key, label_he, label_en, shape, tone, icon_name, is_active
      )
    `,
    )
    .order("priority", { ascending: false });

  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ productBadges: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productBadgeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { data: productBadge, error: productBadgeError } = await admin
    .from("product_promo_badges")
    .insert({
      ...parsed.data,
      created_by: actor.user.id,
    })
    .select()
    .single();

  if (productBadgeError) {
    return mapPostgresError(productBadgeError);
  }

  await admin.from("audit_events").insert({
    action: "product_badge_assigned",
    user_id: actor.user.id,
    details: {
      product_badge_id: productBadge.id,
      product_id: productBadge.product_id,
      badge_type_id: productBadge.badge_type_id,
    },
    entity_type: "product_promo_badge",
    entity_id: productBadge.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ productBadge });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productBadgeSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .refine(
      (data) =>
        !data.scheduled_from ||
        !data.scheduled_until ||
        new Date(data.scheduled_from) < new Date(data.scheduled_until),
      { message: "Scheduled end must be later than scheduled start" },
    )
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, ...updateData } = parsed.data;

  const { data: productBadge, error: productBadgeError } = await admin
    .from("product_promo_badges")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (productBadgeError) {
    return mapPostgresError(productBadgeError);
  }

  await admin.from("audit_events").insert({
    action: "product_badge_updated",
    user_id: actor.user.id,
    details: {
      product_badge_id: productBadge.id,
      product_id: productBadge.product_id,
      badge_type_id: productBadge.badge_type_id,
    },
    entity_type: "product_promo_badge",
    entity_id: productBadge.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ productBadge });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Product badge ID required", 400);
  }

  const { admin, actor } = auth;

  // Get the product badge first for audit
  const { data: existing } = await admin
    .from("product_promo_badges")
    .select("product_id, badge_type_id")
    .eq("id", id)
    .single();

  const { error: deleteError } = await admin
    .from("product_promo_badges")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "product_badge_removed",
    user_id: actor.user.id,
    details: {
      product_badge_id: id,
      product_id: existing?.product_id,
      badge_type_id: existing?.badge_type_id,
    },
    entity_type: "product_promo_badge",
    entity_id: id,
  });

  await revalidateStorefront();

  return NextResponse.json({ ok: true });
}
