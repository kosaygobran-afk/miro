import { z } from "zod";

/** One public appearance choice; account permissions never enter this payload. */
export const glassSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export const publicGlassSettingsSchema = z
  .object({
    enabled: z.boolean(),
    revision: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type GlassSettings = z.infer<typeof glassSettingsSchema>;
export type PublicGlassSettings = z.infer<typeof publicGlassSettingsSchema>;
export const PUBLIC_GLASS_SETTINGS_TAG = "public-glass-settings";
export const DEFAULT_PUBLIC_GLASS_SETTINGS: PublicGlassSettings = {
  enabled: true,
  revision: null,
};
