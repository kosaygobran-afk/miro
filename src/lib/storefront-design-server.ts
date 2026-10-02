import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  defaultStorefrontDesign,
  storefrontDesignSchema,
} from "./storefront-design";
export async function getPublicStorefrontDesign() {
  try {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_storefront_design",
    );
    const parsed = storefrontDesignSchema.safeParse(data);
    if (!error && parsed.success) return parsed.data;
  } catch {
    /* Public assets remain usable during configuration outages. */
  }
  return defaultStorefrontDesign;
}
