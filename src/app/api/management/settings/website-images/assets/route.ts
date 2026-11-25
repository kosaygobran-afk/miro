import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  errorResponse,
  withManagementAuth,
} from "@/app/api/management/_shared";
import {
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  extensionImageType,
  sniffImageType,
} from "@/lib/image-safety";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_INPUT_PIXELS = 16_000_000;
const MAX_EDGE = 1800;

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_UPLOAD_BYTES + 16 * 1024) {
    return errorResponse("File exceeds the 4 MB limit", 413);
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("Image required", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse("File exceeds the 4 MB limit", 413);
  }

  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(input);
  if (!type || type !== extensionImageType(file.name)) {
    return errorResponse("Choose a valid JPEG, PNG, WebP or AVIF image", 400);
  }

  let image: Buffer;
  try {
    const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
      return errorResponse(
        "Only still images up to 16 megapixels are supported",
        400,
      );
    }
    // Apply orientation before resizing. Sharp omits input metadata by default.
    image = await pipeline
      .autoOrient()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .webp({ quality: 84 })
      .toBuffer();
  } catch {
    return errorResponse(
      "Image could not be decoded or exceeds 16 megapixels",
      400,
    );
  }
  if (image.byteLength > PRODUCT_MEDIA_MAX_BYTES) {
    return errorResponse("Optimized image exceeds the storage limit", 400);
  }

  const objectName = `website-images/${randomUUID()}.webp`;
  const { admin, actor } = auth;
  const storage = admin.storage.from(PRODUCT_MEDIA_BUCKET);
  const uploaded = await storage.upload(objectName, image, {
    contentType: "image/webp",
    upsert: false,
  });
  if (uploaded.error) return errorResponse("Image upload failed", 503);

  const audit = await admin.from("audit_events").insert({
    action: "website_image_uploaded",
    user_id: actor.user.id,
    entity_type: "website_images",
    details: {
      storage_object: objectName,
      bytes: image.byteLength,
      image_type: "webp",
    },
  });
  if (audit.error) {
    await storage.remove([objectName]);
    return errorResponse("Unable to record image upload", 503);
  }
  return NextResponse.json(
    { url: storage.getPublicUrl(objectName).data.publicUrl },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
