import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  OverviewPanel,
  type ActivityEntry,
  type AttentionData,
  type PanelState,
  type RecentSale,
  type SalesBucket,
  type TopMover,
} from "@/components/management/overview-panel";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin");

const STALE_ENQUIRY_AGE_MS = 48 * 60 * 60 * 1000;
const TOP_MOVER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_MOVER_MOVEMENT_CAP = 500;
const TOP_MOVER_LIMIT = 5;
const RECENT_LIMIT = 8;

type OrderRow = {
  total: number | null;
  net_total: number | null;
  vat_total: number | null;
};

function emptyPanel<T>(): PanelState<T> {
  return { data: null, error: true };
}

function sumOrders(rows: OrderRow[] | null): SalesBucket {
  return (rows ?? []).reduce<SalesBucket>(
    (acc, row) => ({
      revenue: acc.revenue + (row.total ?? 0),
      net: acc.net + (row.net_total ?? 0),
      vat: acc.vat + (row.vat_total ?? 0),
      count: acc.count + 1,
    }),
    { revenue: 0, net: 0, vat: 0, count: 0 },
  );
}

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  // All dashboard dates are computed here server-side so the render stays pure.
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString();
  const staleBefore = new Date(
    now.getTime() - STALE_ENQUIRY_AGE_MS,
  ).toISOString();
  const moverWindowStart = new Date(
    now.getTime() - TOP_MOVER_WINDOW_MS,
  ).toISOString();

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.warn("Failed to create Supabase admin client:", error);
    admin = null;
  }

  if (!admin) {
    // Data load is unavailable (e.g. missing service role key): report every
    // panel as failed rather than rendering fake zero metrics.
    return (
      <OverviewPanel
        locale={safeLocale}
        nowIso={now.toISOString()}
        kpis={emptyPanel()}
        attention={emptyPanel()}
        operations={emptyPanel()}
        activity={emptyPanel()}
      />
    );
  }

  const [
    ordersTodayResult,
    ordersMonthResult,
    draftCountResult,
    newEnquiriesResult,
    staleEnquiriesResult,
    activeVariantsResult,
    inventoryAggResult,
    recentSalesResult,
    movementsResult,
    auditEventsResult,
  ] = await Promise.all([
    admin
      .from("orders")
      .select("total, net_total, vat_total")
      .not("status", "in", "('cancelled','refunded')")
      .gte("created_at", startOfToday),
    admin
      .from("orders")
      .select("total, net_total, vat_total")
      .not("status", "in", "('cancelled','refunded')")
      .gte("created_at", startOfMonth),
    admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    admin
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    admin
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .lte("created_at", staleBefore),
    admin
      .from("product_variants")
      .select("id, stock_qty, low_stock_threshold")
      .eq("is_active", true),
    admin
      .from("product_variants")
      .select(
        "stock_qty, cost_override, products!product_variants_product_id_fkey(purchase_cost)",
      ),
    admin
      .from("orders")
      .select("id, order_number, customer_name, total, recorded_by, created_at")
      .not("status", "in", "('cancelled','refunded')")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    admin
      .from("stock_movements")
      .select("variant_id, delta")
      .eq("type", "sale")
      .gte("created_at", moverWindowStart)
      .order("created_at", { ascending: false })
      .limit(TOP_MOVER_MOVEMENT_CAP),
    admin
      .from("audit_events")
      .select(
        "id, action, user_id, entity_type, entity_id, details, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  // ROW 1 — revenue (orders-backed only)
  const kpis: PanelState<{ today: SalesBucket; month: SalesBucket }> =
    ordersTodayResult.error || ordersMonthResult.error
      ? emptyPanel()
      : {
          data: {
            today: sumOrders(ordersTodayResult.data),
            month: sumOrders(ordersMonthResult.data),
          },
          error: false,
        };

  // ROW 2 — attention
  let attention: PanelState<AttentionData>;
  if (
    draftCountResult.error ||
    newEnquiriesResult.error ||
    staleEnquiriesResult.error ||
    activeVariantsResult.error
  ) {
    attention = emptyPanel();
  } else {
    const variants = (activeVariantsResult.data ?? []) as unknown as {
      stock_qty: number;
      low_stock_threshold: number;
    }[];
    attention = {
      data: {
        newEnquiries: newEnquiriesResult.count ?? 0,
        staleEnquiries: staleEnquiriesResult.count ?? 0,
        lowStock: variants.filter(
          (v) => v.stock_qty > 0 && v.stock_qty <= v.low_stock_threshold,
        ).length,
        outOfStock: variants.filter((v) => v.stock_qty <= 0).length,
        draftProducts: draftCountResult.count ?? 0,
      },
      error: false,
    };
  }

  // ROW 3 — operations: inventory, top movers, recent sales
  let operations: PanelState<{
    inventoryUnits: number;
    inventoryValue: number;
    topMovers: TopMover[];
    recentSales: RecentSale[];
  }> = emptyPanel();

  const salesRows = (recentSalesResult.data ?? []) as unknown as {
    id: string;
    order_number: string;
    customer_name: string | null;
    total: number | null;
    recorded_by: string | null;
    created_at: string;
  }[];
  const movementRows = (movementsResult.data ?? []) as unknown as {
    variant_id: string | null;
    delta: number | null;
  }[];
  const auditRows = (auditEventsResult.data ?? []) as unknown as {
    id: string;
    action: string;
    user_id: string | null;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    created_at: string;
  }[];

  // Shared bounded lookups: actor profile names (sales recorders + audit
  // actors) and entity labels for audited products/categories.
  const profileIds = new Set<string>();
  for (const sale of salesRows)
    if (sale.recorded_by) profileIds.add(sale.recorded_by);
  for (const event of auditRows)
    if (event.user_id) profileIds.add(event.user_id);

  const profileNames = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...profileIds]);
    if (profilesError) {
      // Name resolution is a nicety, not a panel failure; degrade gracefully.
      console.warn("Overview profile lookup failed:", profilesError.message);
    }
    for (const profile of profiles ?? []) {
      if (profile.full_name) profileNames.set(profile.id, profile.full_name);
    }
  }

  const productEntityIds = new Set(
    auditRows
      .filter((e) => e.entity_type === "product" && e.entity_id)
      .map((e) => e.entity_id as string),
  );
  const categoryEntityIds = new Set(
    auditRows
      .filter((e) => e.entity_type === "category" && e.entity_id)
      .map((e) => e.entity_id as string),
  );

  const productNames = new Map<
    string,
    { he: string | null; en: string | null }
  >();
  const categoryNames = new Map<
    string,
    { he: string | null; en: string | null }
  >();
  await Promise.all([
    productEntityIds.size > 0
      ? admin
          .from("products")
          .select("id, name_he, name_en")
          .in("id", [...productEntityIds])
          .then(({ data, error }) => {
            if (error) {
              console.warn("Overview product lookup failed:", error.message);
              return;
            }
            for (const row of data ?? []) {
              productNames.set(row.id, { he: row.name_he, en: row.name_en });
            }
          })
      : Promise.resolve(),
    categoryEntityIds.size > 0
      ? admin
          .from("categories")
          .select("id, name_he, name_en")
          .in("id", [...categoryEntityIds])
          .then(({ data, error }) => {
            if (error) {
              console.warn("Overview category lookup failed:", error.message);
              return;
            }
            for (const row of data ?? []) {
              categoryNames.set(row.id, { he: row.name_he, en: row.name_en });
            }
          })
      : Promise.resolve(),
  ]);

  if (
    inventoryAggResult.error ||
    recentSalesResult.error ||
    movementsResult.error
  ) {
    operations = emptyPanel();
  } else {
    let inventoryUnits = 0;
    let inventoryValue = 0;
    for (const v of inventoryAggResult.data ?? []) {
      const product = Array.isArray(v.products) ? v.products[0] : v.products;
      const qty = v.stock_qty ?? 0;
      const cost = v.cost_override ?? product?.purchase_cost ?? 0;
      inventoryUnits += qty;
      inventoryValue += qty * cost;
    }

    // Top movers: most recent sale movements (no dashboard RPC exists for
    // movers) — aggregate units sold per variant, resolve product labels.
    const soldByVariant = new Map<string, number>();
    for (const movement of movementRows) {
      if (!movement.variant_id || !movement.delta) continue;
      soldByVariant.set(
        movement.variant_id,
        (soldByVariant.get(movement.variant_id) ?? 0) +
          Math.abs(movement.delta),
      );
    }
    const topVariantIds = [...soldByVariant.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_MOVER_LIMIT)
      .map(([variantId]) => variantId);

    let topMovers: TopMover[] = [];
    if (topVariantIds.length > 0) {
      const { data: variantRows, error: variantError } = await admin
        .from("product_variants")
        .select(
          "id, products!product_variants_product_id_fkey(id, name_he, name_en)",
        )
        .in("id", topVariantIds);
      if (!variantError) {
        topMovers = topVariantIds
          .map((variantId) => {
            const variant = (variantRows ?? []).find((v) => v.id === variantId);
            const product = variant
              ? Array.isArray(variant.products)
                ? variant.products[0]
                : variant.products
              : null;
            return {
              id: variantId,
              nameHe: product?.name_he ?? null,
              nameEn: product?.name_en ?? null,
              unitsSold: soldByVariant.get(variantId) ?? 0,
            };
          })
          .filter((mover) => mover.nameHe || mover.nameEn);
      } else {
        console.warn("Overview top-mover lookup failed:", variantError.message);
      }
    }

    const recentSales: RecentSale[] = salesRows.map((sale) => ({
      id: sale.id,
      orderNumber: sale.order_number,
      customerName: sale.customer_name,
      total: sale.total ?? 0,
      createdAt: sale.created_at,
      recordedByName: sale.recorded_by
        ? (profileNames.get(sale.recorded_by) ?? null)
        : null,
    }));

    operations = {
      data: { inventoryUnits, inventoryValue, topMovers, recentSales },
      error: false,
    };
  }

  // ROW 4 — readable audit activity
  let activity: PanelState<{ events: ActivityEntry[] }> = emptyPanel();
  if (auditEventsResult.error) {
    activity = emptyPanel();
  } else {
    activity = {
      data: {
        events: auditRows.map((event) => {
          const details = event.details ?? {};
          const detailName =
            typeof details.name === "string" && details.name.length > 0
              ? details.name
              : typeof details.slug === "string" && details.slug.length > 0
                ? details.slug
                : null;
          const resolved =
            event.entity_type === "product" && event.entity_id
              ? (productNames.get(event.entity_id)?.[safeLocale] ??
                productNames.get(event.entity_id)?.en ??
                productNames.get(event.entity_id)?.he)
              : event.entity_type === "category" && event.entity_id
                ? (categoryNames.get(event.entity_id)?.[safeLocale] ??
                  categoryNames.get(event.entity_id)?.en ??
                  categoryNames.get(event.entity_id)?.he)
                : null;
          return {
            id: event.id,
            action: event.action,
            actorName: event.user_id
              ? (profileNames.get(event.user_id) ?? null)
              : null,
            actorIsSystem: event.user_id == null,
            entityName: resolved ?? detailName,
            createdAt: event.created_at,
          };
        }),
      },
      error: false,
    };
  }

  return (
    <OverviewPanel
      locale={safeLocale}
      nowIso={now.toISOString()}
      kpis={kpis}
      attention={attention}
      operations={operations}
      activity={activity}
    />
  );
}
