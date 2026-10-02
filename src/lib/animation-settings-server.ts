import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  DEFAULT_ANIMATION_SETTINGS,
  parseAnimationSettings,
} from "./animation-settings";

/** Only the limited public RPC is used here; the settings table stays private. */
export async function getPublicAnimationSettings() {
  try {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_animation_settings",
    );
    if (!error) return parseAnimationSettings(data);
  } catch {
    // A configuration outage must not prevent users from opening the site.
  }
  return structuredClone(DEFAULT_ANIMATION_SETTINGS);
}
