import { aggregateDailyEvents } from "@/lib/analytics-daily";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
  mapPostgresError,
} from "@/app/api/management/_shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const analyticsParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Overview counters are produced by the management_analytics_overview RPC;
// these interfaces mirror its documented output (snake_case jsonb).
type AnalyticsOverview = {
  from: string;
  to: string;
  generated_at: string;
  totals: {
    unique_sessions: number;
    product_views: number;
    product_impressions: number;
    searches: number;
    no_result_searches: number;
    contact_clicks: {
      contact: number;
      phone: number;
      whatsapp: number;
      total: number;
    };
    product_inquiries: number;
    service_requests: number;
  };
  top_products: {
    product_id: string | null;
    slug: string | null;
    name_he: string | null;
    name_en: string | null;
    views: number;
  }[];
  top_categories: {
    category_id: string | null;
    slug: string | null;
    name_he: string | null;
    name_en: string | null;
    views: number;
  }[];
  top_searches: { query: string; searches: number }[];
};

type SalesSummary = {
  current: { orders_count: number } | null;
};

// Bound for the per-product unique-viewer session fetch. The aggregation
// RPC intentionally has no per-product detail; a fuller per-product
// breakdown should become a dedicated RPC (DB follow-up).
const UNIQUE_VIEWER_ROW_CAP = 5000;

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
  const auth = await withManagementAuth(request, "viewAnalytics");
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
  const parsed = analyticsParamsSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const from = parsed.data.from ?? "1970-01-01T00:00:00.000Z";
  const to = parsed.data.to ?? new Date().toISOString();

  // RPCs authorize via active_app_role(), which reads the caller's JWT and
  // is null under the service-role key — run them on the user-context
  // client. Bounded table reads stay on the admin client.
  const client = await createServerSupabaseClient();
  const [overviewResult, summaryResult] = await Promise.all([
    client.rpc("management_analytics_overview", { p_from: from, p_to: to }),
    client.rpc("management_sales_summary", { p_from: from, p_to: to }),
  ]);

  if (overviewResult.error) {
    return mapPostgresError(overviewResult.error);
  }
  const overview = overviewResult.data as unknown as AnalyticsOverview;
  const totals = overview?.totals;
  if (!totals) {
    console.error("management_analytics_overview returned no totals");
    return errorResponse("Analytics query failed", 500);
  }

  // Sales counters must never come from analytics 'sale' events; they are
  // sourced from orders via management_sales_summary only. Treat summary
  // failure as non-fatal so the engagement overview still renders.
  let salesCount: number | null = null;
  if (summaryResult.error) {
    console.error(
      "management_sales_summary failed:",
      summaryResult.error.code,
      summaryResult.error.message,
    );
  } else {
    const summary = summaryResult.data as unknown as SalesSummary;
    salesCount = summary?.current ? toNumber(summary.current.orders_count) : 0;
  }

  // Per-product detail is NOT covered by the overview RPC (it returns only
  // the top-10 products by views). Exact counts per top product come from
  // count-exact head queries; unique viewers need a distinct session count
  // and are computed from a capped session fetch.
  const topProducts = (overview.top_products ?? []).filter(
    (entry): entry is typeof entry & { product_id: string } =>
      Boolean(entry.product_id),
  );
  const clickTypes = [
    "product_contact_click",
    "product_phone_click",
    "product_whatsapp_click",
  ];

  const { admin } = auth;

  let uniqueViewersCapped = false;
  let perProduct: {
    productId: string;
    slug: string | null;
    name: { he: string | null; en: string | null };
    category: {
      id: string;
      slug: string | null;
      name_he: string | null;
      name_en: string | null;
    } | null;
    views: number;
    uniqueViewers: number;
    contactClicks: number;
    enquiries: number;
    conversion: number;
  }[];
  try {
    const productIds = topProducts.map((entry) => entry.product_id);
    const categoryByProduct = new Map<
      string,
      {
        id: string;
        slug: string | null;
        name_he: string | null;
        name_en: string | null;
      } | null
    >();
    if (productIds.length > 0) {
      const { data: productRows, error: productError } = await admin
        .from("products")
        .select(
          "id, category_id, categories:category_id (slug, name_he, name_en)",
        )
        .in("id", productIds);
      if (productError) throw productError;
      for (const row of (productRows ?? []) as unknown as {
        id: string;
        category_id: string | null;
        categories: {
          slug: string | null;
          name_he: string | null;
          name_en: string | null;
        } | null;
      }[]) {
        categoryByProduct.set(
          row.id,
          row.categories && row.category_id
            ? { id: row.category_id, ...row.categories }
            : null,
        );
      }
    }

    perProduct = await Promise.all(
      topProducts.map(async (entry) => {
        const productId = entry.product_id;
        const [clicksResult, enquiriesResult, sessionsResult] =
          await Promise.all([
            admin
              .from("analytics_events")
              .select("id", { count: "exact", head: true })
              .eq("product_id", productId)
              .in("event_type", clickTypes)
              .gte("created_at", from)
              .lte("created_at", to),
            admin
              .from("service_requests")
              .select("id", { count: "exact", head: true })
              .eq("product_id", productId)
              .gte("created_at", from)
              .lte("created_at", to),
            admin
              .from("analytics_events")
              .select("session_id")
              .eq("product_id", productId)
              .eq("event_type", "product_view")
              .not("session_id", "is", null)
              .gte("created_at", from)
              .lte("created_at", to)
              .limit(UNIQUE_VIEWER_ROW_CAP),
          ]);
        if (clicksResult.error) throw clicksResult.error;
        if (enquiriesResult.error) throw enquiriesResult.error;
        if (sessionsResult.error) throw sessionsResult.error;

        const sessions = (sessionsResult.data ?? []) as unknown as {
          session_id: string | null;
        }[];
        if (sessions.length >= UNIQUE_VIEWER_ROW_CAP)
          uniqueViewersCapped = true;
        const uniqueViewers = new Set(
          sessions.map((row) => row.session_id).filter(Boolean),
        ).size;
        const views = toNumber(entry.views);
        const contactClicks = clicksResult.count ?? 0;
        const enquiries = enquiriesResult.count ?? 0;

        return {
          productId,
          slug: entry.slug,
          name: { he: entry.name_he, en: entry.name_en },
          category: categoryByProduct.get(productId) ?? null,
          views,
          uniqueViewers,
          contactClicks,
          enquiries,
          conversion: views > 0 ? enquiries / views : 0,
        };
      }),
    );
  } catch (err) {
    return mapPostgresError(err as { code?: string; message?: string });
  }

  // Daily series: keeps reading the pre-aggregated v_product_daily_metrics
  // view (bounded by the date window; no raw-event scan).
  const { data: dailyData, error: dailyError } = await admin
    .from("v_product_daily_metrics")
    .select("day, event_type, events, unique_sessions, unique_users")
    .gte("day", from.split("T")[0])
    .lte("day", to.split("T")[0])
    .order("day", { ascending: true });
  if (dailyError) return mapPostgresError(dailyError);

  const dailySeries = aggregateDailyEvents(dailyData ?? []);

  const uniqueSessions = toNumber(totals.unique_sessions);
  const enquiriesSubmitted = toNumber(totals.service_requests);

  return NextResponse.json({
    range: {
      from: overview.from,
      to: overview.to,
      generatedAt: overview.generated_at,
    },
    totals: {
      views: toNumber(totals.product_views),
      impressions: toNumber(totals.product_impressions),
      uniqueSessions,
      searches: toNumber(totals.searches),
      noResultSearches: toNumber(totals.no_result_searches),
      contactClicks: {
        contact: toNumber(totals.contact_clicks?.contact),
        phone: toNumber(totals.contact_clicks?.phone),
        whatsapp: toNumber(totals.contact_clicks?.whatsapp),
        total: toNumber(totals.contact_clicks?.total),
      },
      productInquiries: toNumber(totals.product_inquiries),
      enquiriesSubmitted,
      enquiryConversionRate:
        uniqueSessions > 0 ? enquiriesSubmitted / uniqueSessions : 0,
      salesCount,
    },
    perProduct,
    perSearchTerm: (overview.top_searches ?? []).map((entry) => ({
      searchQuery: entry.query,
      searches: toNumber(entry.searches),
    })),
    perCategory: (overview.top_categories ?? []).map((entry) => ({
      categoryId: entry.category_id,
      slug: entry.slug,
      name: { he: entry.name_he, en: entry.name_en },
      views: toNumber(entry.views),
    })),
    dailySeries,
    partial: { uniqueViewersCapped },
  });
}
