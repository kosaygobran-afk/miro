import { switchLocalePath, type Locale } from "@/lib/i18n";

/** Preserve the complete location when changing the interface language. */
export function switchNavigationLocale(
  pathname: string,
  locale: Locale,
  router: { push: (href: string) => void },
) {
  const destination = new URL(window.location.href);
  destination.pathname = switchLocalePath(pathname, locale);
  // Next 16.4.3's prefetched-route path appends url.hash to a cached canonical
  // URL. A return locale trip can duplicate the fragment. Native document
  // navigation preserves anchored URLs exactly and still runs route auth.
  if (destination.hash) window.location.assign(destination.href);
  else router.push(`${destination.pathname}${destination.search}`);
}
