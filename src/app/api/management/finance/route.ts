import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { channelDbValues } from "@/lib/sales-channel";

const financeParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  channel: z.enum(["all", "pos", "website"]).default("all"),
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
    channel_daily_series?: {
      day: string;
      channel: string;
      gross: number;
      net: number;
      orders: number;
    }[];
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

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewFinance");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = financeParamsSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { from, to, channel } = parsed.data;
  // An omitted range is the explicit "All" preset in the management UI.
  // Resolve it to the first order rather than 1970 so the comparison window
  // and database range remain bounded.
  let fromValue = from;
  if (!fromValue) {
    const { data: firstOrder, error: firstOrderError } = await auth.admin
      .from("orders")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstOrderError) return mapPostgresError(firstOrderError);
    fromValue = firstOrder?.created_at ?? new Date().toISOString();
  }
  const toValue = to ?? new Date().toISOString();

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

  // RPC authorizes via active_app_role(), which reads the caller's JWT and
  // is null under the service-role key — run it on the user-context client.
  const client = await createServerSupabaseClient();
  const { data: overviewResult, error: overviewError } = await client.rpc(
    "management_finance_overview",
    {
      p_from: fromValue,
      p_to: toValue,
      p_sources: channel !== "all" ? channelDbValues(channel) : null,
    },
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
  const response: {
    range: {
      from: string;
      to: string;
      generatedAt: string;
      channel: "all" | "pos" | "website";
    };
    totals: {
      revenueGross: number;
      revenueNet: number;
      vatTotal: number;
      cogs: number;
      grossProfit: number;
      margin: number;
      discounts: number;
      unitsSold: number;
      orderCount: number;
      inventoryValue: number;
      inventoryUnits: number;
    };
    dailySeries: { day: string; gross: number; net: number; orders: number }[];
    previous: {
      range: { from: string; to: string };
      totals: {
        revenueGross: number;
        revenueNet: number;
        vatTotal: number;
        cogs: number;
        grossProfit: number;
        margin: number;
        discounts: number;
        unitsSold: number;
        orderCount: number;
        inventoryValue: number;
        inventoryUnits: number;
      };
    };
    channelDailySeries?: {
      day: string;
      channel: string;
      gross: number;
      net: number;
      orders: number;
    }[];
  } = {
    range: {
      from: current.from,
      to: current.to,
      generatedAt: overview.generated_at,
      channel,
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
  };

  // When channel is 'all', include the channel_daily_series in the response
  if (channel === "all" && current.channel_daily_series) {
    response.channelDailySeries = current.channel_daily_series.map((d) => ({
      day: d.day,
      channel: d.channel,
      gross: toNumber(d.gross),
      net: toNumber(d.net),
      orders: toNumber(d.orders),
    }));
  }

  return NextResponse.json(response);
}
