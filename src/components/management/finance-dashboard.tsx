"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar,
  Banknote,
  ShoppingBag,
  Package,
  RefreshCw,
  Tag,
  TrendingUp,
} from "lucide-react";
import { ActivityChart } from "./ui/activity-chart";
import { MetricCard, type MetricCardTone } from "./ui/metric-card";
import {
  DateRangePicker,
  dateRangeLabels,
  resolveDateRange,
  type DateRangeValue,
} from "./ui/date-range-picker";
import { DataTable } from "./ui/data-table";
import { EmptyState } from "./ui/empty-state";
import { ErrorState } from "./ui/error-state";
import { Notice } from "./ui/notice";
import { Skeleton } from "./ui/skeleton";
import { PageHeader } from "./ui/page-header";

type FinanceTotals = {
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

type DailySeriesPoint = {
  day: string;
  gross: number;
  net: number;
  orders: number;
};

type FinanceData = {
  range: { from: string; to: string };
  totals: FinanceTotals;
  dailySeries: DailySeriesPoint[];
};

function appendRangeParams(params: URLSearchParams, range: DateRangeValue) {
  if (!range.from || !range.to) return;
  params.set("from", new Date(`${range.from}T00:00:00`).toISOString());
  params.set("to", new Date(`${range.to}T23:59:59.999`).toISOString());
}

export function FinanceDashboard({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const labels = dateRangeLabels(locale);

  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    preset: "last7",
    ...resolveDateRange("last7"),
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams();
        appendRangeParams(params, dateRange);
        const res = await fetch(
          `/api/management/finance?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const json = await res.json();
        if (!controller.signal.aborted) {
          if (res.ok) {
            setData(json);
          } else {
            setError(
              json.error ||
                (he
                  ? "לא ניתן לטעון נתונים פיננסיים"
                  : "Unable to load finance data"),
            );
          }
          if (showLoading) setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(he ? "שגיאת חיבור" : "Connection error");
          if (showLoading) setLoading(false);
        }
      }
    },
    [dateRange, he],
  );

  // Initial load - separate effect to avoid setState-in-effect lint issue
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const params = new URLSearchParams();
    appendRangeParams(params, dateRange);
    fetch(`/api/management/finance?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (mounted && !controller.signal.aborted) {
          if (json && !json.error) {
            setData(json);
          } else {
            setError(
              json.error ||
                (he
                  ? "לא ניתן לטעון נתונים פיננסיים"
                  : "Unable to load finance data"),
            );
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted && !controller.signal.aborted) {
          setError(he ? "שגיאת חיבור" : "Connection error");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [dateRange, he]);

  const formatCurrency = (amount: number) => {
    const formatted = new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(amount);
    return formatted;
  };

  const formatNumber = (num: number) => {
    const formatted = new Intl.NumberFormat(he ? "he-IL" : "en-IL").format(num);
    return formatted;
  };

  const formatPercent = (value: number) => {
    const formatted = new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
    return formatted;
  };

  const handleDateRangeChange = (next: DateRangeValue) => {
    let resolved: DateRangeValue;
    if (next.preset === "custom") {
      resolved = next;
    } else if (next.preset === "all") {
      resolved = { preset: "all", from: "", to: "" };
    } else {
      resolved = { preset: next.preset, ...resolveDateRange(next.preset) };
    }
    setDateRange(resolved);
  };

  // Stat cards using shared MetricCard component
  const statCards = data
    ? [
        {
          key: "revenueGross",
          label: he ? "הכנסות ברוטו (כולל מע״מ)" : "Gross Revenue (incl. VAT)",
          value: formatCurrency(data.totals.revenueGross),
          icon: <Banknote className="h-6 w-6 text-primary" />,
          tone: "accent" as const,
        },
        {
          key: "revenueNet",
          label: he ? "הכנסות נטו" : "Net Revenue",
          value: formatCurrency(data.totals.revenueNet),
          icon: <TrendingUp className="h-6 w-6 text-success-text" />,
          tone: "success" as const,
        },
        {
          key: "vatTotal",
          label: he ? "מע״מ" : "VAT",
          value: formatCurrency(data.totals.vatTotal),
          icon: <Tag className="h-6 w-6 text-muted-foreground" />,
          tone: "default" as const,
        },
        {
          key: "cogs",
          label: he ? "עלות המכר (COGS)" : "COGS",
          value: formatCurrency(data.totals.cogs),
          icon: <Package className="h-6 w-6 text-error-text" />,
          tone: "danger" as const,
        },
        {
          key: "grossProfit",
          label: he ? "רווח גולמי" : "Gross Profit",
          value: formatCurrency(data.totals.grossProfit),
          icon: (
            <TrendingUp
              className={`h-6 w-6 ${data.totals.grossProfit >= 0 ? "text-success-text" : "text-error-text"}`}
            />
          ),
          tone: (data.totals.grossProfit >= 0
            ? "success"
            : "danger") as MetricCardTone,
        },
        {
          key: "margin",
          label: he ? "שולי רווח" : "Margin %",
          value: formatPercent(data.totals.margin),
          icon: (
            <TrendingUp
              className={`h-6 w-6 ${data.totals.margin >= 0 ? "text-success-text" : "text-error-text"}`}
            />
          ),
          tone: (data.totals.margin >= 0
            ? "success"
            : "danger") as MetricCardTone,
        },
        {
          key: "discounts",
          label: he ? "הנחות" : "Discounts",
          value: formatCurrency(data.totals.discounts),
          icon: <Tag className="h-6 w-6 text-error-text" />,
          tone: "danger" as const,
        },
        {
          key: "unitsSold",
          label: he ? "יחידות שנמכרו" : "Units Sold",
          value: formatNumber(data.totals.unitsSold),
          icon: <Package className="h-6 w-6 text-primary" />,
          tone: "default" as const,
        },
        {
          key: "orderCount",
          label: he ? "מספר הזמנות" : "Order Count",
          value: formatNumber(data.totals.orderCount),
          icon: <Tag className="h-6 w-6 text-primary" />,
          tone: "default" as const,
        },
        {
          key: "averageOrder",
          label: he ? "הזמנה ממוצעת (ברוטו)" : "Average order (gross)",
          value:
            data.totals.orderCount > 0
              ? formatCurrency(
                  data.totals.revenueGross / data.totals.orderCount,
                )
              : "—",
          icon: <ShoppingBag size={20} />,
          tone: "default" as const,
        },
        {
          key: "inventoryValue",
          label: he ? "שווי מלאי" : "Inventory Value",
          value: formatCurrency(data.totals.inventoryValue),
          icon: <Package className="h-6 w-6 text-secondary-accent" />,
          tone: "accent" as const,
        },
        {
          key: "inventoryUnits",
          label: he ? "יחידות במלאי" : "Inventory Units",
          value: formatNumber(data.totals.inventoryUnits),
          icon: <Package className="h-6 w-6 text-secondary-accent" />,
          tone: "default" as const,
        },
      ]
    : [];

  // Daily bar chart data
  const chartData = data?.dailySeries ?? [];
  const rangeLabel = dateRange.from
    ? `${new Date(`${dateRange.from}T00:00:00`).toLocaleDateString(he ? "he-IL" : "en-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${new Date(`${dateRange.to}T00:00:00`).toLocaleDateString(he ? "he-IL" : "en-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}`
    : he
      ? "כל הזמנים"
      : "All time";

  if (loading && !data) {
    return (
      <div className="finance-dashboard" role="status" aria-live="polite">
        <div className="mgmt-stat-grid" aria-hidden="true">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="mgmt-metric-card mgmt-metric-card--default">
              <Skeleton className="mgmt-skeleton mgmt-skeleton--text mgmt-skeleton--w-md" />
              <Skeleton className="mgmt-skeleton mgmt-skeleton--text mgmt-skeleton--w-lg" />
            </div>
          ))}
        </div>
        <div className="mgmt-card mgmt-card--padded">
          <div
            className="mgmt-skeleton mgmt-skeleton--w-full"
            style={{ height: "16rem" }}
          />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <ErrorState
        title={
          he ? "שגיאה בטעינת נתונים פיננסיים" : "Failed to load finance data"
        }
        description={error}
        onRetry={() => fetchData(true)}
        retryLabel={he ? "נסה שוב" : "Retry"}
      />
    );
  }

  return (
    <div className="finance-dashboard">
      <PageHeader
        title={he ? "דשבורד פיננסי" : "Finance dashboard"}
        subtitle={
          he
            ? "הכנסות, רווחיות, עלויות וערך מלאי בטווח שנבחר"
            : "Revenue, profitability, costs, and inventory value for the selected range"
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              labels={labels}
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {rangeLabel}
            </span>
          </div>
        }
      />

      {error && data ? (
        <Notice tone="warning" onDismiss={() => setError("")}>
          <span className="inline-flex flex-wrap items-center gap-2">
            {error}
            <button
              type="button"
              className="mgmt-button mgmt-button--secondary"
              onClick={() => void fetchData(false)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {he ? "נסה שוב" : "Retry"}
            </button>
          </span>
        </Notice>
      ) : null}

      <Notice tone="info">
        {he
          ? "תצוגה ניהולית פנימית — אינה חלופה לדוחות חשבונאיים רשמיים."
          : "Internal managerial view — not a substitute for official accounting reports."}
      </Notice>

      {/* Stat Cards Grid */}
      <div
        className="mgmt-stat-grid"
        aria-label={he ? "מדדים פיננסיים" : "Financial metrics"}
      >
        {statCards.length > 0 ? (
          statCards.map((stat) => (
            <MetricCard
              key={stat.key}
              label={stat.label}
              value={
                <span className="tabular-nums" dir="ltr">
                  {stat.value}
                </span>
              }
              icon={stat.icon}
              tone={stat.tone}
            />
          ))
        ) : (
          <EmptyState
            icon={<Calendar className="h-6 w-6" />}
            title={he ? "אין נתונים לתצוגה" : "No data to display"}
            description={
              he
                ? "בחר טווח תאריכים אחר או המתן לטעינת נתונים"
                : "Select a different date range or wait for data to load"
            }
          />
        )}
      </div>

      {/* Daily Series Bar Chart */}
      {chartData.length > 0 && (
        <section
          className="mgmt-card mgmt-card--padded"
          aria-labelledby="chart-title"
        >
          <h3
            id="chart-title"
            className="text-lg font-semibold mb-4 flex items-center gap-2"
          >
            <Calendar className="h-5 w-5" aria-hidden="true" />
            {he
              ? "סדרת יומית — הכנסות והזמנות"
              : "Daily Series — Revenue & Orders"}
          </h3>
          <ActivityChart
            days={chartData.map((point) => point.day.split("T")[0])}
            series={[
              {
                label: he ? "ברוטו" : "Gross revenue",
                values: chartData.map((point) => point.gross),
                tone: "gold",
              },
              {
                label: he ? "נטו" : "Net revenue",
                values: chartData.map((point) => point.net),
                tone: "teal",
              },
            ]}
            locale={locale}
            unit={he ? "הכנסות · ₪" : "Revenue · ILS"}
            note={
              he
                ? "הכנסות לפי יום. הטבלה בהמשך מפרטת גם הזמנות."
                : "Revenue by day. The breakdown below also includes order counts."
            }
          />
        </section>
      )}

      {/* Daily Series Table */}
      <section
        className="mgmt-card mgmt-card--padded"
        aria-labelledby="table-title"
      >
        <h3
          id="table-title"
          className="text-lg font-semibold mb-4 flex items-center gap-2"
        >
          <Calendar className="h-5 w-5" aria-hidden="true" />
          {he ? "פירוט יומי" : "Daily Breakdown"}
        </h3>
        <DataTable
          caption={
            he
              ? "פירוט הכנסות והזמנות לפי יום"
              : "Daily revenue and orders breakdown"
          }
          head={
            <tr className="border-b border-border-subtle bg-surface-muted text-start">
              <th className="p-4">{he ? "תאריך" : "Date"}</th>
              <th className="p-4 tabular-nums">{he ? "ברוטו" : "Gross"}</th>
              <th className="p-4 tabular-nums">{he ? "נטו" : "Net"}</th>
              <th className="p-4 tabular-nums">{he ? "הזמנות" : "Orders"}</th>
            </tr>
          }
          isEmpty={chartData.length === 0}
          emptyState={
            <EmptyState
              icon={<Calendar className="h-8 w-8" />}
              title={
                he ? "אין נתונים בטווח הנבחר" : "No data in selected range"
              }
              description={
                he
                  ? "נסה להרחיב את טווח התאריכים"
                  : "Try expanding the date range"
              }
            />
          }
          minWidth="40rem"
        >
          {chartData
            .slice()
            .sort((a, b) => b.day.localeCompare(a.day))
            .map((point) => (
              <tr
                key={point.day}
                className="border-b border-border-subtle hover:bg-surface-muted/50"
              >
                <td className="p-4">
                  {new Date(`${point.day}T00:00:00`).toLocaleDateString(
                    he ? "he-IL" : "en-IL",
                    {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    },
                  )}
                </td>
                <td className="p-4 tabular-nums" dir="ltr">
                  {formatCurrency(point.gross)}
                </td>
                <td className="p-4 tabular-nums" dir="ltr">
                  {formatCurrency(point.net)}
                </td>
                <td className="p-4 tabular-nums">{point.orders}</td>
              </tr>
            ))}
        </DataTable>
      </section>
    </div>
  );
}
