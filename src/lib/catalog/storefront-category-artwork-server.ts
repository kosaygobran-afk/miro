import "server-only";

import { PRODUCT_MEDIA_BUCKET } from "@/lib/image-safety";
import { cachePublicPresentation } from "@/lib/public-presentation-cache";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  createCategoryArtworkIconUrl,
  type StorefrontCategoryArtwork,
} from "./storefront-category-artwork";

export const PUBLIC_STOREFRONT_CATEGORY_ARTWORK_TAG =
  "public-storefront-category-artwork";

const artworkPathPattern =
  /^storefront-category-artwork\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/;

export function getCategoryArtworkImageUrl(imagePath: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !imagePath || !artworkPathPattern.test(imagePath)) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${PRODUCT_MEDIA_BUCKET}/${imagePath}`;
}

const readCategoryArtwork = cachePublicPresentation(
  PUBLIC_STOREFRONT_CATEGORY_ARTWORK_TAG,
  async () => {
    const { data, error } = await createPublicServerClient()
      .from("storefront_category_artwork")
      .select("category_id, svg_source, image_path")
      .abortSignal(AbortSignal.timeout(2000));
    if (error) throw error;
    return data ?? [];
  },
  { refresh: "blocking" },
);

export async function getStorefrontCategoryArtwork(): Promise<
  Map<string, StorefrontCategoryArtwork>
> {
  try {
    const rows = await readCategoryArtwork();
    return new Map(
      rows.map((row) => [
        row.category_id,
        {
          imageUrl: getCategoryArtworkImageUrl(row.image_path),
          iconUrl: createCategoryArtworkIconUrl(row.svg_source),
        },
      ]),
    );
  } catch {
    // Older migrations and unavailable media both use the bundled vectors.
    return new Map();
  }
}
