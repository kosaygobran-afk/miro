import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const taxRateSchema = z
  .object({
    name: z.string().min(1).max(100),
    rate: z.number().nonnegative().max(99.99),
    valid_from: z.string().date(),
    valid_until: z.string().date().nullish(),
  })
  .strict()
  .refine(
    (value) => !value.valid_until || value.valid_until >= value.valid_from,
    { message: "valid_until must not precede valid_from" },
  );

type TaxRateRow = {
  id: string;
  name: string;
  rate: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

type TaxRateStatus = "current" | "scheduled" | "historical";

// is_active is the enabled/not-cancelled flag (20260927220000): scheduling
// adjusts [valid_from, valid_until] windows and never flips it.
function deriveTaxRateStatus(row: TaxRateRow, today: string): TaxRateStatus {
  if (row.valid_from > today) return "scheduled";
  if (row.valid_until !== null && row.valid_until < today) return "historical";
  return row.is_active ? "current" : "historical";
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error } = await admin
    .from("tax_rates")
    .select("*")
    .order("valid_from", { ascending: false });

  if (error) {
    return mapPostgresError(error);
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());

  const taxRates = ((data ?? []) as TaxRateRow[]).map((rate) => ({
    ...rate,
    status: deriveTaxRateStatus(rate, today),
  }));

  return NextResponse.json({ taxRates });
}

export async function POST(request: Request) {
  const auth = await withManagementAuth(request, "manageTax");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = taxRateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid input", 400, parsed.error.flatten());
  }

  const client = await createServerSupabaseClient();
  // New 4-arg signature (migration 20260927220000): name, rate, valid_from,
  // optional valid_until; scheduling truncates/splits existing windows.
  const { data: taxRateId, error } = await client.rpc("set_tax_rate", {
    p_name: parsed.data.name,
    p_rate: parsed.data.rate,
    p_valid_from: parsed.data.valid_from,
    p_valid_until: parsed.data.valid_until ?? null,
  });

  if (error) {
    console.error("set_tax_rate failed:", error.code, error.message);
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "CEO required to change tax rate" },
        { status: 403 },
      );
    }
    if (error.code === "22023" || error.code === "23P01") {
      // 22023 is raised by set_tax_rate for residual overlap; 23P01 is the
      // tax_rates_no_overlap exclusion-constraint backstop for direct writes.
      if ((error.message ?? "").toLowerCase().includes("overlap")) {
        return NextResponse.json(
          { error: "Tax schedule overlaps an existing rate" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "Invalid rate value" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to save tax rate" },
      { status: 500 },
    );
  }

  return NextResponse.json({ taxRateId });
}
