import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import {
  errorResponse,
  withManagementAuth,
} from "@/app/api/management/_shared";
import {
  createCategoryArtworkIconUrl,
  MAX_CATEGORY_ARTWORK_PHOTO_BYTES,
  MAX_CATEGORY_ARTWORK_SVG_BYTES,
  normalizeCategoryArtworkSvg,
} from "@/lib/catalog/storefront-category-artwork";
import {
  getCategoryArtworkImageUrl,
  PUBLIC_STOREFRONT_CATEGORY_ARTWORK_TAG,
} from "@/lib/catalog/storefront-category-artwork-server";
import { CommerceError, readBoundedBytes } from "@/lib/commerce/http";
import {
  extensionImageType,
  PRODUCT_MEDIA_BUCKET,
  PRODUCT_MEDIA_MAX_BYTES,
  sniffImageType,
} from "@/lib/image-safety";

const formSchema = z.object({
  category_id: z.uuid(),
  revision: z.union([z.uuid(), z.literal("")]),
  svg: z.string().max(MAX_CATEGORY_ARTWORK_SVG_BYTES),
  photo_action: z.enum(["keep", "remove", "upload"]),
});
const maxRequestBytes =
  MAX_CATEGORY_ARTWORK_PHOTO_BYTES + MAX_CATEGORY_ARTWORK_SVG_BYTES + 16 * 1024;
const headers = { "Cache-Control": "private, no-store" };

type SavedArtwork = {
  revision: string | null;
  svg_source: string | null;
  image_path: string | null;
};

function savedResponse(row: SavedArtwork | null) {
  const svgSource = row?.svg_source ?? null;
  return NextResponse.json(
    {
      artwork: {
        revision: row?.revision ?? null,
        svgSource,
        imageUrl: getCategoryArtworkImageUrl(row?.image_path ?? null),
        iconUrl: createCategoryArtworkIconUrl(svgSource),
      },
    },
    { headers },
  );
}

async function preparePhoto(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(input);
  if (!type || type !== extensionImageType(file.name)) return null;

  try {
    const pipeline = sharp(input, { limitInputPixels: 16_000_000 });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
      return null;
    // Auto-orient before sizing, then emit still WebP without input metadata.
    const photo = await pipeline
      .autoOrient()
      .resize({
        width: 1440,
        height: 1440,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .webp({ quality: 84 })
      .toBuffer();
    return photo.byteLength <= PRODUCT_MEDIA_MAX_BYTES ? photo : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return errorResponse("Invalid category ID", 400);

  const [category, artwork] = await Promise.all([
    auth.admin
      .from("categories")
      .select("id")
      .eq("id", id.data)
      .is("parent_id", null)
      .maybeSingle(),
    auth.admin
      .from("storefront_category_artwork")
      .select("revision, svg_source, image_path")
      .eq("category_id", id.data)
      .maybeSingle(),
  ]);
  if (category.error || artwork.error)
    return errorResponse("Category artwork is unavailable", 503);
  if (!category.data) return errorResponse("Root category not found", 404);
  return savedResponse(artwork.data);
}

export async function PUT(request: Request) {
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;
  let form: FormData;
  try {
    const bytes = await readBoundedBytes(request, maxRequestBytes);
    form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (error) {
    return error instanceof CommerceError && error.status === 413
      ? errorResponse("Category artwork exceeds the upload limit", 413)
      : errorResponse("Invalid category artwork settings", 400);
  }
  const parsed = formSchema.safeParse({
    category_id: form.get("category_id"),
    revision: form.get("revision"),
    svg: form.get("svg"),
    photo_action: form.get("photo_action"),
  });
  if (!parsed.success)
    return errorResponse("Invalid category artwork settings", 400);

  const {
    category_id: categoryId,
    revision,
    svg,
    photo_action: photoAction,
  } = parsed.data;
  const svgSource = svg.trim() ? normalizeCategoryArtworkSvg(svg) : null;
  if (svg.trim() && !svgSource) {
    return errorResponse(
      "Use a graphics-only SVG up to 32 KB with a valid viewBox",
      400,
    );
  }

  const file = form.get("file");
  const storage = auth.admin.storage.from(PRODUCT_MEDIA_BUCKET);
  let imagePath = null;
  if (photoAction === "upload") {
    if (!(file instanceof File) || !file.size)
      return errorResponse("Choose a photo to upload", 400);
    if (file.size > MAX_CATEGORY_ARTWORK_PHOTO_BYTES)
      return errorResponse("Photo exceeds the 4 MB limit", 413);
    const photo = await preparePhoto(file);
    if (!photo)
      return errorResponse(
        "Use a still JPEG, PNG, WebP or AVIF up to 16 megapixels",
        400,
      );

    imagePath = `storefront-category-artwork/${categoryId}/${randomUUID()}.webp`;
    const upload = await storage.upload(imagePath, photo, {
      contentType: "image/webp",
      upsert: false,
    });
    if (upload.error) return errorResponse("Photo upload failed", 503);
  } else if (file !== null) {
    return errorResponse("Choose the upload action to add a photo", 400);
  }

  const { data: saved, error } = await auth.admin
    .rpc("update_storefront_category_artwork", {
      p_actor: auth.actor.user.id,
      p_category_id: categoryId,
      p_revision: revision || null,
      p_svg_source: svgSource,
      p_photo_action: photoAction,
      p_image_path: imagePath,
    })
    .single<SavedArtwork & { previous_image_path: string | null }>();

  if (error || !saved) {
    // An uncertain database response can be a confirmed write upstream. Keep
    // its object so the published artwork remains usable after reconciliation.
    if (
      imagePath &&
      error &&
      ["PT409", "PT404", "42501", "22023", "PGRST202"].includes(error.code)
    ) {
      await storage.remove([imagePath]).catch(() => undefined);
    }
    if (error?.code === "PT409")
      return errorResponse(
        "Category artwork changed. Reload the saved version",
        409,
      );
    if (error?.code === "PT404")
      return errorResponse("Root category not found", 404);
    if (error?.code === "42501") return errorResponse("Forbidden", 403);
    if (error?.code === "22023")
      return errorResponse("Invalid category artwork settings", 400);
    return errorResponse(
      "Unable to confirm the saved artwork. Reload before retrying",
      503,
    );
  }

  revalidateTag(PUBLIC_STOREFRONT_CATEGORY_ARTWORK_TAG, { expire: 0 });
  revalidatePath("/he");
  revalidatePath("/en");
  if (saved.previous_image_path) {
    await storage.remove([saved.previous_image_path]).catch(() => undefined);
  }
  return savedResponse(saved);
}
