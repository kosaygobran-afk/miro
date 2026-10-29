import "server-only";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { cachePublicPresentation } from "./public-presentation-cache";
import {
  DEFAULT_PUBLIC_GLASS_SETTINGS,
  PUBLIC_GLASS_SETTINGS_TAG,
  publicGlassSettingsSchema,
  type PublicGlassSettings,
} from "./glass-settings";

let lastKnownGood: PublicGlassSettings | null = null;

const revisionMicros = (revision: string) =>
  BigInt(Date.parse(revision)) * BigInt(1000) +
  BigInt((revision.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));

/** A confirmed local save is newer than an outage-era cached public read. */
export function rememberPublicGlassSettings(value: PublicGlassSettings) {
  const settings = publicGlassSettingsSchema.parse(value);
  if (settings.revision === null) throw new Error("Glass revision unavailable");
  if (
    lastKnownGood?.revision &&
    revisionMicros(settings.revision) < revisionMicros(lastKnownGood.revision)
  )
    return;
  lastKnownGood = settings;
}

const readPublicGlassSettings = cachePublicPresentation(
  PUBLIC_GLASS_SETTINGS_TAG,
  async () => {
    // Cookie-free client uses supabaseFetchPublic's bounded six-second transport.
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_glass_settings",
    );
    if (error) throw error;
    const settings = publicGlassSettingsSchema.parse(data);
    if (settings.revision === null)
      throw new Error("Glass settings unavailable");
    return settings;
  },
);

/** Only enabled + revision are public. Never read private business settings here. */
export async function getPublicGlassSettings(): Promise<PublicGlassSettings> {
  try {
    const settings = publicGlassSettingsSchema.parse(
      await readPublicGlassSettings(),
    );
    if (settings.revision === null)
      throw new Error("Glass settings unavailable");
    rememberPublicGlassSettings(settings);
    return structuredClone(lastKnownGood ?? settings);
  } catch {
    // An outage must not resurrect a previously disabled global choice. A cold
    // process with no successful read uses the requested default-on appearance.
    return structuredClone(lastKnownGood ?? DEFAULT_PUBLIC_GLASS_SETTINGS);
  }
}
