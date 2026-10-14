import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  DEFAULT_ANIMATION_SETTINGS,
  parseAnimationSettings,
  animationSettingsSchema,
} from "./animation-settings";
import {
  cachePublicPresentation,
  PUBLIC_ANIMATION_SETTINGS_TAG,
} from "./public-presentation-cache";

const readPublicAnimationSettings = cachePublicPresentation(
  PUBLIC_ANIMATION_SETTINGS_TAG,
  async () => {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_animation_settings",
    );
    if (error) throw error;
    return animationSettingsSchema.parse(data);
  },
);

/** Only the limited public RPC is used here; the settings table stays private. */
export async function getPublicAnimationSettings() {
  try {
    return parseAnimationSettings(await readPublicAnimationSettings());
  } catch {
    // A configuration outage must not prevent users from opening the site.
  }
  return structuredClone(DEFAULT_ANIMATION_SETTINGS);
}
