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
  isAcceptedImageReference,
  parseOwnedStorageObjectName,
} from "@/lib/image-safety";
import { revalidatePath } from "next/cache";

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

// Helper: download image bytes from a public HTTPS URL with SSRF protection
async function downloadImageFromUrl(url: string): Promise<Buffer> {
  const parsed = new URL(url);

  // Require HTTPS for remote imports
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are supported for remote imports");
  }

  // Reject credentials embedded in URLs
  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed");
  }

  // Reject localhost, loopback, link-local, private, reserved addresses
  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error("Localhost addresses are not allowed");
  }

  // Block link-local addresses
  if (hostname.startsWith("169.254.") || hostname.startsWith("fe80.")) {
    throw new Error("Link-local addresses are not allowed");
  }

  // Block private IPv4 ranges
  if (
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.") ||
    hostname.startsWith("192.168.")
  ) {
    throw new Error("Private network addresses are not allowed");
  }

  // Block reserved/multicast ranges
  if (
    hostname.startsWith("224.") ||
    hostname.startsWith("239.") ||
    hostname.startsWith("0.") ||
    hostname.startsWith("240.")
  ) {
    throw new Error("Reserved network addresses are not allowed");
  }

  const response = await fetch(url, {
    redirect: "manual", // Handle redirects manually for SSRF protection
  });

  if (response.status >= 300 && response.status < 400) {
    const redirectUrl = response.headers.get("location");
    if (!redirectUrl) {
      throw new Error("Invalid redirect");
    }
    // Validate redirect destination
    const redirectParsed = new URL(redirectUrl, url);
    if (redirectParsed.protocol !== "https:") {
      throw new Error("Redirect to non-HTTPS URL not allowed");
    }
    // Fetch the redirect target with same protections
    return downloadImageFromUrl(redirectUrl);
  }

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Remote URL does not point to an image");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
    throw new Error("Image exceeds 5 MB limit");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Helper: call the Python background-removal worker
async function callBackgroundRemovalWorker(inputBytes: Buffer): Promise<{
  skipped: boolean;
  reason: string | null;
  imageBase64: string;
  mode: string;
}> {
  const workerUrl = process.env.BACKGROUND_REMOVAL_WORKER_URL;
  if (!workerUrl) {
    // Worker not configured - return original without processing
    return {
      skipped: false,
      reason: "worker_not_configured",
      imageBase64: inputBytes.toString("base64"),
      mode: "original",
    };
  }

  const formData = new FormData();
  // Detect file extension from magic bytes
  let fileExtension = "png";
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
    inputBytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    inputBytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    fileExtension = "webp";
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

  // Check if this is an external URL that needs background removal
  const parsedUrl = new URL(image_url);
  const isExternalUrl =
    parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  const isOwnedStorage = parseOwnedStorageObjectName(
    image_url,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );

  let finalImageUrl = image_url;
  let backgroundRemovalInfo: { skipped: boolean; reason: string | null } = {
    skipped: true,
    reason: "existing url reference - no processing",
  };

  if (isExternalUrl && !isOwnedStorage) {
    // This is a new external URL import - download, process, and store
    try {
      const imageBuffer = await downloadImageFromUrl(image_url);

      // Call background removal worker
      const processingResult = await callBackgroundRemovalWorker(imageBuffer);

      backgroundRemovalInfo = {
        skipped: processingResult.skipped,
        reason: processingResult.reason,
      };

      if (processingResult.skipped) {
        // Image already transparent - import unchanged to owned storage
        // Store original bytes in owned storage
        const objectName = `products/${product_id}/${crypto.randomUUID()}.png`;
        const { error: uploadError } = await admin.storage
          .from(PRODUCT_MEDIA_BUCKET)
          .upload(objectName, imageBuffer, {
            contentType: "image/png",
            upsert: false,
          });
        if (uploadError) {
          console.error("product-media upload failed:", uploadError.message);
          return errorResponse("Upload failed", 500);
        }
        const { data: publicUrlData } = admin.storage
          .from(PRODUCT_MEDIA_BUCKET)
          .getPublicUrl(objectName);
        finalImageUrl = publicUrlData.publicUrl;
      } else {
        // Processed image - decode base64 and store
        const processedBuffer = Buffer.from(
          processingResult.imageBase64,
          "base64",
        );
        const objectName = `products/${product_id}/${crypto.randomUUID()}.png`;
        const { error: uploadError } = await admin.storage
          .from(PRODUCT_MEDIA_BUCKET)
          .upload(objectName, processedBuffer, {
            contentType: "image/png",
            upsert: false,
          });
        if (uploadError) {
          console.error("product-media upload failed:", uploadError.message);
          return errorResponse("Upload failed", 500);
        }
        const { data: publicUrlData } = admin.storage
          .from(PRODUCT_MEDIA_BUCKET)
          .getPublicUrl(objectName);
        finalImageUrl = publicUrlData.publicUrl;
      }
    } catch (downloadError) {
      console.error("URL import failed:", downloadError);
      return errorResponse(
        downloadError instanceof Error
          ? downloadError.message
          : "Failed to import image from URL",
        400,
      );
    }
  }
  // If it's an owned storage object, use it as-is (existing record reference)

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
    // Clean up uploaded storage object if database insert fails
    if (isExternalUrl && !isOwnedStorage && finalImageUrl !== image_url) {
      const objectName = parseOwnedStorageObjectName(
        finalImageUrl,
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      );
      if (objectName) {
        await admin.storage
          .from(PRODUCT_MEDIA_BUCKET)
          .remove([objectName])
          .catch(() => undefined);
      }
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
