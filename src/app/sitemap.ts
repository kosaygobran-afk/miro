import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n";
import { localizedUrl } from "@/lib/seo";
import { getStoreCatalog } from "@/lib/store-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalog = await getStoreCatalog("he");
  const publicPaths = [
    "",
    "services",
    "home",
    "services/home",
    "services/business",
    "services/security-cameras",
    "services/alarm-systems",
    "services/intercom-access",
    "services/network-wifi",
    "about",
    "contact",
    ...catalog.categories.map((category) => `store/${category.key}`),
    ...catalog.products.map(
      (product) => `store/${product.category}/${product.slug}`,
    ),
  ];

  return locales.flatMap((locale) =>
    publicPaths.map((path) => ({
      url: localizedUrl(locale, path),
      changeFrequency: path === "" ? ("daily" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path === "home" ? 0.6 : 0.8,
    })),
  );
}
