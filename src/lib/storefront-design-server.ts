import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  cachePublicPresentation,
  PUBLIC_STOREFRONT_DESIGN_TAG,
} from "./public-presentation-cache";
import {
  defaultStorefrontDesign,
  storefrontDesignSchema,
} from "./storefront-design";

const readPublicStorefrontDesign = cachePublicPresentation(
  PUBLIC_STOREFRONT_DESIGN_TAG,
  async () => {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_storefront_design",
    );
    if (error) throw error;
    return storefrontDesignSchema.parse(data);
  },
);

export async function getPublicStorefrontDesign() {
  try {
    return await readPublicStorefrontDesign();
  } catch {
    /* Public assets remain usable during configuration outages. */
  }
  return defaultStorefrontDesign;
}
