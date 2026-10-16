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
  UnsafeSvgError,
  buildStorageObjectName,
  extensionImageType,
  sniffImageType,
  sanitizeSvg,
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

// Helper: call the Python background-removal worker
async function callBackgroundRemovalWorker(
  inputBytes: Uint8Array,
  workerUrl: string,
): Promise<{
  skipped: boolean;
  reason: string | null;
  imageBase64: string;
  mode: string;
}> {
  const formData = new FormData();
  // Determine file extension from magic bytes
  let fileExtension: string;
  if (
    inputBytes.length >= 3 &&
    inputBytes[0] === 0xff &&
    inputBytes[1] === 0xd8 &&
    inputBytes[2] === 0xff
  ) {
    fileExtension = "jpeg";
  } else if (
    inputBytes.length >= 8 &&
    inputBytes[0] === 0x89 &&
    inputBytes[1] === 0x50 &&
    inputBytes[2] === 0x4e &&
    inputBytes[3] === 0x47 &&
    inputBytes[4] === 0x0d &&
    inputBytes[5] === 0x0a &&
    inputBytes[6] === 0x1a &&
    inputBytes[7] === 0x0a
  ) {
    fileExtension = "png";
  } else if (
    inputBytes.length >= 12 &&
    inputBytes.subarray(0, 4).reduce((acc, b) => acc + b, 0) ===
      "RIFF".split("").reduce((a, c) => a + c.charCodeAt(0), 0) &&
    inputBytes.subarray(8, 12).reduce((acc, b) => acc + b, 0) ===
      "WEBP".split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  ) {
    fileExtension = "webp";
  } else {
    fileExtension = "png"; // default fallback
  }
  formData.append(
    "file",
    new Blob([Buffer.from(inputBytes as unknown as Buffer)], {
      type: `image/${fileExtension}`,
    }),
    `image.${fileExtension}`,
  );

  const response = await fetch(`${workerUrl}/remove-background`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Background removal worker failed: ${response.status} - ${errorBody}`,
    );
  }

  return response.json();
}

function base64Decode(str: string): Uint8Array {
  // Node.js Buffer is available in the Next.js server environment
  const buffer = Buffer.from(str, "base64");
  return Uint8Array.from(buffer);
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
  if (type === null) {
    if (declared === "svg") {
      try {
        sanitizeSvg(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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

  // Skip background removal for SVG files - they preserve sanitized SVG behavior
  if (type === "svg") {
    const objectName = buildStorageObjectName(meta.product_id, "svg");
    const { error: uploadError } = await admin.storage
      .from(PRODUCT_MEDIA_BUCKET)
      .upload(
        objectName,
        Buffer.from(sanitizeSvg(new TextDecoder().decode(bytes))),
        {
          contentType: "image/svg+xml",
          upsert: false,
        },
      );
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

    await admin.from("audit_events").insert({
      action: "product_image_added",
      user_id: actor.user.id,
      details: {
        product_id: meta.product_id,
        image_id: image.id,
        storage_object: objectName,
        background_removal: {
          skipped: true,
          reason: "svg file - no background removal",
        },
      },
      entity_type: "product_image",
      entity_id: image.id,
    });

    await revalidateCatalog();
    return NextResponse.json({
      image,
      background_removal: {
        skipped: true,
        reason: "svg file - no background removal",
      },
    });
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

  // --- NEW: Check with background-removal worker ---
  const workerUrl: string = process.env.BACKGROUND_REMOVAL_WORKER_URL || "";
  let processingResult: {
    skipped: boolean;
    reason: string | null;
    imageBase64: string;
    mode: string;
  };

  try {
    processingResult = await callBackgroundRemovalWorker(bytes, workerUrl);
  } catch (workerError) {
    // If the worker is unavailable, fall through to storing the original image
    // without background removal. Log the error for observability.
    console.warn(
      "[Product Images Upload] Background removal worker unavailable; " +
        "storing original image without processing.",
    );
    processingResult = {
      skipped: false,
      reason: `worker_unavailable: ${(workerError as Error).message}`,
      imageBase64: "",
      mode: "original",
    };
  }

  // Determine the image to store in Supabase Storage
  let finalImageBytes: Uint8Array;
  let finalImageMode: string;

  if (processingResult.skipped) {
    // Image already has genuine transparency - store original unchanged
    // Use the original file bytes, the worker returned the original as PNG
    finalImageMode = "RGBA";
    // Decode the base64 result from the worker
    finalImageBytes = base64Decode(processingResult.imageBase64);
    if (finalImageBytes.length === 0) {
      // Fallback: use original bytes
      finalImageBytes = bytes;
    }
  } else {
    // Opaque or needs processing - use the processed result from worker
    finalImageMode = processingResult.mode;
    // Decode base64 to bytes
    finalImageBytes = base64Decode(processingResult.imageBase64);
    // If the worker couldn't process it, fall back to original
    if (finalImageBytes.length === 0) {
      finalImageBytes = bytes;
      finalImageMode = declared ?? "jpeg";
    }
  }

  // Determine the output extension
  const outputExtension =
    finalImageMode === "RGBA" || finalImageMode === "processed"
      ? "png"
      : (declared ?? "png");

  // Build storage object name
  const objectName = buildStorageObjectName(meta.product_id, outputExtension);

  const { error: uploadError } = await admin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(objectName, finalImageBytes, {
      contentType:
        finalImageMode === "RGBA"
          ? "image/png"
          : (IMAGE_MIME_BY_TYPE[
              outputExtension as keyof typeof IMAGE_MIME_BY_TYPE
            ] as SniffedImageType),
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
      background_removal: {
        skipped: processingResult.skipped,
        reason: processingResult.reason,
        mode: processingResult.mode,
      },
    },
    entity_type: "product_image",
    entity_id: image.id,
  });

  await revalidateCatalog();

  return NextResponse.json({
    image,
    background_removal: {
      skipped: processingResult.skipped,
      reason: processingResult.reason,
    },
  });
}
