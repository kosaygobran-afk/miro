import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const taxRateSchema = z.object({
  name: z.string().min(1).max(100),
  rate: z.number().nonnegative().max(99.99),
  valid_from: z.string().date(),
});

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { admin } = auth;
  const { data, error } = await admin
    .from("tax_rates")
    .select("*")
    .order("valid_from", { ascending: false });

  if (error) {
    return errorResponse(error.message);
  }

  return NextResponse.json({ taxRates: data ?? [] });
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
  const { data: taxRateId, error } = await client.rpc("set_tax_rate", {
    p_name: parsed.data.name,
    p_rate: parsed.data.rate,
    p_valid_from: parsed.data.valid_from,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "CEO required to change tax rate" },
        { status: 403 },
      );
    }
    if (error.code === "22023") {
      return NextResponse.json(
        { error: "Invalid rate value" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ taxRateId });
}
