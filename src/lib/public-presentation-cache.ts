import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";

export const PUBLIC_STOREFRONT_DESIGN_TAG = "public-storefront-design";
export const PUBLIC_ANIMATION_SETTINGS_TAG = "public-animation-settings";
export const PUBLIC_CONTACT_CONFIG_TAG = "public-contact-config";
export const PUBLIC_STORE_NAVIGATION_TAG = "public-store-navigation";

/**
 * Only cookie-free, validated public presentation belongs in this cache.
 * Auth, catalog stock, prices and financial data must remain request-scoped.
 * Failed reads must throw inside the loader so fallbacks are never persisted.
 * This project does not enable Cache Components, so use the Data Cache API.
 */
export function cachePublicPresentation<T>(
  tag: string,
  load: () => Promise<T>,
): () => Promise<T> {
  return cache(
    unstable_cache(load, [tag, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""], {
      tags: [tag],
      revalidate: 60,
    }),
  );
}
