import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
// src/lib/contact-config.ts applies the env overlay on the public side.
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

type PublicContactFields = {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address_he: string | null;
  address_en: string | null;
  hours_he: string | null;
  hours_en: string | null;
};

function extractPublicContact(rows: { key: string; value: unknown }[]): {
  publicContact: PublicContactFields;
  rawContact: Record<string, unknown>;
} {
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
    publicContact: {
      phone: read("phone"),
      whatsapp: read("whatsapp"),
      email: read("email"),
      address_he: read("address_he"),
      address_en: read("address_en"),
      hours_he: read("hours_he"),
      hours_en: read("hours_en"),
    },
    rawContact,
  };
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error } = await admin
    .from("business_settings")
    .select("*")
    .order("key");

  if (error) {
    return mapPostgresError(error);
  }

  const { publicContact } = extractPublicContact(data ?? []);

  return NextResponse.json({
    settings: data ?? [],
    // Canonical business_settings.public_contact fields (DB value only; the
    // env overlay for the public storefront lives in src/lib/contact-config.ts).
    publicContact,
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

  if (!allowedSettingsKeys.includes(parsed.data.key)) {
    return errorResponse(
      `Unknown setting key. Allowed: ${allowedSettingsKeys.join(", ")}`,
      400,
    );
  }

  let valueToSave: Record<string, unknown> = parsed.data.value;

  if (parsed.data.key === "public_contact") {
    const contactParsed = publicContactSchema.safeParse(parsed.data.value);
    if (!contactParsed.success) {
      return errorResponse("Invalid input", 400, contactParsed.error.flatten());
    }

    // Partial merge: omitted fields keep their stored values; fields sent as
    // null or "" are removed.
    const { data: existingRows, error: readError } = await auth.admin
      .from("business_settings")
      .select("key, value");
    if (readError) {
      console.error(
        "settings POST read before merge failed:",
        readError.code,
        readError.message,
      );
      return errorResponse("Failed to save setting", 500);
    }
    const { rawContact } = extractPublicContact(existingRows ?? []);
    const cleaned: Record<string, unknown> = {};
    for (const [field, fieldValue] of Object.entries(contactParsed.data)) {
      if (fieldValue !== undefined) cleaned[field] = fieldValue;
    }
    valueToSave = { ...rawContact, ...cleaned };
  }

  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("set_business_setting", {
    p_key: parsed.data.key,
    p_value: valueToSave,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "CEO required to change business settings" },
        { status: 403 },
      );
    }
    console.error("set_business_setting failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Failed to save setting" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
