import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { PAYMENT_METHODS } from "@/lib/sales-channel";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  // Rate limit management read endpoints per IP
  const rateLimit = await checkManagementRateLimit(
    auth.admin,
    getClientIp(request),
  );
  if (rateLimit === "error") {
    return errorResponse("Unable to process request", 503);
  }
  if (rateLimit === "limited") {
    return NextResponse.json(
      { error: "Too many requests", code: "rate_limited" },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      method: z.enum(PAYMENT_METHODS).optional(),
      "payment-status": z
        .enum(["pending", "paid", "voided", "refunded"])
        .optional(),
      cashier: z.string().uuid().optional(),
      search: z.string().max(120).optional(),
      limit: z.coerce.number().int().positive().max(100).default(50),
      offset: z.coerce.number().int().nonnegative().default(0),
    })
    .safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const {
    from,
    to,
    method,
    "payment-status": paymentStatus,
    cashier,
    search,
    limit,
    offset,
  } = parsed.data;
  const { admin } = auth;

  const { data, error } = await admin
    .rpc("management_pos_accounts", {
      p_from: from ?? null,
      p_to: to ?? null,
      p_method: method ?? null,
      p_status: paymentStatus ?? null,
      p_cashier: cashier ?? null,
      p_search: search ?? null,
      p_limit: limit,
      p_offset: offset,
    })
    .single<{
      orders: Array<{
        id: string;
        order_number: string;
        status: string;
        currency: string;
        customer_name: string;
        customer_email: string;
        customer_phone: string | null;
        user_id: string | null;
        recorded_by: string;
        source: string;
        subtotal: number;
        vat_total: number;
        total: number;
        net_total: number;
        shipping_cost: number | null;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      summary: {
        total_orders: number;
        total_gross: number;
        total_net: number;
        total_vat: number;
      };
      total_count: number;
    }>();

  if (error) {
    return errorResponse("Unable to load POS accounts", 500);
  }

  return NextResponse.json({
    orders: data?.orders ?? [],
    summary: data?.summary ?? {
      total_orders: 0,
      total_gross: 0,
      total_net: 0,
      total_vat: 0,
    },
    totalCount: data?.total_count ?? 0,
    limit,
    offset,
  });
}
