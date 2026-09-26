import type { Locale } from "@/lib/i18n";
import {
  Activity,
  AlertTriangle,
  Archive,
  Box,
  DollarSign,
  History,
  MessageSquare,
  Package,
  Search,
  ShoppingCart,
  TrendingUp,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type Stats = {
  products: { active: number; draft: number; archived: number };
  lowStockCount: number;
  outOfStockCount: number;
  inventoryUnits: number;
  inventoryValue: number;
  salesToday: { revenue: number; net: number; vat: number };
  salesWeek: { revenue: number; net: number; vat: number };
  salesMonth: { revenue: number; net: number; vat: number };
  analytics: {
    product_view: number;
    product_search: number;
    product_inquiry: number;
  };
};

type AuditEvent = {
  id: string;
  action: string;
  user_id: string;
  details: Record<string, unknown>;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

type StockMovement = {
  id: string;
  delta: number;
  type: string;
  reference: string | null;
  note: string | null;
  resulting_qty: number;
  created_at: string;
  product_variants: {
    sku: string;
    products: { name_he: string; name_en: string } | null;
  } | null;
};

const actionLabels: Record<string, { he: string; en: string }> = {
  product_created: { he: "נוצר מוצר", en: "Product Created" },
  product_updated: { he: "עודכן מוצר", en: "Product Updated" },
  product_deleted: { he: "נמחק מוצר", en: "Product Deleted" },
  category_created: { he: "נוצרה קטגוריה", en: "Category Created" },
  category_updated: { he: "עודכנה קטגוריה", en: "Category Updated" },
  category_deleted: { he: "נמחקה קטגוריה", en: "Category Deleted" },
  product_price_set: { he: "נקבע מחיר מוצר", en: "Product Price Set" },
  product_price_deleted: { he: "נמחק מחיר מוצר", en: "Product Price Deleted" },
  product_image_added: { he: "נוספה תמונת מוצר", en: "Product Image Added" },
  product_image_updated: {
    he: "עודכנה תמונת מוצר",
    en: "Product Image Updated",
  },
  product_image_deleted: {
    he: "נמחקה תמונת מוצר",
    en: "Product Image Deleted",
  },
  account_control: { he: "פקדון חשבון", en: "Account Control" },
  ceo_added: { he: "נוסף מנכ״ל", en: "CEO Added" },
  ceo_self_deleted: { he: "נמחק מנכ״ל עצמי", en: "CEO Self Deleted" },
  request_update: { he: "עודכנה פנייה", en: "Request Updated" },
  supplier_created: { he: "נוצר ספק", en: "Supplier Created" },
  supplier_updated: { he: "עודכן ספק", en: "Supplier Updated" },
  supplier_deactivated: { he: "ספק הושבת", en: "Supplier Deactivated" },
  supplier_deleted: { he: "נמחק ספק", en: "Supplier Deleted" },
  stock_movement: { he: "תנועת מלאי", en: "Stock Movement" },
  stock_adjustment: { he: "התאמת מלאי", en: "Stock Adjustment" },
  order_created: { he: "נוצרה הזמנה", en: "Order Created" },
  order_updated: { he: "עודכנה הזמנה", en: "Order Updated" },
};

const movementTypeLabels: Record<string, { he: string; en: string }> = {
  purchase_receipt: { he: "קבלת רכש", en: "Purchase Receipt" },
  sale: { he: "מכירה", en: "Sale" },
  customer_return: { he: "החזרת לקוח", en: "Customer Return" },
  supplier_return: { he: "החזרת ספק", en: "Supplier Return" },
  manual_adjustment: { he: "התאמה ידנית", en: "Manual Adjustment" },
  damage: { he: "נזק", en: "Damage" },
  loss: { he: "אובדן", en: "Loss" },
  stocktake_correction: { he: "תיקון ספירת מלאי", en: "Stocktake Correction" },
  transfer_in: { he: "העברה פנימה", en: "Transfer In" },
  transfer_out: { he: "העברה החוצה", en: "Transfer Out" },
  reservation: { he: "שמירה", en: "Reservation" },
  reservation_release: { he: "שחרור שמירה", en: "Reservation Release" },
};

function formatCurrency(value: number, locale: "he" | "en"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number, locale: "he" | "en"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL").format(
    value,
  );
}

function formatDate(dateStr: string, locale: "he" | "en"): string {
  return new Date(dateStr).toLocaleString(locale === "he" ? "he-IL" : "en-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionLabel(action: string, locale: "he" | "en"): string {
  const label = actionLabels[action];
  if (label) return locale === "he" ? label.he : label.en;
  return action.replace(/_/g, " ");
}

function getMovementLabel(type: string, locale: "he" | "en"): string {
  const label = movementTypeLabels[type];
  if (label) return locale === "he" ? label.he : label.en;
  return type.replace(/_/g, " ");
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  locale: "he" | "en";
  warning?: boolean;
  critical?: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  locale,
  warning,
  critical,
}: StatCardProps) {
  return (
    <article
      className={`overview-panel__stat-card ${warning ? "overview-panel__stat-card--warning" : ""} ${critical ? "overview-panel__stat-card--critical" : ""}`}
    >
      <div className="overview-panel__stat-icon" aria-hidden="true">
        <Icon size={22} />
      </div>
      <div className="overview-panel__stat-content">
        <p className="overview-panel__stat-label">{label}</p>
        <p className="overview-panel__stat-value">
          {typeof value === "number" ? formatNumber(value, locale) : value}
        </p>
        {trend && <p className="overview-panel__stat-trend">{trend}</p>}
      </div>
    </article>
  );
}

const Icons = {
  Package,
  AlertTriangle,
  XCircle,
  Box,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Activity,
  Search,
  MessageSquare,
  History,
  Truck,
  Archive,
} as const;

export function OverviewPanel({
  locale,
  stats,
  recentAuditEvents,
  recentStockMovements,
  hasErrors,
}: {
  locale: Locale;
  stats: Stats;
  recentAuditEvents: AuditEvent[];
  recentStockMovements: StockMovement[];
  hasErrors: boolean;
}) {
  const he = locale === "he";

  if (hasErrors) {
    return (
      <div className="overview-panel__error" role="alert">
        {he
          ? "שגיאה בטעינת חלק מהנתונים. נסה לרענן את הדף."
          : "Error loading some data. Please refresh the page."}
      </div>
    );
  }

  return (
    <section className="overview-panel space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">
            {he ? "סקירת מערכת" : "System Overview"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {he ? "מצב המערכת בזמן אמת" : "Real-time system status"}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        className="overview-panel__stats-grid"
        role="list"
        aria-label={he ? "מדדי מערכת" : "System metrics"}
      >
        <StatCard
          icon={Icons.Package}
          label={he ? "מוצרים פעילים" : "Active Products"}
          value={stats.products.active}
          locale={locale}
        />
        <StatCard
          icon={Icons.Package}
          label={he ? "מוצרים בטיוטה" : "Draft Products"}
          value={stats.products.draft}
          locale={locale}
        />
        <StatCard
          icon={Icons.Archive}
          label={he ? "מוצרים בארכיון" : "Archived Products"}
          value={stats.products.archived}
          locale={locale}
        />
        <StatCard
          icon={Icons.AlertTriangle}
          label={he ? "מלאי נמוך" : "Low Stock Variants"}
          value={stats.lowStockCount}
          warning={stats.lowStockCount > 0}
          locale={locale}
          trend={he ? "וריאנטים מתחת לסף" : "variants below threshold"}
        />
        <StatCard
          icon={Icons.XCircle}
          label={he ? "חסר במלאי" : "Out of Stock"}
          value={stats.outOfStockCount}
          critical={stats.outOfStockCount > 0}
          locale={locale}
          trend={he ? "וריאנטים עם מלאי 0" : "variants with 0 stock"}
        />
        <StatCard
          icon={Icons.Box}
          label={he ? "סך יחידות במלאי" : "Total Inventory Units"}
          value={stats.inventoryUnits}
          locale={locale}
        />
        <StatCard
          icon={Icons.DollarSign}
          label={he ? "שווי מלאי (עלות)" : "Inventory Value (Cost)"}
          value={formatCurrency(stats.inventoryValue, locale)}
          locale={locale}
        />
        <StatCard
          icon={Icons.ShoppingCart}
          label={he ? "מכירות היום" : "Sales Today"}
          value={formatCurrency(stats.salesToday.revenue, locale)}
          locale={locale}
          trend={
            he
              ? `נטו: ${formatCurrency(stats.salesToday.net, locale)} • מע"מ: ${formatCurrency(stats.salesToday.vat, locale)}`
              : `Net: ${formatCurrency(stats.salesToday.net, locale)} • VAT: ${formatCurrency(stats.salesToday.vat, locale)}`
          }
        />
        <StatCard
          icon={Icons.TrendingUp}
          label={he ? "מכירות השבוע" : "Sales This Week"}
          value={formatCurrency(stats.salesWeek.revenue, locale)}
          locale={locale}
          trend={
            he
              ? `נטו: ${formatCurrency(stats.salesWeek.net, locale)}`
              : `Net: ${formatCurrency(stats.salesWeek.net, locale)}`
          }
        />
        <StatCard
          icon={Icons.TrendingUp}
          label={he ? "מכירות החודש" : "Sales This Month"}
          value={formatCurrency(stats.salesMonth.revenue, locale)}
          locale={locale}
          trend={
            he
              ? `נטו: ${formatCurrency(stats.salesMonth.net, locale)}`
              : `Net: ${formatCurrency(stats.salesMonth.net, locale)}`
          }
        />
        <StatCard
          icon={Icons.Activity}
          label={he ? "צפיות במוצרים (7 ימים)" : "Product Views (7d)"}
          value={stats.analytics.product_view}
          locale={locale}
        />
        <StatCard
          icon={Icons.Search}
          label={he ? "חיפושי מוצרים (7 ימים)" : "Product Searches (7d)"}
          value={stats.analytics.product_search}
          locale={locale}
        />
        <StatCard
          icon={Icons.MessageSquare}
          label={he ? "פניות מוצרים (7 ימים)" : "Product Inquiries (7d)"}
          value={stats.analytics.product_inquiry}
          locale={locale}
        />
      </div>

      {/* Recent Activity Tables */}
      <div className="overview-panel__tables-grid">
        {/* Recent Audit Events */}
        <div className="overview-panel__table-card miro-card">
          <div className="overview-panel__table-header">
            <h2 className="overview-panel__table-title">
              <Icons.History size={18} aria-hidden="true" />
              {he ? "פעולות אחרונות" : "Recent Activity"}
            </h2>
          </div>
          <div className="overview-panel__table-wrapper">
            <table className="overview-panel__table" role="table">
              <caption className="sr-only">
                {he ? "טבלת פעולות אחרונות" : "Recent activity table"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{he ? "תאריך" : "Date"}</th>
                  <th scope="col">{he ? "משתמש" : "User"}</th>
                  <th scope="col">{he ? "פעולה" : "Action"}</th>
                  <th scope="col">{he ? "פרטים" : "Details"}</th>
                </tr>
              </thead>
              <tbody>
                {recentAuditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="overview-panel__empty-cell">
                      {he ? "אין פעולות אחרונות" : "No recent activity"}
                    </td>
                  </tr>
                ) : (
                  recentAuditEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.created_at, locale)}</td>
                      <td>
                        {event.profiles?.full_name ||
                          event.user_id.slice(0, 8) + "…"}
                      </td>
                      <td>
                        <span className="overview-panel__action-badge">
                          {getActionLabel(event.action, locale)}
                        </span>
                      </td>
                      <td className="overview-panel__details-cell">
                        {JSON.stringify(event.details)
                          .replace(/[{}]/g, "")
                          .replace(/"/g, "")
                          .substring(0, 80)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Stock Movements */}
        <div className="overview-panel__table-card miro-card">
          <div className="overview-panel__table-header">
            <h2 className="overview-panel__table-title">
              <Icons.Truck size={18} aria-hidden="true" />
              {he ? "תנועות מלאי אחרונות" : "Recent Stock Movements"}
            </h2>
          </div>
          <div className="overview-panel__table-wrapper">
            <table className="overview-panel__table" role="table">
              <caption className="sr-only">
                {he
                  ? "טבלת תנועות מלאי אחרונות"
                  : "Recent stock movements table"}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{he ? "תאריך" : "Date"}</th>
                  <th scope="col">
                    {he ? "מוצר / וריאנט" : "Product / Variant"}
                  </th>
                  <th scope="col">{he ? "סוג" : "Type"}</th>
                  <th scope="col">{he ? "כמות" : "Qty"}</th>
                  <th scope="col">{he ? "אסמכתא" : "Ref"}</th>
                  <th scope="col">{he ? "מלאי נוכחי" : "Current Stock"}</th>
                </tr>
              </thead>
              <tbody>
                {recentStockMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="overview-panel__empty-cell">
                      {he
                        ? "אין תנועות מלאי אחרונות"
                        : "No recent stock movements"}
                    </td>
                  </tr>
                ) : (
                  recentStockMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.created_at, locale)}</td>
                      <td>
                        <div>
                          <p className="font-medium">
                            {movement.product_variants?.products
                              ? he
                                ? movement.product_variants.products.name_he
                                : movement.product_variants.products.name_en
                              : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {movement.product_variants?.sku || "—"}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className="overview-panel__movement-badge">
                          {getMovementLabel(movement.type, locale)}
                        </span>
                      </td>
                      <td
                        className={
                          movement.delta > 0
                            ? "overview-panel__delta--positive"
                            : "overview-panel__delta--negative"
                        }
                      >
                        {movement.delta > 0 ? "+" : ""}
                        {movement.delta}
                      </td>
                      <td className="font-mono text-sm">
                        {movement.reference || "—"}
                      </td>
                      <td>{movement.resulting_qty}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
