import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import {
  PRODUCT_MEDIA_BUCKET,
  buildStorageObjectName,
  parseOwnedStorageObjectName,
} from "@/lib/image-safety";
import {
  processProductImage,
  validateProductImage,
} from "@/lib/product-image-processing";
import { downloadProductImage } from "@/lib/remote-product-image";

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({ id: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid image ID", 400);
  const { admin, actor } = auth;
  const { data: existing, error: readError } = await admin
    .from("product_images")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (readError) return mapPostgresError(readError);
  if (!existing) return errorResponse("Image not found", 404);

  let processed;
  try {
    const owned = parseOwnedStorageObjectName(
      existing.image_url,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    let bytes: Buffer;
    if (owned) {
      const { data, error } = await admin.storage
        .from(PRODUCT_MEDIA_BUCKET)
        .download(owned);
      if (error || !data)
        return errorResponse("Could not read the saved image", 502);
      if (data.size > 5 * 1024 * 1024)
        return errorResponse("Image exceeds the 5 MB limit", 400);
      bytes = Buffer.from(await data.arrayBuffer());
    } else {
      bytes = await downloadProductImage(existing.image_url);
    }
    const type = await validateProductImage(bytes);
    processed = await processProductImage(bytes, type, true);
  } catch {
    return errorResponse("Could not process the saved image", 400);
  }
  if (processed.backgroundRemoval.status === "original") {
    const unsupported = processed.backgroundRemoval.reason === "svg";
    return NextResponse.json(
      {
        error: unsupported
          ? "SVG images do not support background removal"
          : "Background removal is unavailable. The saved image has not changed.",
        code: unsupported
          ? "background_removal_unsupported"
          : "background_removal_unavailable",
        background_removal: processed.backgroundRemoval,
      },
      { status: unsupported ? 422 : 503 },
    );
  }
  if (processed.backgroundRemoval.status === "transparent") {
    return NextResponse.json({
      image: existing,
      background_removal: processed.backgroundRemoval,
    });
  }

  // A new URL invalidates browser/image caches. Keep the source object intact.
  const objectName = buildStorageObjectName(existing.product_id, "png");
  const storage = admin.storage.from(PRODUCT_MEDIA_BUCKET);
  const { error: uploadError } = await storage.upload(
    objectName,
    processed.bytes,
    { contentType: "image/png", upsert: false },
  );
  if (uploadError)
    return errorResponse("Could not save the processed image", 500);
  const {
    data: { publicUrl },
  } = storage.getPublicUrl(objectName);
  const { data: image, error: updateError } = await admin
    .from("product_images")
    .update({ image_url: publicUrl })
    .eq("id", existing.id)
    .eq("image_url", existing.image_url)
    .select()
    .maybeSingle();
  // Only delete the new object after a definite failed write. Unknown outcomes
  // must be reconciled before cleanup/retry, since the row may reference it.
  if (updateError || !image) {
    if (
      !updateError ||
      !["", "PGRST000", "PGRST001", "PGRST002", "57014"].includes(
        updateError.code ?? "",
      )
    ) {
      await storage.remove([objectName]).catch(() => undefined);
    }
    if (updateError) return mapPostgresError(updateError);
    return errorResponse(
      "The image changed while processing. Refresh the gallery.",
      409,
    );
  }
  await admin.from("audit_events").insert({
    action: "product_image_background_removed",
    user_id: actor.user.id,
    entity_type: "product_image",
    entity_id: image.id,
    details: {
      product_id: existing.product_id,
      image_id: image.id,
      original_image_url: existing.image_url,
      storage_object: objectName,
      background_removal: processed.backgroundRemoval,
    },
  });
  for (const locale of ["he", "en"]) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/store`, "layout");
  }
  return NextResponse.json({
    image,
    background_removal: processed.backgroundRemoval,
  });
}
