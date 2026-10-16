import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  PRODUCT_MEDIA_BUCKET,
  IMAGE_MIME_BY_TYPE,
  buildStorageObjectName,
  sanitizeSvg,
  isAcceptedImageReference,
  parseOwnedStorageObjectName,
} from "@/lib/image-safety";
import { revalidatePath } from "next/cache";
import {
  processProductImage,
  validateProductImage,
  type BackgroundRemovalInfo,
} from "@/lib/product-image-processing";
import { downloadProductImage } from "@/lib/remote-product-image";

// image_url accepts an external http(s) URL or an owned storage object name
// (products/<uuid>/<file>) in the product-media bucket (migration
// 20260927230000).
const imageSchema = z.object({
  product_id: z.string().uuid(),
  image_url: z.string().max(2000).refine(isAcceptedImageReference, {
    message: "image_url must be an http(s) URL or an owned storage object",
  }),
  alt_he: z.string().max(300).nullish(),
  alt_en: z.string().max(300).nullish(),
  sort_order: z.number().int().default(0),
  remove_background: z.boolean().default(true),
});

// PATCH goes through upsert_product_image_meta: alt texts, sort_order and the
// is_primary convention (primary = lowest sort_order; the RPC moves this image
// below the current minimum).
const imagePatchSchema = z
  .object({
    id: z.string().uuid(),
    alt_he: z.string().max(300).nullable().optional(),
    alt_en: z.string().max(300).nullable().optional(),
    sort_order: z.number().int().optional(),
    is_primary: z.boolean().optional(),
  })
  .strict();

async function revalidateCatalog() {
  revalidatePath("/he");
  revalidatePath("/en");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (productId && !z.string().uuid().safeParse(productId).success) {
    return errorResponse("Invalid productId", 400);
  }

  const { admin } = auth;
  let query = admin
    .from("product_images")
    .select("*")
    .order("sort_order")
    .order("created_at");
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
  const { product_id, image_url, alt_he, alt_en, sort_order } = parsed.data;

  // Verify product exists and user has access
  const { data: product, error: productError } = await admin
    .from("products")
    .select("id")
    .eq("id", product_id)
    .maybeSingle();
  if (productError) {
    return mapPostgresError(productError);
  }
  if (!product) {
    return errorResponse("Product not found", 404);
  }

  const ownedObject = parseOwnedStorageObjectName(
    image_url,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  let finalImageUrl = image_url;
  let uploadedObject: string | null = null;
  let backgroundRemovalInfo: BackgroundRemovalInfo = {
    status: "original",
    skipped: true,
    reason: "existing_reference",
  };

  if (ownedObject) {
    const { data } = admin.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .getPublicUrl(ownedObject);
    finalImageUrl = data.publicUrl;
  } else {
    let imported;
    try {
      const bytes = await downloadProductImage(image_url);
      const type = await validateProductImage(bytes);
      imported = await processProductImage(
        bytes,
        type,
        parsed.data.remove_background,
      );
    } catch {
      return errorResponse(
        "Could not import image. Use a public HTTPS URL for a valid still image (5 MB, 16 megapixels maximum).",
        400,
      );
    }
    backgroundRemovalInfo = imported.backgroundRemoval;
    const objectName = buildStorageObjectName(product_id, imported.type);
    const bytes =
      imported.type === "svg"
        ? Buffer.from(sanitizeSvg(new TextDecoder().decode(imported.bytes)))
        : imported.bytes;
    const { error } = await admin.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .upload(objectName, bytes, {
        contentType: IMAGE_MIME_BY_TYPE[imported.type],
        upsert: false,
      });
    if (error) return errorResponse("Upload failed", 500);
    uploadedObject = objectName;
    const { data } = admin.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .getPublicUrl(objectName);
    finalImageUrl = data.publicUrl;
  }

  const { data: image, error: imageError } = await admin
    .from("product_images")
    .insert({
      product_id,
      image_url: finalImageUrl,
      alt_he: alt_he ?? null,
      alt_en: alt_en ?? null,
      sort_order,
    })
    .select()
    .single();

  if (imageError) {
    if (uploadedObject) {
      await admin.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .remove([uploadedObject])
        .catch(() => undefined);
    }
    return mapPostgresError(imageError);
  }

  await admin.from("audit_events").insert({
    action: "product_image_added",
    user_id: actor.user.id,
    details: {
      product_id,
      image_id: image.id,
      background_removal: backgroundRemovalInfo,
    },
    entity_type: "product_image",
    entity_id: image.id,
  });

  await revalidateCatalog();

  return NextResponse.json({
    image,
    background_removal: backgroundRemovalInfo,
  });
}

export async function PATCH(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = imagePatchSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { id, ...fields } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return errorResponse("Nothing to update", 400);
  }

  // Self-authorizing RPC (audits as auth.uid()): user-context client required.
  const client = await createServerSupabaseClient();
  const { data: image, error: imageError } = await client.rpc(
    "upsert_product_image_meta",
    { p_id: id, p_patch: patch },
  );

  if (imageError) {
    console.error(
      "upsert_product_image_meta failed:",
      imageError.code,
      imageError.message,
    );
    if (imageError.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (imageError.code === "22023") {
      if ((imageError.message ?? "").includes("Image not found")) {
        return NextResponse.json({ error: "Image not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Invalid input", code: "invalid_input" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }

  await revalidateCatalog();

  return NextResponse.json({ image });
}

export async function DELETE(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return errorResponse("Image ID required", 400);
  }

  const { admin, actor } = auth;

  const { data: existing, error: fetchError } = await admin
    .from("product_images")
    .select("id, product_id, image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return mapPostgresError(fetchError);
  }
  if (!existing) {
    return errorResponse("Image not found", 404);
  }

  const { error: deleteError } = await admin
    .from("product_images")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return mapPostgresError(deleteError);
  }

  // Remove the owned storage object too; external URLs are never touched.
  const objectName = parseOwnedStorageObjectName(
    existing.image_url,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  if (objectName) {
    const { error: removeError } = await admin.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .remove([objectName]);
    if (removeError) {
      console.error(
        "Failed to remove product-media object after image delete:",
        objectName,
        removeError.message,
      );
    }
  }

  await admin.from("audit_events").insert({
    action: "product_image_deleted",
    user_id: actor.user.id,
    details: { image_id: id, product_id: existing.product_id },
    entity_type: "product_image",
    entity_id: id,
  });

  await revalidateCatalog();

  return NextResponse.json({ ok: true });
}
