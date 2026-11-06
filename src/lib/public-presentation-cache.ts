import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";

export const PUBLIC_STOREFRONT_DESIGN_TAG = "public-storefront-design";
export const PUBLIC_ANIMATION_SETTINGS_TAG = "public-animation-settings";
export const PUBLIC_CONTACT_CONFIG_TAG = "public-contact-config";
export const PUBLIC_STORE_NAVIGATION_TAG = "public-store-navigation";

const REFRESH_SECONDS = 60;

/**
 * Only cookie-free, validated public presentation belongs in this cache.
 * Auth, catalog stock, prices and financial data must remain request-scoped.
 * Failed reads must throw inside the loader so fallbacks are never persisted.
 * This project does not enable Cache Components, so use the Data Cache API.
 */
export function cachePublicPresentation<T>(
  tag: string,
  load: () => Promise<T>,
  { refresh = "background" }: { refresh?: "background" | "blocking" } = {},
): () => Promise<T> {
  const keys = [tag, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""];

  if (refresh === "blocking") {
    // Each minute gets a new key, so refresh failures reach the caller's catch
    // instead of Next's background-revalidation console.error. The entry TTL
    // exceeds its active window: we never read an expired window in the normal
    // clock direction. Only successful loads are stored; tag expiry still wins.
    const readWindow = unstable_cache<(window: number) => Promise<T>>(
      load,
      keys,
      { tags: [tag], revalidate: REFRESH_SECONDS * 2 },
    );
    return cache(() =>
      readWindow(Math.floor(Date.now() / (REFRESH_SECONDS * 1000))),
    );
  }

  return cache(
    unstable_cache(load, keys, {
      tags: [tag],
      revalidate: REFRESH_SECONDS,
    }),
  );
}
