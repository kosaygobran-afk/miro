import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";
import {
  EXTENSION_BY_TYPE,
  IMAGE_MIME_BY_TYPE,
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  extensionImageType,
  sanitizeSvg,
  sniffImageType,
  type SniffedImageType,
} from "@/lib/image-safety";

/** Upload prepares an image; only publishing the design changes the storefront. */
export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0)
    return errorResponse("Image required", 400);
  if (file.size > PRODUCT_MEDIA_MAX_BYTES)
    return errorResponse("File exceeds the 5 MB limit", 400);
  const declared = extensionImageType(file.name);
  if (!declared) return errorResponse("Unsupported image type", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let type: SniffedImageType | null = sniffImageType(bytes);
  let payload: Uint8Array | string = bytes;
  if (!type && declared === "svg") {
    try {
      payload = sanitizeSvg(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      type = "svg";
    } catch {
      return errorResponse("Unsafe or invalid SVG rejected", 400);
    }
  }
  if (type !== declared)
    return errorResponse("File content does not match its extension", 400);
  const objectName = `storefront/design/${randomUUID()}.${EXTENSION_BY_TYPE[type]}`;
  const { admin, actor } = auth;
  const uploaded = await admin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .upload(objectName, payload, {
      contentType: IMAGE_MIME_BY_TYPE[type],
      upsert: false,
    });
  if (uploaded.error) return errorResponse("Image upload failed", 503);
  const audit = await admin.from("audit_events").insert({
    action: "storefront_design_asset_uploaded",
    user_id: actor.user.id,
    entity_type: "storefront_design",
    details: { storage_object: objectName, bytes: file.size, image_type: type },
  });
  if (audit.error) {
    await admin.storage.from(PRODUCT_MEDIA_BUCKET).remove([objectName]);
    return errorResponse("Unable to record image upload", 503);
  }
  const { data } = admin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .getPublicUrl(objectName);
  return NextResponse.json({ imageUrl: data.publicUrl });
}
