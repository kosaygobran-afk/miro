import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  withManagementAuth,
  errorResponse,
  checkManagementRateLimit,
  getClientIp,
  tooManyRequests,
} from "@/app/api/management/_shared";

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
    return tooManyRequests();
  }

  const { searchParams } = new URL(request.url);
  const parsed = z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      method: z
        .enum(["cash", "credit_card", "bank_transfer", "bit", "check", "other"])
        .optional(),
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
  const now = new Date().toISOString();
  const fromValue = from ?? new Date(0).toISOString();
  const toValue = to ?? now;
  if (Date.parse(fromValue) > Date.parse(toValue)) {
    return errorResponse("Invalid date range", 400);
  }
  // The RPC checks active_app_role()/auth.uid(); retain the actor's JWT.
  const client = await createServerSupabaseClient();

  const { data, error } = await client
    .rpc("management_pos_accounts", {
      p_from: fromValue,
      p_to: toValue,
      p_method: method ?? null,
      p_status: paymentStatus ?? null,
      p_cashier: cashier ?? null,
      p_search: search ?? null,
      p_limit: limit,
      p_offset: offset,
    })
    .single<{
      orders: Array<{
        order_id: string;
        order_number: string;
        created_at: string;
        status: string;
        source: string;
        customer_name: string;
        customer_email: string;
        customer_phone: string | null;
        user_id: string | null;
        recorded_by: string;
        recorded_by_name: string | null;
        items_count: number;
        units_count: number;
        subtotal_net: number;
        discount: number;
        net_total: number;
        vat_total: number;
        total: number;
        payments: {
          payment_method: string;
          amount: number;
          installments: number | null;
          payment_status: string;
          external_reference: string | null;
          paid_at: string | null;
        }[];
      }>;
      summary: {
        transaction_count: number;
        revenue: number;
        units_sold: number;
        avg_ticket: number;
        by_method: Record<string, number>;
      };
      total_count: number;
    }>();

  if (error) {
    return errorResponse("Unable to load POS accounts", 500);
  }

  // Transform to the shape expected by the dashboard (AccountsResponse)
  // and include 'totals' for the useManagementReport hook validation
  const response = {
    range: {
      from: fromValue,
      to: toValue,
      generatedAt: now,
    },
    totals: data?.summary ?? {
      transaction_count: 0,
      revenue: 0,
      units_sold: 0,
      avg_ticket: 0,
      by_method: {},
    },
    orders: data?.orders ?? [],
    summary: data?.summary ?? {
      transaction_count: 0,
      revenue: 0,
      units_sold: 0,
      avg_ticket: 0,
      by_method: {},
    },
    total_count: data?.total_count ?? 0,
    limit,
    offset,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
