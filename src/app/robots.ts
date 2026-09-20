import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/design-system", "/catalog-preview", "/*/account", "/*/worker", "/*/admin", "/*/login", "/*/signup"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
