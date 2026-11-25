import { z } from "zod";
import { cache } from "react";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  cachePublicPresentation,
  PUBLIC_CONTACT_CONFIG_TAG,
} from "@/lib/public-presentation-cache";

/**
 * Public contact configuration for the storefront.
 *
 * Values saved in CEO Settings take precedence per field, including an
 * explicit clear. Deployment defaults support fields that have never been set.
 * The anonymous RPC also supplies the localized address and hours.
 */

const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(32)
  .regex(/^\+?[0-9][0-9()\s.-]*$/, "Invalid phone format");

const whatsappSchema = z
  .string()
  .trim()
  .regex(/^\+?\d{7,15}$/, "WhatsApp number must be digits with country code");

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const rpcConfigSchema = z.object({
  configured_fields: z.array(z.enum(["phone", "whatsapp", "email"])).optional(),
  phone: z.string().nullish(),
  whatsapp: z.string().nullish(),
  email: z.string().nullish(),
  address_he: z.string().nullish(),
  address_en: z.string().nullish(),
  hours_he: z.string().nullish(),
  hours_en: z.string().nullish(),
});

const readPublicContactConfig = cachePublicPresentation(
  PUBLIC_CONTACT_CONFIG_TAG,
  async () => {
    const { data, error } = await createPublicServerClient().rpc(
      "get_public_contact_config",
    );
    if (error) throw error;
    return rpcConfigSchema.parse(data);
  },
  { refresh: "blocking" },
);

export type PublicContactConfig = {
  /** Validated phone number for display (whitespace trimmed), or null. */
  phone: string | null;
  /** Normalized value for a tel: href (digits, `+`, no separators), or null. */
  phoneHref: string | null;
  /** WhatsApp number, digits only (wa.me compatible), or null. */
  whatsapp: string | null;
  /** Validated email address, or null. */
  email: string | null;
  addressHe: string | null;
  addressEn: string | null;
  hoursHe: string | null;
  hoursEn: string | null;
};

/** The action subset client components need to render call/WhatsApp links. */
export type PublicContactActions = {
  phone: string | null;
  phoneHref: string | null;
  whatsapp: string | null;
};

function toTelHref(phone: string): string {
  return phone.replace(/[\s().-]/g, "");
}

function toWhatsAppNumber(value: string): string {
  return value.replace(/\D/g, "");
}

export function getPublicContactEnvironmentFallbacks() {
  const phone = phoneSchema.safeParse(process.env.NEXT_PUBLIC_CONTACT_PHONE);
  const whatsapp = whatsappSchema.safeParse(
    process.env.NEXT_PUBLIC_CONTACT_WHATSAPP,
  );
  const email = emailSchema.safeParse(process.env.NEXT_PUBLIC_CONTACT_EMAIL);
  return {
    phone: phone.success ? phone.data : null,
    whatsapp: whatsapp.success ? toWhatsAppNumber(whatsapp.data) : null,
    email: email.success ? email.data : null,
  };
}

function emptyConfig(): PublicContactConfig {
  return {
    phone: null,
    phoneHref: null,
    whatsapp: null,
    email: null,
    addressHe: null,
    addressEn: null,
    hoursHe: null,
    hoursEn: null,
  };
}

function contactValue(
  rpc: z.infer<typeof rpcConfigSchema> | null,
  field: "phone" | "whatsapp" | "email",
  fallback: string | null,
): string | null {
  if (rpc?.configured_fields?.includes(field)) return rpc[field] ?? null;
  // Before the projection added presence metadata, null also represented an
  // unset field. Existing nonempty values already take precedence.
  return rpc?.[field]?.trim() || fallback || null;
}

export const getPublicContactConfig = cache(
  async (): Promise<PublicContactConfig> => {
    const config = emptyConfig();
    const fallback = getPublicContactEnvironmentFallbacks();

    let rpc: z.infer<typeof rpcConfigSchema> | null = null;
    try {
      rpc = await readPublicContactConfig();
    } catch {
      // Keep optional public contact reads from breaking page rendering.
      console.warn("Public contact configuration unavailable.");
    }

    const phone = phoneSchema.safeParse(
      contactValue(rpc, "phone", fallback.phone),
    );
    if (phone.success) {
      config.phone = phone.data;
      config.phoneHref = toTelHref(phone.data);
    }

    const whatsapp = whatsappSchema.safeParse(
      contactValue(rpc, "whatsapp", fallback.whatsapp),
    );
    if (whatsapp.success) {
      config.whatsapp = toWhatsAppNumber(whatsapp.data);
    }

    const email = emailSchema.safeParse(
      contactValue(rpc, "email", fallback.email),
    );
    if (email.success) {
      config.email = email.data;
    }

    config.addressHe = rpc?.address_he?.trim() || null;
    config.addressEn = rpc?.address_en?.trim() || null;
    config.hoursHe = rpc?.hours_he?.trim() || null;
    config.hoursEn = rpc?.hours_en?.trim() || null;

    return config;
  },
);

export function toPublicContactActions(
  config: PublicContactConfig,
): PublicContactActions {
  return {
    phone: config.phone,
    phoneHref: config.phoneHref,
    whatsapp: config.whatsapp,
  };
}
