import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { localizedUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPaths = [
    "",
    "services",
    "services/home",
    "services/business",
    "services/security-cameras",
    "services/alarm-systems",
    "services/intercom-access",
    "services/network-wifi",
    "about",
    "contact",
  ];

  return locales.flatMap((locale) =>
    publicPaths.map((path) => ({
      url: localizedUrl(locale, path),
      lastModified: new Date("2026-09-20"),
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.8,
    })),
  );
}
