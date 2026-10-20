import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import {
  IMAGE_MIME_BY_TYPE,
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  buildStorageObjectName,
  extensionImageType,
  sanitizeSvg,
} from "@/lib/image-safety";
import { revalidatePath } from "next/cache";
import {
  processProductImage,
  validateProductImage,
} from "@/lib/product-image-processing";

const uploadMetaSchema = z.object({
  product_id: z.string().uuid(),
  alt_he: z.string().max(300).nullish(),
  alt_en: z.string().max(300).nullish(),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_primary: z.enum(["true", "false"]).optional(),
});

async function revalidateCatalog() {
  revalidatePath("/he");
  revalidatePath("/en");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
  revalidatePath("/he/store/[category]/[slug]", "page");
  revalidatePath("/en/store/[category]/[slug]", "page");
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;
  const { admin, actor } = auth;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return errorResponse("Invalid input", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse("File required", 400);
  }

  const parsed = uploadMetaSchema.safeParse({
    product_id: form.get("product_id"),
    alt_he: form.get("alt_he") ?? undefined,
    alt_en: form.get("alt_en") ?? undefined,
    sort_order: form.get("sort_order") ?? undefined,
    is_primary: form.get("is_primary") ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }
  const meta = parsed.data;

  if (file.size <= 0) {
    return errorResponse("Empty file", 400);
  }
  if (file.size > PRODUCT_MEDIA_MAX_BYTES) {
    return errorResponse("File exceeds the 5 MB limit", 400);
  }

  const declared = extensionImageType(file.name);
  if (!declared) {
    return errorResponse("Unsupported file type", 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let type;
  try {
    type = await validateProductImage(bytes);
  } catch {
    return errorResponse(
      "Invalid or unsafe image (maximum 16 megapixels, still images only)",
      400,
    );
  }
  if (type !== declared) {
    return errorResponse("File content does not match its extension", 400);
  }

  const { data: product, error: productError } = await admin
    .from("products")
    .select("id")
    .eq("id", meta.product_id)
    .maybeSingle();
  if (productError) {
    return mapPostgresError(productError);
  }
  if (!product) {
    return errorResponse("Product not found", 404);
  }

  const processingResult = await processProductImage(bytes, type, false);
  const objectName = buildStorageObjectName(
    meta.product_id,
    processingResult.type,
  );
  const finalImageBytes =
    processingResult.type === "svg"
      ? Buffer.from(
          sanitizeSvg(new TextDecoder().decode(processingResult.bytes)),
        )
      : processingResult.bytes;

  const { error: uploadError } = await admin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(objectName, finalImageBytes, {
      contentType: IMAGE_MIME_BY_TYPE[processingResult.type],
      upsert: false,
    });
  if (uploadError) {
    console.error("product-media upload failed:", uploadError.message);
    return errorResponse("Upload failed", 500);
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(objectName);

  const { data: image, error: insertError } = await admin
    .from("product_images")
    .insert({
      product_id: meta.product_id,
      image_url: publicUrl,
      alt_he: meta.alt_he ?? null,
      alt_en: meta.alt_en ?? null,
      sort_order: meta.sort_order,
    })
    .select()
    .single();

  if (insertError) {
    await admin.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .remove([objectName])
      .catch(() => undefined);
    return mapPostgresError(insertError);
  }

  // Add processing metadata to audit event
  await admin.from("audit_events").insert({
    action: "product_image_added",
    user_id: actor.user.id,
    details: {
      product_id: meta.product_id,
      image_id: image.id,
      storage_object: objectName,
      background_removal: processingResult.backgroundRemoval,
    },
    entity_type: "product_image",
    entity_id: image.id,
  });

  await revalidateCatalog();

  return NextResponse.json({
    image,
    background_removal: processingResult.backgroundRemoval,
  });
}
