/** Shared by catalog reads, management links and public route matching. */
export function getCategoryKeyFromSlug(slug: string): string {
  const slugMap: Record<string, string> = {
    cameras: "cameras",
    "security-cameras": "cameras",
    servers: "servers",
    nvr: "servers",
    routers: "routers",
    network: "routers",
    cables: "cables",
    accessories: "accessories",
    tools: "accessories",
    "network-gear": "networkGear",
    networkgear: "networkGear",
    "alarm-systems": "alarms",
    "intercom-access": "intercom",
    "intercom-and-access": "intercom",
  };

  return Object.hasOwn(slugMap, slug) ? slugMap[slug] : slug;
}

export function getProductStorefrontHref(
  locale: "he" | "en",
  categorySlug: string,
  productSlug: string,
): string {
  return `/${locale}/store/${encodeURIComponent(getCategoryKeyFromSlug(categorySlug))}/${encodeURIComponent(productSlug)}`;
}
