import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_STORE_NAVIGATION_TAG } from "@/lib/public-presentation-cache";
import { getCategoryWriteError } from "@/lib/catalog/category-errors";

function mapCategoryError(error: { code?: string; message?: string }) {
  const hierarchy = getCategoryWriteError(error);
  return hierarchy
    ? NextResponse.json(hierarchy.body, { status: hierarchy.status })
    : mapPostgresError(error);
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(100),
  name_he: z.string().min(1).max(255),
  name_en: z.string().min(1).max(255),
  description_he: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
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
  revalidateTag(PUBLIC_STORE_NAVIGATION_TAG, { expire: 0 });
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

  const { admin } = auth;
  const { data, error: categoriesError } = await admin
    .from("categories")
    .select(
      "*, products:products!products_category_id_fkey(count), child_products:products!products_subcategory_id_fkey(count)",
    )
    .order("sort_order");

  if (categoriesError) {
    return errorResponse(categoriesError.message);
  }

  // Flatten the bounded count embed into a plain product_count per row so the
  // management UI can gate hard deletes on "zero products" without a join.
  const countProducts = (counts: { count: number }[] | null) =>
    Array.isArray(counts) ? (counts[0]?.count ?? 0) : 0;
  const categories = (data ?? []).map(
    ({
      products: productCount,
      child_products: childProductCount,
      ...row
    }) => ({
      ...row,
      product_count:
        countProducts(productCount) + countProducts(childProductCount),
      subcategory_count: (data ?? []).filter(
        (child) => child.parent_id === row.id,
      ).length,
    }),
  );

  return NextResponse.json({ categories });
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
    return mapCategoryError(categoryError);
  }

  await admin.from("audit_events").insert({
    action: "category_created",
    user_id: actor.user.id,
    details: {
      category_id: category.id,
      slug: category.slug,
      parent_id: category.parent_id,
    },
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
    .extend({
      id: z.string().uuid(),
      // Zod 4 applies inner defaults even after partial(); PATCH must never
      // reset ordering or reactivate a category when those keys are omitted.
      sort_order: z.number().int().optional(),
      is_active: z.boolean().optional(),
    })
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
    return mapCategoryError(categoryError);
  }

  await admin.from("audit_events").insert({
    action: "category_updated",
    user_id: actor.user.id,
    details: {
      category_id: category.id,
      slug: category.slug,
      parent_id: category.parent_id,
    },
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
      return mapCategoryError(deactivateError);
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
    return mapCategoryError(deleteError);
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
