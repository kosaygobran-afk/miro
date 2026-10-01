import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  EXTENSION_BY_TYPE,
  IMAGE_MIME_BY_TYPE,
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  UnsafeSvgError,
  buildStorageObjectName,
  extensionImageType,
  sanitizeSvg,
  sniffImageType,
  type SniffedImageType,
} from "@/lib/image-safety";
import { revalidatePath } from "next/cache";

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

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Content wins over the declared extension: sniff raster magic bytes;
  // sanitize SVG text (rejecting scripts, handlers and external references).
  let type: SniffedImageType | null = sniffImageType(bytes);
  let payload: Uint8Array | string = bytes;
  if (type === null) {
    if (declared === "svg") {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        payload = sanitizeSvg(text);
      } catch (error) {
        if (error instanceof UnsafeSvgError) {
          return errorResponse("Unsafe SVG rejected", 400);
        }
        return errorResponse("File content does not match its type", 400);
      }
      type = "svg";
    } else {
      return errorResponse("File content does not match its type", 400);
    }
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

  const objectName = buildStorageObjectName(
    meta.product_id,
    EXTENSION_BY_TYPE[type],
  );
  const { error: uploadError } = await admin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(objectName, payload, {
      contentType: IMAGE_MIME_BY_TYPE[type],
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

  let finalImage = image;
  if (meta.is_primary === "true") {
    // Primary = lowest sort_order (canonical media convention); the
    // self-authorizing RPC needs the user-context client.
    const client = await createServerSupabaseClient();
    const { data: updated, error: metaError } = await client.rpc(
      "upsert_product_image_meta",
      { p_id: image.id, p_patch: { is_primary: true } },
    );
    if (metaError) {
      console.error(
        "upsert_product_image_meta after upload failed:",
        metaError.code,
        metaError.message,
      );
      await admin.from("product_images").delete().eq("id", image.id);
      await admin.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .remove([objectName])
        .catch(() => undefined);
      return mapPostgresError(metaError);
    }
    finalImage = updated ?? image;
  }

  await admin.from("audit_events").insert({
    action: "product_image_added",
    user_id: actor.user.id,
    details: {
      product_id: meta.product_id,
      image_id: image.id,
      storage_object: objectName,
    },
    entity_type: "product_image",
    entity_id: image.id,
  });

  await revalidateCatalog();

  return NextResponse.json({ image: finalImage });
}
