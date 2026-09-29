import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const financeParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

type FinanceOverview = {
  from: string;
  to: string;
  generated_at: string;
  current: {
    from: string;
    to: string;
    gross_total: number;
    net_total: number;
    vat_total: number;
    orders_count: number;
    items_count: number;
    cogs_total: number;
    gross_profit: number;
    gross_margin_pct: number;
    discounts_total: number;
    inventory_value: number;
    inventory_units: number;
    daily_series: { day: string; gross: number; net: number; orders: number }[];
  };
  previous: {
    from: string;
    to: string;
    gross_total: number;
    net_total: number;
    vat_total: number;
    orders_count: number;
    items_count: number;
    cogs_total: number;
    gross_profit: number;
    gross_margin_pct: number;
    discounts_total: number;
    inventory_value: number;
    inventory_units: number;
    daily_series: { day: string; gross: number; net: number; orders: number }[];
  };
};

function toNumber(value: unknown): number {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : 0;
}

// Per-IP rate limiting for management read endpoints (tiered: 60/min, 300/hour)
async function checkManagementReadRateLimit(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  ip: string,
): Promise<"ok" | "limited" | "error"> {
  const buckets = [
    { key: `mgmt:read:ip:1m:${ip}`, limit: 60, window: "1 minute" },
    { key: `mgmt:read:ip:1h:${ip}`, limit: 300, window: "1 hour" },
  ] as const;
  for (const bucket of buckets) {
    const { data: allowed, error } = await admin.rpc("check_rate_limit", {
      p_key: bucket.key,
      p_limit: bucket.limit,
      p_window: bucket.window,
    });
    if (error) {
      console.error("check_rate_limit failed:", error.code, error.message);
      return "error";
    }
    if (allowed !== true) return "limited";
  }
  return "ok";
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  // Rate limit management read endpoints per IP
  const rateLimit = await checkManagementReadRateLimit(
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
  const parsed = financeParamsSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  // An omitted range is the explicit "All" preset in the management UI.
  // Resolve it to the first order rather than 1970 so the comparison window
  // and database range remain bounded.
  let from = parsed.data.from;
  if (!from) {
    const { data: firstOrder, error: firstOrderError } = await auth.admin
      .from("orders")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstOrderError) return mapPostgresError(firstOrderError);
    from = firstOrder?.created_at ?? new Date().toISOString();
  }
  const to = parsed.data.to ?? new Date().toISOString();

  // RPC authorizes via active_app_role(), which reads the caller's JWT and
  // is null under the service-role key — run it on the user-context client.
  const client = await createServerSupabaseClient();
  const { data: overviewResult, error: overviewError } = await client.rpc(
    "management_finance_overview",
    { p_from: from, p_to: to },
  );

  if (overviewError) {
    return mapPostgresError(overviewError);
  }

  const overview = overviewResult as unknown as FinanceOverview;
  const current = overview?.current;
  const previous = overview?.previous;
  if (!current || !previous) {
    console.error("management_finance_overview returned incomplete data");
    return errorResponse("Finance query failed", 500);
  }

  // Flatten to the shape the UI expects
  return NextResponse.json({
    range: {
      from: current.from,
      to: current.to,
      generatedAt: overview.generated_at,
    },
    totals: {
      revenueGross: toNumber(current.gross_total),
      revenueNet: toNumber(current.net_total),
      vatTotal: toNumber(current.vat_total),
      cogs: toNumber(current.cogs_total),
      grossProfit: toNumber(current.gross_profit),
      margin: toNumber(current.gross_margin_pct) / 100,
      discounts: toNumber(current.discounts_total),
      unitsSold: toNumber(current.items_count),
      orderCount: toNumber(current.orders_count),
      inventoryValue: toNumber(current.inventory_value),
      inventoryUnits: toNumber(current.inventory_units),
    },
    dailySeries: (current.daily_series ?? []).map((d) => ({
      day: d.day,
      gross: toNumber(d.gross),
      net: toNumber(d.net),
      orders: toNumber(d.orders),
    })),
    // Previous period for comparison
    previous: {
      range: {
        from: previous.from,
        to: previous.to,
      },
      totals: {
        revenueGross: toNumber(previous.gross_total),
        revenueNet: toNumber(previous.net_total),
        vatTotal: toNumber(previous.vat_total),
        cogs: toNumber(previous.cogs_total),
        grossProfit: toNumber(previous.gross_profit),
        margin: toNumber(previous.gross_margin_pct) / 100,
        discounts: toNumber(previous.discounts_total),
        unitsSold: toNumber(previous.items_count),
        orderCount: toNumber(previous.orders_count),
        inventoryValue: toNumber(previous.inventory_value),
        inventoryUnits: toNumber(previous.inventory_units),
      },
    },
  });
}
