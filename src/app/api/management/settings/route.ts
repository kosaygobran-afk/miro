import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";

const settingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.record(z.string(), z.unknown()),
});

const allowedSettingsKeys = [
  "inventory_defaults",
  "finance",
  "storefront",
  "notifications",
];

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error } = await admin
    .from("business_settings")
    .select("*")
    .order("key");

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ settings: data ?? [] });
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

  const { admin } = auth;
  const { error } = await admin.rpc("set_business_setting", {
    p_key: parsed.data.key,
    p_value: parsed.data.value,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "CEO required to change business settings" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
