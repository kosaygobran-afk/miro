import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { revalidatePath } from "next/cache";
import {
  CATEGORY_ICON_BUCKET,
  CATEGORY_ICON_MAX_BYTES,
  extensionImageType,
  sniffImageType,
  sanitizeSvg,
  buildCategoryIconObjectName,
  parseOwnedCategoryIconObjectName,
  UnsafeSvgError,
} from "@/lib/image-safety";

const uploadCategoryIconSchema = z.object({
  category_id: z.string().uuid(),
  // Accept either an external URL or a file upload (handled via multipart/form-data)
  image_url: z.string().url().optional(),
});

async function revalidateStorefront() {
  revalidatePath("/he");
  revalidatePath("/en");
  revalidatePath("/he/store/[category]", "page");
  revalidatePath("/en/store/[category]", "page");
}

async function uploadCategoryIconToStorage(
  admin: SupabaseClient,
  categoryId: string,
  file: Buffer,
  extension: string,
  mimeType: string,
): Promise<string> {
  const objectName = buildCategoryIconObjectName(categoryId, extension);

  const { error: uploadError } = await admin.storage
    .from(CATEGORY_ICON_BUCKET)
    .upload(objectName, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Get the public URL
  const { data: urlData } = admin.storage
    .from(CATEGORY_ICON_BUCKET)
    .getPublicUrl(objectName);

  return urlData.publicUrl;
}

async function deleteCategoryIconFromStorage(
  admin: SupabaseClient,
  imageUrl: string,
): Promise<void> {
  const objectName = parseOwnedCategoryIconObjectName(
    imageUrl,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  if (!objectName) return;

  await admin.storage.from(CATEGORY_ICON_BUCKET).remove([objectName]);
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageCatalog");
  if (!auth.ok) return auth.response;

  const { admin, actor } = auth;

  const contentType = request.headers.get("content-type") ?? "";

  // Handle multipart/form-data (file upload)
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const categoryId = formData.get("category_id") as string | null;

    if (!file || !categoryId) {
      return errorResponse("File and category_id are required", 400);
    }

    // Validate category exists
    const { data: category, error: catError } = await admin
      .from("categories")
      .select("id, icon_image_url")
      .eq("id", categoryId)
      .single();

    if (catError || !category) {
      return errorResponse("Category not found", 404);
    }

    // Validate file size
    if (file.size > CATEGORY_ICON_MAX_BYTES) {
      return errorResponse(
        `File size exceeds maximum of ${CATEGORY_ICON_MAX_BYTES / 1024 / 1024}MB`,
        400,
      );
    }

    // Validate extension
    const extension = extensionImageType(file.name);
    if (!extension) {
      return errorResponse(
        "Invalid file extension. Allowed: jpg, jpeg, png, webp, avif, svg",
        400,
      );
    }

    // Validate MIME type matches extension
    const expectedMime =
      extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    if (
      file.type !== expectedMime &&
      !(extension === "svg" && file.type === "image/svg+xml")
    ) {
      return errorResponse("File MIME type does not match extension", 400);
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sniff actual content type
    const actualType =
      extension === "svg" ? "svg" : sniffImageType(new Uint8Array(buffer));
    if (!actualType) {
      return errorResponse(
        "Could not determine image type from file content",
        400,
      );
    }

    // For SVG, sanitize
    if (actualType === "svg") {
      try {
        const svgText = buffer.toString("utf-8");
        const sanitized = sanitizeSvg(svgText);
        const sanitizedBuffer = Buffer.from(sanitized, "utf-8");
        const publicUrl = await uploadCategoryIconToStorage(
          admin,
          categoryId,
          sanitizedBuffer,
          "svg",
          "image/svg+xml",
        );

        // Delete old icon if exists
        if (category.icon_image_url) {
          await deleteCategoryIconFromStorage(admin, category.icon_image_url);
        }

        // Update category with new icon URL
        const { data: updatedCategory, error: updateError } = await admin
          .from("categories")
          .update({
            icon_image_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", categoryId)
          .select()
          .single();

        if (updateError) {
          return mapPostgresError(updateError);
        }

        await admin.from("audit_events").insert({
          action: "category_icon_uploaded",
          user_id: actor.user.id,
          details: { category_id: categoryId, object_name: publicUrl },
          entity_type: "category",
          entity_id: categoryId,
        });

        await revalidateStorefront();

        return NextResponse.json({
          category: updatedCategory,
          iconUrl: publicUrl,
        });
      } catch (e) {
        if (e instanceof UnsafeSvgError) {
          return errorResponse(e.message, 400);
        }
        throw e;
      }
    }

    // For raster images, upload directly
    const publicUrl = await uploadCategoryIconToStorage(
      admin,
      categoryId,
      buffer,
      extension,
      expectedMime,
    );

    // Delete old icon if exists
    if (category.icon_image_url) {
      await deleteCategoryIconFromStorage(admin, category.icon_image_url);
    }

    // Update category with new icon URL
    const { data: updatedCategory, error: updateError } = await admin
      .from("categories")
      .update({
        icon_image_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", categoryId)
      .select()
      .single();

    if (updateError) {
      return mapPostgresError(updateError);
    }

    await admin.from("audit_events").insert({
      action: "category_icon_uploaded",
      user_id: actor.user.id,
      details: { category_id: categoryId, object_name: publicUrl },
      entity_type: "category",
      entity_id: categoryId,
    });

    await revalidateStorefront();

    return NextResponse.json({ category: updatedCategory, iconUrl: publicUrl });
  }

  // Handle JSON (external URL)
  const body = await request.json().catch(() => null);
  const parsed = uploadCategoryIconSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { category_id, image_url } = parsed.data;

  // Validate category exists
  const { data: category, error: catError } = await admin
    .from("categories")
    .select("id, icon_image_url")
    .eq("id", category_id)
    .single();

  if (catError || !category) {
    return errorResponse("Category not found", 404);
  }

  // If no image_url provided, clear the icon
  if (!image_url) {
    // Delete old icon if exists
    if (category.icon_image_url) {
      await deleteCategoryIconFromStorage(admin, category.icon_image_url);
    }

    const { data: updatedCategory, error: updateError } = await admin
      .from("categories")
      .update({ icon_image_url: null, updated_at: new Date().toISOString() })
      .eq("id", category_id)
      .select()
      .single();

    if (updateError) {
      return mapPostgresError(updateError);
    }

    await admin.from("audit_events").insert({
      action: "category_icon_cleared",
      user_id: actor.user.id,
      details: { category_id },
      entity_type: "category",
      entity_id: category_id,
    });

    await revalidateStorefront();

    return NextResponse.json({ category: updatedCategory });
  }

  // External icons are deliberately limited to HTTPS raster images. SVGs
  // must use the upload flow so their active content can be sanitized first.
  try {
    const url = new URL(image_url);
    const ownedObject = parseOwnedCategoryIconObjectName(
      image_url,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    if (url.protocol !== "https:") {
      return errorResponse("Only HTTPS image URLs are allowed", 400);
    }
    if (url.username || url.password) {
      return errorResponse("Image URLs must not contain credentials", 400);
    }
    if (!ownedObject && /\.svgz?(?:$|[?#])/i.test(image_url)) {
      return errorResponse(
        "External SVG URLs are not allowed. Upload the SVG for sanitization.",
        400,
      );
    }
  } catch {
    return errorResponse("Invalid URL format", 400);
  }

  // Delete old icon if exists
  if (category.icon_image_url) {
    await deleteCategoryIconFromStorage(admin, category.icon_image_url);
  }

  // Update category with new icon URL
  const { data: updatedCategory, error: updateError } = await admin
    .from("categories")
    .update({ icon_image_url: image_url, updated_at: new Date().toISOString() })
    .eq("id", category_id)
    .select()
    .single();

  if (updateError) {
    return mapPostgresError(updateError);
  }

  await admin.from("audit_events").insert({
    action: "category_icon_updated",
    user_id: actor.user.id,
    details: { category_id, image_url },
    entity_type: "category",
    entity_id: category_id,
  });

  await revalidateStorefront();

  return NextResponse.json({ category: updatedCategory, iconUrl: image_url });
}
