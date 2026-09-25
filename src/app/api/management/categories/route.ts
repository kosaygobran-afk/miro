import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(100),
  name_he: z.string().min(1).max(255),
  name_en: z.string().min(1).max(255),
  description_he: z.string().optional(),
  description_en: z.string().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  image_url: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .nullable()
    .optional(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
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
  const { data, error: categoriesError } = await admin
    .from("categories")
    .select("*")
    .order("sort_order");

  if (categoriesError) {
    return errorResponse(categoriesError.message);
  }

  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { data: category, error: categoryError } = await admin
    .from("categories")
    .insert(parsed.data)
    .select()
    .single();

  if (categoryError) {
    return mapPostgresError(categoryError);
  }

  await admin.from("audit_events").insert({
    action: "category_created",
    user_id: actor.user.id,
    details: { category_id: category.id, slug: category.slug },
    entity_type: "category",
    entity_id: category.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ category });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = categorySchema
    .partial()
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { admin, actor } = auth;
  const { id, ...updateData } = parsed.data;

  const { data: category, error: categoryError } = await admin
    .from("categories")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (categoryError) {
    return mapPostgresError(categoryError);
  }

  await admin.from("audit_events").insert({
    action: "category_updated",
    user_id: actor.user.id,
    details: { category_id: category.id, slug: category.slug },
    entity_type: "category",
    entity_id: category.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ category });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return errorResponse("Category ID required", 400);
  }

  const { admin, actor } = auth;

  // Soft-deactivate by default; products keep their historical category reference
  // only when hard-deleted (FK on delete set null), so hard delete is opt-in.
  if (searchParams.get("hard") !== "true") {
    const { error: deactivateError } = await admin
      .from("categories")
      .update({ is_active: false })
      .eq("id", id);

    if (deactivateError) {
      return mapPostgresError(deactivateError);
    }

    await admin.from("audit_events").insert({
      action: "category_deactivated",
      user_id: actor.user.id,
      details: { category_id: id },
      entity_type: "category",
      entity_id: id,
    });

    await revalidateCatalog();

    return NextResponse.json({ ok: true, deactivated: true });
  }

  const { error: deleteError } = await admin
    .from("categories")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  await admin.from("audit_events").insert({
    action: "category_deleted",
    user_id: actor.user.id,
    details: { category_id: id },
    entity_type: "category",
    entity_id: id,
  });

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
