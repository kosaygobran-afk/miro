import { NextResponse } from "next/server";
import { z } from "zod";
import {
  withManagementAuth,
  errorResponse,
} from "@/app/api/management/_shared";

const analyticsParamsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  const auth = await withManagementAuth(request, "viewAnalytics");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = analyticsParamsSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return errorResponse("Invalid query params", 400, parsed.error.flatten());
  }

  const { admin } = auth;
  const { from, to } = parsed.data;

  try {
    // 1. Totals - using individual queries since exec_sql RPC doesn't exist
    const [
      { count: views },
      { data: sessionRows },
      { count: searches },
      { count: noResultSearches },
      { count: inquiries },
      { count: salesCount },
    ] = await Promise.all([
      admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .in("event_type", ["product_view", "product_impression"])
        .gte("created_at", from ?? "1970-01-01")
        .lte("created_at", to ?? "2999-12-31"),
      // unique sessions: count distinct session_id
      admin
        .from("analytics_events")
        .select("session_id")
        .in("event_type", ["product_view", "product_impression"])
        .not("session_id", "is", null)
        .gte("created_at", from ?? "1970-01-01")
        .lte("created_at", to ?? "2999-12-31")
        .limit(10000),
      admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "product_search")
        .gte("created_at", from ?? "1970-01-01")
        .lte("created_at", to ?? "2999-12-31"),
      admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "search_no_result")
        .gte("created_at", from ?? "1970-01-01")
        .lte("created_at", to ?? "2999-12-31"),
      admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .in("event_type", [
          "product_contact_click",
          "product_phone_click",
          "product_whatsapp_click",
          "product_inquiry",
        ])
        .gte("created_at", from ?? "1970-01-01")
        .lte("created_at", to ?? "2999-12-31"),
      admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "sale")
        .gte("created_at", from ?? "1970-01-01")
        .lte("created_at", to ?? "2999-12-31"),
    ]);

    // 2. Per-product table
    const { data: perProductData, error: perProductError } = await admin
      .from("analytics_events")
      .select("product_id, event_type, session_id")
      .in("event_type", [
        "product_view",
        "product_impression",
        "product_contact_click",
        "product_phone_click",
        "product_whatsapp_click",
        "product_inquiry",
      ])
      .gte("created_at", from ?? "1970-01-01")
      .lte("created_at", to ?? "2999-12-31");

    if (perProductError) {
      return errorResponse(perProductError.message);
    }

    const perProductMap = new Map<
      string,
      {
        views: number;
        uniqueViewers: number;
        inquiries: number;
        clicks: number;
      }
    >();
    (perProductData ?? []).forEach((row) => {
      const pid = row.product_id;
      if (!pid) return;
      const entry = perProductMap.get(pid) ?? {
        views: 0,
        uniqueViewers: 0,
        inquiries: 0,
        clicks: 0,
      };
      if (
        row.event_type === "product_view" ||
        row.event_type === "product_impression"
      ) {
        entry.views++;
      }
      if (
        [
          "product_contact_click",
          "product_phone_click",
          "product_whatsapp_click",
        ].includes(row.event_type)
      ) {
        entry.clicks++;
      }
      if (row.event_type === "product_inquiry") {
        entry.inquiries++;
      }
      perProductMap.set(pid, entry);
    });

    // Count unique viewers per product
    const viewEvents = (perProductData ?? []).filter(
      (r) =>
        r.event_type === "product_view" ||
        r.event_type === "product_impression",
    );
    const uniqueViewersMap = new Map<string, Set<string>>();
    viewEvents.forEach((r) => {
      if (r.product_id && r.session_id) {
        const set = uniqueViewersMap.get(r.product_id) ?? new Set();
        set.add(r.session_id);
        uniqueViewersMap.set(r.product_id, set);
      }
    });

    const perProduct = Array.from(perProductMap.entries()).map(
      ([productId, metrics]) => ({
        productId,
        views: metrics.views,
        uniqueViewers: uniqueViewersMap.get(productId)?.size ?? 0,
        inquiries: metrics.inquiries,
        clicks: metrics.clicks,
      }),
    );

    // 3. Per-search-term
    const { data: searchData, error: searchError } = await admin
      .from("analytics_events")
      .select("search_query, event_type, results_count")
      .in("event_type", ["product_search", "search_no_result"])
      .gte("created_at", from ?? "1970-01-01")
      .lte("created_at", to ?? "2999-12-31");

    if (searchError) {
      return errorResponse(searchError.message);
    }

    const searchMap = new Map<
      string,
      { searches: number; results: number; noResult: number }
    >();
    (searchData ?? []).forEach((row) => {
      const query = row.search_query ?? "(empty)";
      const entry = searchMap.get(query) ?? {
        searches: 0,
        results: 0,
        noResult: 0,
      };
      if (row.event_type === "product_search") {
        entry.searches++;
        entry.results += row.results_count ?? 0;
      } else {
        entry.noResult++;
      }
      searchMap.set(query, entry);
    });

    const perSearchTerm = Array.from(searchMap.entries())
      .map(([searchQuery, metrics]) => ({ searchQuery, ...metrics }))
      .sort((a, b) => b.searches - a.searches);

    // 4. Per-category views
    const { data: categoryData, error: categoryError } = await admin
      .from("analytics_events")
      .select("category_id, event_type")
      .eq("event_type", "category_view")
      .gte("created_at", from ?? "1970-01-01")
      .lte("created_at", to ?? "2999-12-31");

    if (categoryError) {
      return errorResponse(categoryError.message);
    }

    const categoryMap = new Map<string, number>();
    (categoryData ?? []).forEach((row) => {
      const cid = row.category_id ?? "unknown";
      categoryMap.set(cid, (categoryMap.get(cid) ?? 0) + 1);
    });

    const perCategory = Array.from(categoryMap.entries())
      .map(([categoryId, views]) => ({ categoryId, views }))
      .sort((a, b) => b.views - a.views);

    // 5. Daily series (using v_product_daily_metrics)
    const { data: dailyData, error: dailyError } = await admin
      .from("v_product_daily_metrics")
      .select("day, event_type, events, unique_sessions, unique_users")
      .gte("day", from ? from.split("T")[0] : "1970-01-01")
      .lte("day", to ? to.split("T")[0] : "2999-12-31")
      .order("day", { ascending: true });

    if (dailyError) {
      return errorResponse(dailyError.message);
    }

    const dailySeries = (dailyData ?? []).reduce<
      Record<
        string,
        Record<
          string,
          { events: number; uniqueSessions: number; uniqueUsers: number }
        >
      >
    >((acc, row) => {
      const day = row.day?.split("T")[0] ?? "unknown";
      if (!acc[day]) acc[day] = {};
      acc[day][row.event_type ?? "unknown"] = {
        events: row.events ?? 0,
        uniqueSessions: row.unique_sessions ?? 0,
        uniqueUsers: row.unique_users ?? 0,
      };
      return acc;
    }, {});

    return NextResponse.json({
      totals: {
        views: views ?? 0,
        uniqueSessions: new Set(
          (sessionRows ?? []).map((row) => row.session_id),
        ).size,
        searches: searches ?? 0,
        noResultSearches: noResultSearches ?? 0,
        inquiries: inquiries ?? 0,
        salesCount: salesCount ?? 0,
      },
      perProduct,
      perSearchTerm,
      perCategory,
      dailySeries,
    });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Analytics query failed",
    );
  }
}
