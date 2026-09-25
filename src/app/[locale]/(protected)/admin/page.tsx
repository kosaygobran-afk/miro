import { createAdminClient } from "@/lib/supabase/admin";
import { isLocale, type Locale } from "@/lib/i18n";
import { OverviewPanel } from "@/components/management/overview-panel";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin");

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.warn("Failed to create Supabase admin client:", error);
    admin = null;
  }

  if (!admin) {
    // Return a fallback page with empty data when admin client is not available (e.g., during build without SUPABASE_SERVICE_ROLE_KEY)
    return (
      <OverviewPanel
        locale={safeLocale}
        stats={{
          products: { active: 0, draft: 0, archived: 0 },
          lowStockCount: 0,
          outOfStockCount: 0,
          inventoryUnits: 0,
          inventoryValue: 0,
          salesToday: { revenue: 0, net: 0, vat: 0 },
          salesWeek: { revenue: 0, net: 0, vat: 0 },
          salesMonth: { revenue: 0, net: 0, vat: 0 },
          analytics: { product_view: 0, product_search: 0, product_inquiry: 0 },
        }}
        recentAuditEvents={[]}
        recentStockMovements={[]}
        hasErrors={false}
      />
    );
  }

  // Pre-compute date boundaries to avoid impure Date.now() in render
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const startOfWeek = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const weekAgo = startOfWeek; // same as startOfWeek for analytics

  // Products by status
  const [
    { data: productsByStatus, error: statusError },
    { data: lowStockVariantsData, error: lowStockError },
    { count: outOfStockVariantsCount, error: oosError },
    { data: inventoryAgg, error: invError },
    { data: salesToday, error: salesTodayError },
    { data: salesWeek, error: salesWeekError },
    { data: salesMonth, error: salesMonthError },
    { data: recentAuditEventsRaw, error: auditError },
    { data: recentStockMovementsRaw, error: movementsError },
    { data: analyticsEvents, error: analyticsError },
  ] = await Promise.all([
    // Products by status
    admin.from("products").select("status", { count: "exact" }),
    // Low stock variants (stock_qty <= low_stock_threshold) - fetch and filter in memory
    admin.from("product_variants").select("id, stock_qty, low_stock_threshold"),
    // Out of stock variants (count)
    admin
      .from("product_variants")
      .select("product_id", { count: "exact", head: true })
      .eq("stock_qty", 0)
      .eq("is_active", true),
    // Inventory units + value (cost via parent product FK join)
    admin
      .from("product_variants")
      .select(
        "stock_qty, cost_override, products!product_variants_product_id_fkey(purchase_cost)",
      ),
    // Sales today
    admin
      .from("orders")
      .select("total, net_total, vat_total")
      .not("status", "in", "('cancelled','refunded')")
      .gte("created_at", startOfToday),
    // Sales this week
    admin
      .from("orders")
      .select("total, net_total, vat_total")
      .not("status", "in", "('cancelled','refunded')")
      .gte("created_at", startOfWeek),
    // Sales this month
    admin
      .from("orders")
      .select("total, net_total, vat_total")
      .not("status", "in", "('cancelled','refunded')")
      .gte("created_at", startOfMonth),
    // Recent audit events (10) - fetch user_id separately, join profiles in memory
    admin
      .from("audit_events")
      .select("id, action, user_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    // Recent stock movements (10) - simplified to avoid FK join issues
    admin
      .from("stock_movements")
      .select(
        "id, delta, type, reference, note, resulting_qty, created_at, variant_id",
      )
      .order("created_at", { ascending: false })
      .limit(10),
    // Analytics events for last 7 days
    admin
      .from("analytics_events")
      .select("event_type")
      .in("event_type", ["product_view", "product_search", "product_inquiry"])
      .gte("created_at", weekAgo),
  ]);

  // Process products by status counts
  const statusCounts = {
    active: 0,
    draft: 0,
    archived: 0,
  };
  if (productsByStatus) {
    for (const p of productsByStatus) {
      if (p.status === "active") statusCounts.active++;
      else if (p.status === "draft") statusCounts.draft++;
      else if (p.status === "archived") statusCounts.archived++;
    }
  }

  // Low stock count - filter in memory
  const lowStockCount =
    lowStockVariantsData?.filter(
      (v: { stock_qty: number; low_stock_threshold: number }) =>
        v.stock_qty <= v.low_stock_threshold,
    ).length ?? 0;
  const outOfStockCount = outOfStockVariantsCount ?? 0;

  // Calculate inventory totals
  let totalUnits = 0;
  let totalValue = 0;
  if (inventoryAgg) {
    for (const v of inventoryAgg) {
      const product = Array.isArray(v.products) ? v.products[0] : v.products;
      const qty = v.stock_qty ?? 0;
      const cost = v.cost_override ?? product?.purchase_cost ?? 0;
      totalUnits += qty;
      totalValue += qty * cost;
    }
  }

  // Sales aggregation
  const sumSales = (
    orders:
      | { total: number; net_total: number | null; vat_total: number | null }[]
      | null,
  ) => {
    if (!orders) return { revenue: 0, net: 0, vat: 0 };
    return orders.reduce(
      (acc, o) => ({
        revenue: acc.revenue + (o.total ?? 0),
        net: acc.net + (o.net_total ?? 0),
        vat: acc.vat + (o.vat_total ?? 0),
      }),
      { revenue: 0, net: 0, vat: 0 },
    );
  };

  const salesTodayAgg = sumSales(salesToday);
  const salesWeekAgg = sumSales(salesWeek);
  const salesMonthAgg = sumSales(salesMonth);

  // Analytics events by type
  const analyticsByType = {
    product_view: 0,
    product_search: 0,
    product_inquiry: 0,
  };
  if (analyticsEvents) {
    for (const e of analyticsEvents) {
      if (e.event_type in analyticsByType) {
        analyticsByType[e.event_type as keyof typeof analyticsByType]++;
      }
    }
  }

  // Transform audit events to match AuditEvent type (profiles joined in memory if needed)
  const recentAuditEvents = (recentAuditEventsRaw ?? []).map(
    (event: {
      id: string;
      action: string;
      user_id: string;
      details: Record<string, unknown>;
      created_at: string;
    }) => ({
      ...event,
      profiles: null, // profile join removed to avoid invalid PostgREST FK reference
    }),
  );

  // Transform stock movements to match StockMovement type (simplified, no nested joins)
  const recentStockMovements = (recentStockMovementsRaw ?? []).map(
    (movement: {
      id: string;
      delta: number;
      type: string;
      reference: string | null;
      note: string | null;
      resulting_qty: number;
      created_at: string;
      variant_id: string;
    }) => ({
      ...movement,
      product_variants: null, // FK joins removed to avoid PostgREST FK name issues
    }),
  );

  const errors = [
    statusError,
    lowStockError,
    oosError,
    invError,
    salesTodayError,
    salesWeekError,
    salesMonthError,
    auditError,
    movementsError,
    analyticsError,
  ].filter(Boolean);

  return (
    <OverviewPanel
      locale={safeLocale}
      stats={{
        products: statusCounts,
        lowStockCount,
        outOfStockCount,
        inventoryUnits: totalUnits,
        inventoryValue: totalValue,
        salesToday: salesTodayAgg,
        salesWeek: salesWeekAgg,
        salesMonth: salesMonthAgg,
        analytics: analyticsByType,
      }}
      recentAuditEvents={recentAuditEvents}
      recentStockMovements={recentStockMovements}
      hasErrors={errors.length > 0}
    />
  );
}
