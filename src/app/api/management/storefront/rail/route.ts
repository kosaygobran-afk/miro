import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const railItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
  scheduled_from: z.string().datetime().nullable().optional(),
  scheduled_until: z.string().datetime().nullable().optional(),
}).refine(
  (data) =>
    !data.scheduled_from ||
    !data.scheduled_until ||
    new Date(data.scheduled_from) < new Date(data.scheduled_until),
  { message: "Scheduled end must be later than scheduled start" },
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

  const { admin } = auth;
  const { data, error } = await admin
    .from("storefront_rail_items")
    .select(
      `
      *,
      products (
        id, slug, name_he, name_en, price, image_url, status
      )
    `,
    )
    .order("sort_order");

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ railItems: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = railItemSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { data: railItem, error: railItemError } = await admin
    .from("storefront_rail_items")
    .insert({
      ...parsed.data,
      created_by: actor.user.id,
    })
    .select()
    .single();

  if (railItemError) {
    return mapPostgresError(railItemError);
  }

  await admin.from("audit_events").insert({
    action: "rail_item_created",
    user_id: actor.user.id,
    details: { rail_item_id: railItem.id, product_id: railItem.product_id },
    entity_type: "storefront_rail_item",
    entity_id: railItem.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ railItem });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = railItemSchema
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

  const { data: railItem, error: railItemError } = await admin
    .from("storefront_rail_items")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (railItemError) {
    return mapPostgresError(railItemError);
  }

  await admin.from("audit_events").insert({
    action: "rail_item_updated",
    user_id: actor.user.id,
    details: { rail_item_id: railItem.id, product_id: railItem.product_id },
    entity_type: "storefront_rail_item",
    entity_id: railItem.id,
  });

  await revalidateStorefront();

  return NextResponse.json({ railItem });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Rail item ID required", 400);
  }

  const { admin, actor } = auth;

  // Get the rail item first for audit
  const { data: existing } = await admin
    .from("storefront_rail_items")
    .select("product_id")
    .eq("id", id)
    .single();

  const { error: deleteError } = await admin
    .from("storefront_rail_items")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "rail_item_deleted",
    user_id: actor.user.id,
    details: { rail_item_id: id, product_id: existing?.product_id },
    entity_type: "storefront_rail_item",
    entity_id: id,
  });

  await revalidateStorefront();

  return NextResponse.json({ ok: true });
}
