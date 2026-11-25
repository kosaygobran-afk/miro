import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { cachePublicPresentation } from "./public-presentation-cache";
import {
  defaultWebsiteImages,
  websiteImagesSchema,
  type WebsiteImages,
} from "./website-images";

export const PUBLIC_WEBSITE_IMAGES_TAG = "public-website-images";

export function parseStoredWebsiteImages(value: unknown) {
  // The seed delegates to the bundled design until the CEO first saves.
  return websiteImagesSchema.safeParse(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
      ? defaultWebsiteImages
      : value,
  );
}

const readPublicWebsiteImages = cachePublicPresentation(
  PUBLIC_WEBSITE_IMAGES_TAG,
  async () => {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_website_images",
    );
    if (error) throw error;
    const parsed = parseStoredWebsiteImages(data);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  },
);

export async function getPublishedWebsiteImages(): Promise<WebsiteImages> {
  try {
    return await readPublicWebsiteImages();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "PGRST202"
    ) {
      // Before the editor migration, only the bundled design can exist.
      return defaultWebsiteImages;
    }
    throw error;
  }
}

export async function getPublicWebsiteImages(): Promise<WebsiteImages> {
  try {
    return await getPublishedWebsiteImages();
  } catch {
    // A failed read may be hiding a published removal. Do not reintroduce
    // bundled gallery photos while the current design is unknown.
    const { home, services, serviceDetails } = defaultWebsiteImages.galleries;
    return {
      galleries: {
        home: { ...home, images: [] },
        services: { ...services, images: [] },
        serviceDetails: { ...serviceDetails, images: [] },
      },
      overrides: {},
    };
  }
}
