import { getCategoryKeyFromSlug } from "@/lib/catalog/routes";

const artworkByCategory: Readonly<Record<string, string>> = {
  "switches-networking": "networking",
  routers: "networking",
  networkGear: "networking",
  "45": "mobile-computers",
  "mobile-computers": "mobile-computers",
  "ups-batteries": "power-batteries",
  "audio-displays": "audio-displays",
  "cabinets-cabling": "cabinets-cabling",
  cables: "cabinets-cabling",
  "office-automotive-accessories": "office-automotive",
  "alarm-fire-detection": "alarm-fire",
  alarms: "alarm-fire",
  "recording-storage": "recording-storage",
  servers: "recording-storage",
  cameras: "security-cameras",
  "access-control-intercom": "access-intercom",
  intercom: "access-intercom",
  "tools-workwear": "tools-workwear",
  accessories: "tools-workwear",
};

export function getStoreCategoryArtwork(key: string): string {
  const routeKey = getCategoryKeyFromSlug(key);
  const artwork = Object.hasOwn(artworkByCategory, routeKey)
    ? artworkByCategory[routeKey]
    : "general-catalog";
  return `/images/category-artwork/${artwork}.svg`;
}
