import type { Metadata } from "next";
import { getMessages, isLocale, locales, type Locale } from "@/lib/i18n";

const fallbackSiteUrl = "http://localhost:3000";

export function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : fallbackSiteUrl);

  try {
    return new URL(raw).origin;
  } catch {
    return fallbackSiteUrl;
  }
}

export function localizedUrl(locale: Locale, path = "") {
  const normalized = path === "/" ? "" : path.replace(/^\/+/, "");
  return `${getSiteUrl()}/${locale}${normalized ? `/${normalized}` : ""}`;
}

export function localizedAlternates(path = "") {
  return {
    canonical: localizedUrl("he", path),
    languages: {
      he: localizedUrl("he", path),
      en: localizedUrl("en", path),
      "x-default": localizedUrl("he", path),
    },
  };
}

export async function pageMetadata({
  locale,
  path = "",
  title,
  description,
  noIndex = false,
}: {
  locale: string;
  path?: string;
  title: string;
  description?: string;
  noIndex?: boolean;
}): Promise<Metadata> {
  const safeLocale = isLocale(locale) ? locale : "he";
  const messages = getMessages(safeLocale);
  const metaDescription = description || messages.site.description;

  return {
    title,
    description: metaDescription,
    metadataBase: new URL(getSiteUrl()),
    alternates: {
      canonical: localizedUrl(safeLocale, path),
      languages: Object.fromEntries(
        locales.map((item) => [item, localizedUrl(item, path)]),
      ),
    },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description: metaDescription,
      url: localizedUrl(safeLocale, path),
      siteName: messages.site.name,
      locale: safeLocale === "he" ? "he_IL" : "en_US",
      type: "website",
    },
  };
}

export function devPreviewRobots(): Metadata["robots"] {
  return { index: false, follow: false };
}
