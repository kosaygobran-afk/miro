import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PUBLIC_CONTACT_CONFIG_TAG } from "@/lib/public-presentation-cache";
import { getPublicContactEnvironmentFallbacks } from "@/lib/contact-config";

const settingSchema = z
  .object({
    key: z.string().min(1).max(100),
    value: z.record(z.string(), z.unknown()),
  })
  .strict();

const allowedSettingsKeys = [
  "inventory_defaults",
  "finance",
  "storefront",
  "notifications",
  "public_contact",
];

// Per-field validation for the public_contact business setting. This row is
// the canonical source surfaced publicly via get_public_contact_config();
// src/lib/contact-config.ts applies the deployment fallback on the public side.
const removableString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    schema.nullish(),
  );

const publicContactSchema = z
  .object({
    phone: removableString(
      z
        .string()
        .trim()
        .max(20)
        .regex(/^\+?[0-9]{6,15}$/, "Invalid phone format"),
    ),
    whatsapp: removableString(
      z
        .string()
        .trim()
        .regex(/^\d{7,15}$/, "Invalid WhatsApp number"),
    ),
    email: removableString(z.string().trim().toLowerCase().email().max(254)),
    address_he: removableString(z.string().trim().min(1).max(300)),
    address_en: removableString(z.string().trim().min(1).max(300)),
    hours_he: removableString(z.string().trim().min(1).max(200)),
    hours_en: removableString(z.string().trim().min(1).max(200)),
  })
  .strict();

// Inventory defaults validation schema
// The global default out_of_stock_policy must be a RESOLVED value (not "inherit")
// since it's the fallback for products that use "inherit".
const inventoryDefaultsSchema = z
  .object({
    low_stock_threshold: z.number().int().min(0).max(10000).optional(),
    out_of_stock_policy: z
      .enum([
        "keep_visible_contact",
        "keep_visible_restock",
        "hide_from_public",
      ])
      .optional(),
  })
  .strict();

type PublicContactFields = {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address_he: string | null;
  address_en: string | null;
  hours_he: string | null;
  hours_en: string | null;
};

function extractPublicContact(
  rows: { key: string; value: unknown }[],
): PublicContactFields {
  const row = rows.find((entry) => entry.key === "public_contact");
  const rawContact =
    row && typeof row.value === "object" && row.value !== null
      ? (row.value as Record<string, unknown>)
      : {};
  const read = (field: keyof PublicContactFields) =>
    typeof rawContact[field] === "string"
      ? (rawContact[field] as string)
      : null;
  return {
    phone: read("phone"),
    whatsapp: read("whatsapp"),
    email: read("email"),
    address_he: read("address_he"),
    address_en: read("address_en"),
    hours_he: read("hours_he"),
    hours_en: read("hours_en"),
  };
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error } = await admin
    .from("business_settings")
    .select("*")
    .in("key", allowedSettingsKeys)
    .order("key");

  if (error) {
    return mapPostgresError(error);
  }

  return NextResponse.json({
    settings: data ?? [],
    // Canonical business_settings.public_contact fields (DB value only; the
    // deployed fallback for the storefront lives in src/lib/contact-config.ts).
    publicContact: extractPublicContact(data ?? []),
    publicContactFallbacks: getPublicContactEnvironmentFallbacks(),
    // MIRO sells in ILS only; the stored finance.currency value is cosmetic
    // configuration, so the UI must not offer a live currency picker.
    currencySupport: "ils_only",
    // Recorded but currently not wired into price/tax computation; the UI
    // should label it as informational only.
    pricesIncludeVatMode: "informational",
  });
}

export async function POST(request: Request) {
  // Only CEO can change settings (manageSettings capability)
  const auth = await withManagementAuth(request, "manageSettings");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = settingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const { key, value } = parsed.data;
  if (!allowedSettingsKeys.includes(key)) {
    return errorResponse(
      `Unknown setting key. Allowed: ${allowedSettingsKeys.join(", ")}`,
      400,
    );
  }

  const schema =
    key === "public_contact"
      ? publicContactSchema
      : key === "inventory_defaults"
        ? inventoryDefaultsSchema
        : null;
  const patch = schema?.safeParse(value);
  if (patch && !patch.success) {
    return errorResponse("Invalid input", 400, patch.error.flatten());
  }

  const client = await createServerSupabaseClient();
  const { data, error } = patch
    ? await client.rpc("patch_business_setting", {
        p_key: key,
        p_patch: patch.data,
      })
    : await client.rpc("set_business_setting", { p_key: key, p_value: value });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "CEO required to change business settings" },
        { status: 403 },
      );
    }
    if (error.code === "22023" && patch) {
      return errorResponse("Invalid input", 400);
    }
    console.error("business setting save failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to save setting" },
      { status: 500 },
    );
  }

  if (key === "public_contact") {
    revalidateTag(PUBLIC_CONTACT_CONFIG_TAG, { expire: 0 });
    return NextResponse.json({
      ok: true,
      value: data,
      publicContactFallbacks: getPublicContactEnvironmentFallbacks(),
    });
  }
  return patch
    ? NextResponse.json({ ok: true, value: data })
    : NextResponse.json({ ok: true });
}
