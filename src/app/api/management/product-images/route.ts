import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const imageSchema = z.object({
  product_id: z.string().uuid(),
  image_url: z.string().url(),
  alt_he: z.string().max(300).nullish(),
  alt_en: z.string().max(300).nullish(),
  sort_order: z.number().int().default(0),
  id: z.string().uuid().optional(),
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

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");

  const { admin } = auth;
  let query = admin.from("product_images").select("*").order("sort_order");
  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error: imagesError } = await query;

  if (imagesError) {
    return errorResponse(imagesError.message);
  }

  return NextResponse.json({ images: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = imageSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { data: image, error: imageError } = await admin
    .from("product_images")
    .insert(parsed.data)
    .select()
    .single();

  if (imageError) {
    return mapPostgresError(imageError);
  }

  await admin.from("audit_events").insert({
    action: "product_image_added",
    user_id: actor.user.id,
    details: { product_id: parsed.data.product_id, image_id: image.id },
    entity_type: "product_image",
    entity_id: image.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ image });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = imageSchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, ...updateData } = parsed.data;

  const { data: image, error: imageError } = await admin
    .from("product_images")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (imageError) {
    return mapPostgresError(imageError);
  }

  await admin.from("audit_events").insert({
    action: "product_image_updated",
    user_id: actor.user.id,
    details: { image_id: id },
    entity_type: "product_image",
    entity_id: id,
  });

  await revalidateCatalog();

  return NextResponse.json({ image });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Image ID required", 400);
  }

  const { admin, actor } = auth;
  const { error: deleteError } = await admin
    .from("product_images")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "product_image_deleted",
    user_id: actor.user.id,
    details: { image_id: id },
    entity_type: "product_image",
    entity_id: id,
  });

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
