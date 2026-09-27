import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Public contact configuration for the storefront.
 *
 * Source of truth, in priority order per field:
 * 1. NEXT_PUBLIC_CONTACT_PHONE / NEXT_PUBLIC_CONTACT_WHATSAPP /
 *    NEXT_PUBLIC_CONTACT_EMAIL environment variables.
 * 2. The public.get_public_contact_config() Postgres RPC (anon-executable,
 *    managed by the owner).
 *
 * Every value is validated before it is returned. Invalid or missing values
 * become null so callers hide the action instead of rendering placeholders.
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
  .regex(/^\+?\d{8,15}$/, "WhatsApp number must be digits with country code");

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const rpcConfigSchema = z.object({
  phone: z.string().nullish(),
  whatsapp: z.string().nullish(),
  email: z.string().nullish(),
  address_he: z.string().nullish(),
  address_en: z.string().nullish(),
  hours_he: z.string().nullish(),
  hours_en: z.string().nullish(),
});

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

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export async function getPublicContactConfig(): Promise<PublicContactConfig> {
  const config = emptyConfig();

  const envPhone = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim();
  const envWhatsapp = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP?.trim();
  const envEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  let rpc: z.infer<typeof rpcConfigSchema> | null = null;
  // The RPC also carries address/hours, so it is consulted unless every env
  // override is set. A failing RPC never breaks rendering - values stay null.
  if (!(envPhone && envWhatsapp && envEmail)) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.rpc("get_public_contact_config");
      if (!error) {
        const parsed = rpcConfigSchema.safeParse(data);
        if (parsed.success) rpc = parsed.data;
      }
    } catch (error) {
      console.error("get_public_contact_config RPC failed", error);
    }
  }

  const phone = phoneSchema.safeParse(firstText(envPhone, rpc?.phone));
  if (phone.success) {
    config.phone = phone.data;
    config.phoneHref = toTelHref(phone.data);
  }

  const whatsapp = whatsappSchema.safeParse(
    firstText(envWhatsapp, rpc?.whatsapp),
  );
  if (whatsapp.success) {
    config.whatsapp = toWhatsAppNumber(whatsapp.data);
  }

  const email = emailSchema.safeParse(firstText(envEmail, rpc?.email));
  if (email.success) {
    config.email = email.data;
  }

  config.addressHe = firstText(rpc?.address_he);
  config.addressEn = firstText(rpc?.address_en);
  config.hoursHe = firstText(rpc?.hours_he);
  config.hoursEn = firstText(rpc?.hours_en);

  return config;
}

export function toPublicContactActions(
  config: PublicContactConfig,
): PublicContactActions {
  return {
    phone: config.phone,
    phoneHref: config.phoneHref,
    whatsapp: config.whatsapp,
  };
}
