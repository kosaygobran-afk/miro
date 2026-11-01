// Owner-approved replacement of these two uploaded logo campaigns only.
// Keep saved design revisions and unrelated owner-uploaded artwork intact.
export const BRAND_HERO_ASSET = "/images/brand/miro-group-hero.svg";
const replacedCampaigns = new Set([
  "https://ffzemicpwwxmxptuwevo.supabase.co/storage/v1/object/public/product-media/storefront/design/9bbd505b-4b75-4edd-aed6-386d84992862.png",
  "https://ffzemicpwwxmxptuwevo.supabase.co/storage/v1/object/public/product-media/storefront/design/47021fb5-9da5-4ac8-85d4-7cfd109aa731.png",
]);
export function resolveBrandAsset(url: string): string {
  return replacedCampaigns.has(url) ? BRAND_HERO_ASSET : url;
}
