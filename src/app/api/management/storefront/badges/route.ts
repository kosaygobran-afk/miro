import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const badgeTypeSchema = z.object({
  id: z.string().uuid().optional(),
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_]+$/),
  label_he: z.string().min(1).max(40),
  label_en: z.string().min(1).max(40),
  shape: z.enum(["tag", "burst", "ticket", "ribbon", "hex"]).default("tag"),
  tone: z.enum(["sale", "best", "new", "hot", "limited"]).default("sale"),
  icon_name: z
    .string()
    .regex(/^[a-z_-]+$/)
    .nullable()
    .optional(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

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

  const { admin } = auth;
  const { data, error } = await admin
    .from("promo_badge_types")
    .select("*")
    .order("sort_order");

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ badgeTypes: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = badgeTypeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { data: badgeType, error: badgeTypeError } = await admin
    .from("promo_badge_types")
    .insert(parsed.data)
    .select()
    .single();

  if (badgeTypeError) {
    return mapPostgresError(badgeTypeError);
  }

  await admin.from("audit_events").insert({
    action: "badge_type_created",
    user_id: actor.user.id,
    details: { badge_type_id: badgeType.id, key: badgeType.key },
    entity_type: "promo_badge_type",
    entity_id: badgeType.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ badgeType });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = badgeTypeSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, ...updateData } = parsed.data;

  const { data: badgeType, error: badgeTypeError } = await admin
    .from("promo_badge_types")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (badgeTypeError) {
    return mapPostgresError(badgeTypeError);
  }

  await admin.from("audit_events").insert({
    action: "badge_type_updated",
    user_id: actor.user.id,
    details: { badge_type_id: badgeType.id, key: badgeType.key },
    entity_type: "promo_badge_type",
    entity_id: badgeType.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ badgeType });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Badge type ID required", 400);
  }

  const { admin, actor } = auth;

  // Get the badge type first for audit
  const { data: existing } = await admin
    .from("promo_badge_types")
    .select("key")
    .eq("id", id)
    .single();

  const { error: deleteError } = await admin
    .from("promo_badge_types")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "badge_type_deleted",
    user_id: actor.user.id,
    details: { badge_type_id: id, key: existing?.key },
    entity_type: "promo_badge_type",
    entity_id: id,
  });

  await revalidateStorefront();

  return NextResponse.json({ ok: true });
}
