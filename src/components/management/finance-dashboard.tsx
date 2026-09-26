"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Package,
  Tag,
  Calendar,
  AlertCircle,
  RotateCcw,
  Info,
  X,
} from "lucide-react";

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

type DateRange = { from: string; to: string } | null;

export function FinanceDashboard({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";

  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (dateRange?.from) params.set("from", dateRange.from);
        if (dateRange?.to) params.set("to", dateRange.to);
        const res = await fetch(
          `/api/management/finance?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await res.json();
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
      } catch {
        setError(he ? "שגיאת חיבור" : "Connection error");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [dateRange, he],
  );

  useEffect(() => {
    // Initial load - use AbortController to avoid setState-in-effect lint issue
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (dateRange?.from) params.set("from", dateRange.from);
    if (dateRange?.to) params.set("to", dateRange.to);
    fetch(`/api/management/finance?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (!controller.signal.aborted) {
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
        if (!controller.signal.aborted) {
          setError(he ? "שגיאת חיבור" : "Connection error");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [dateRange, he]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(amount);

  const formatNumber = (num: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL").format(num);

  const formatPercent = (value: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);

  const presetRanges = [
    { label: { he: "7 ימים", en: "7 days" }, days: 7 },
    { label: { he: "30 ימים", en: "30 days" }, days: 30 },
    { label: { he: "90 ימים", en: "90 days" }, days: 90 },
    { label: { he: "הכל", en: "All" }, days: null },
  ];

  const handlePresetClick = (days: number | null) => {
    if (days === null) {
      setDateRange(null);
      setCustomFrom("");
      setCustomTo("");
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    const range = {
      from: from.toISOString(),
      to: to.toISOString(),
    };
    setDateRange(range);
    setCustomFrom("");
    setCustomTo("");
  };

  const handleCustomDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setCustomFrom(value);
    else setCustomTo(value);
  };

  const applyCustomRange = () => {
    if (customFrom && customTo) {
      const from = new Date(customFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      setDateRange({
        from: from.toISOString(),
        to: to.toISOString(),
      });
    }
  };

  const clearDateRange = () => {
    setDateRange(null);
    setCustomFrom("");
    setCustomTo("");
  };

  const isPresetActive = (days: number | null) => {
    if (days === null && !dateRange) return true;
    if (days !== null && dateRange) {
      const rangeStart = new Date(dateRange.from);
      const expectedStart = new Date();
      expectedStart.setDate(expectedStart.getDate() - days);
      return (
        Math.abs(rangeStart.getTime() - expectedStart.getTime()) < 86400000
      );
    }
    return false;
  };

  // Stat card definitions
  const statCards = data
    ? [
        {
          key: "revenueGross",
          label: he ? "הכנסות ברוטו (כולל מע״מ)" : "Gross Revenue (incl. VAT)",
          value: formatCurrency(data.totals.revenueGross),
          icon: DollarSign,
          iconColor: "text-primary",
          positive: true,
        },
        {
          key: "revenueNet",
          label: he ? "הכנסות נטו" : "Net Revenue",
          value: formatCurrency(data.totals.revenueNet),
          icon: TrendingUp,
          iconColor: "text-success-text",
          positive: true,
        },
        {
          key: "vatTotal",
          label: he ? "מע״מ" : "VAT",
          value: formatCurrency(data.totals.vatTotal),
          icon: Tag,
          iconColor: "text-muted-foreground",
          positive: true,
        },
        {
          key: "cogs",
          label: he ? "עלות המכר (COGS)" : "COGS",
          value: formatCurrency(data.totals.cogs),
          icon: Package,
          iconColor: "text-error-text",
          positive: false,
        },
        {
          key: "grossProfit",
          label: he ? "רווח גולמי" : "Gross Profit",
          value: formatCurrency(data.totals.grossProfit),
          icon: TrendingUp,
          iconColor:
            data.totals.grossProfit >= 0
              ? "text-success-text"
              : "text-error-text",
          positive: data.totals.grossProfit >= 0,
        },
        {
          key: "margin",
          label: he ? "שולי רווח" : "Margin %",
          value: formatPercent(data.totals.margin),
          icon: TrendingUp,
          iconColor:
            data.totals.margin >= 0 ? "text-success-text" : "text-error-text",
          positive: data.totals.margin >= 0,
        },
        {
          key: "discounts",
          label: he ? "הנחות" : "Discounts",
          value: formatCurrency(data.totals.discounts),
          icon: Tag,
          iconColor: "text-error-text",
          positive: false,
        },
        {
          key: "unitsSold",
          label: he ? "יחידות שנמכרו" : "Units Sold",
          value: formatNumber(data.totals.unitsSold),
          icon: Package,
          iconColor: "text-primary",
          positive: true,
        },
        {
          key: "orderCount",
          label: he ? "מספר הזמנות" : "Order Count",
          value: formatNumber(data.totals.orderCount),
          icon: Tag,
          iconColor: "text-primary",
          positive: true,
        },
        {
          key: "inventoryValue",
          label: he ? "שווי מלאי" : "Inventory Value",
          value: formatCurrency(data.totals.inventoryValue),
          icon: Package,
          iconColor: "text-secondary-accent",
          positive: true,
        },
        {
          key: "inventoryUnits",
          label: he ? "יחידות במלאי" : "Inventory Units",
          value: formatNumber(data.totals.inventoryUnits),
          icon: Package,
          iconColor: "text-secondary-accent",
          positive: true,
        },
      ]
    : [];

  // Daily bar chart data
  const chartData = data?.dailySeries ?? [];
  const maxGross =
    chartData.length > 0 ? Math.max(...chartData.map((d) => d.gross)) : 1;

  if (loading) {
    return (
      <div
        className="miro-card finance-dashboard__loading"
        role="status"
        aria-live="polite"
      >
        <div className="finance-dashboard__spinner" aria-hidden="true" />
        <p>{he ? "טוען נתונים פיננסיים…" : "Loading finance data…"}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="miro-card finance-dashboard__error" role="alert">
        <AlertCircle
          className="h-10 w-10 text-error-text mx-auto mb-3"
          aria-hidden="true"
        />
        <p className="text-lg font-medium mb-2 text-center">
          {he ? "שגיאה בטעינת נתונים פיננסיים" : "Failed to load finance data"}
        </p>
        <p className="text-muted-foreground text-center mb-4">{error}</p>
        <div className="flex justify-center">
          <button
            type="button"
            className="miro-button miro-button-secondary gap-2"
            onClick={() => fetchData(true)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {he ? "נסה שוב" : "Retry"}
          </button>
        </div>
      </div>
    );
  }

  const rangeLabel = dateRange
    ? `${new Date(dateRange.from).toLocaleDateString(he ? "he-IL" : "en-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${new Date(dateRange.to).toLocaleDateString(he ? "he-IL" : "en-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}`
    : he
      ? "כל הזמנים"
      : "All time";

  return (
    <div className="finance-dashboard space-y-6">
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {he ? "דשבורד פיננסי" : "Finance Dashboard"}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {he
                  ? "מדדי ביצועים פיננסיים ניהוליים"
                  : "Managerial financial performance metrics"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range Presets */}
              <div
                className="flex gap-1.5"
                role="group"
                aria-label={he ? "טווח תאריכים" : "Date range"}
              >
                {presetRanges.map((preset) => (
                  <button
                    key={preset.days ?? "all"}
                    type="button"
                    onClick={() => handlePresetClick(preset.days)}
                    className={`finance-dashboard__preset-btn px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isPresetActive(preset.days)
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-hover text-foreground hover:bg-surface-muted"
                    }`}
                    aria-pressed={isPresetActive(preset.days)}
                  >
                    {he ? preset.label.he : preset.label.en}
                  </button>
                ))}
              </div>

              {/* Custom Date Inputs */}
              {(dateRange || customFrom || customTo) && (
                <div className="flex items-center gap-2 finance-dashboard__custom-range">
                  <label htmlFor="finance-from" className="sr-only">
                    {he ? "מתאריך" : "From"}
                  </label>
                  <input
                    id="finance-from"
                    type="date"
                    value={customFrom || (dateRange?.from?.split("T")[0] ?? "")}
                    onChange={(e) =>
                      handleCustomDateChange("from", e.target.value)
                    }
                    className="miro-input w-auto"
                  />
                  <span className="text-muted-foreground">
                    {he ? "עד" : "to"}
                  </span>
                  <label htmlFor="finance-to" className="sr-only">
                    {he ? "עד תאריך" : "To"}
                  </label>
                  <input
                    id="finance-to"
                    type="date"
                    value={customTo || (dateRange?.to?.split("T")[0] ?? "")}
                    onChange={(e) =>
                      handleCustomDateChange("to", e.target.value)
                    }
                    className="miro-input w-auto"
                  />
                  <button
                    type="button"
                    onClick={applyCustomRange}
                    className="miro-button miro-button-secondary px-3"
                  >
                    {he ? "החל" : "Apply"}
                  </button>
                  <button
                    type="button"
                    onClick={clearDateRange}
                    className="miro-button miro-button-secondary p-2"
                    aria-label={he ? "נקה טווח תאריכים" : "Clear date range"}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              <span className="finance-dashboard__range-label text-sm text-muted-foreground">
                {rangeLabel}
              </span>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="finance-dashboard__disclaimer mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              {he
                ? "הצגת ניהול פנימית — אינה חלופה לדוחות חשבונאיים רשמיים"
                : "Internal managerial view — not a substitute for official accounting reports"}
            </span>
          </p>
        </div>

        {/* Stat Cards Grid */}
        <div className="p-6">
          <div
            className="miro-stat-grid"
            role="list"
            aria-label={he ? "מדדים פיננסיים" : "Financial metrics"}
          >
            {statCards.map((stat) => (
              <article
                key={stat.key}
                className="miro-stat-card"
                role="listitem"
              >
                <div
                  className="finance-dashboard__stat-icon"
                  aria-hidden="true"
                >
                  <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
                <div className="finance-dashboard__stat-content">
                  <p className="miro-stat-value tabular-nums">{stat.value}</p>
                  <p className="miro-stat-label">{stat.label}</p>
                </div>
              </article>
            ))}
          </div>

          {/* Daily Series Bar Chart */}
          {chartData.length > 0 && (
            <section className="mt-8" aria-labelledby="chart-title">
              <h3
                id="chart-title"
                className="text-lg font-semibold mb-4 flex items-center gap-2"
              >
                <Calendar className="h-5 w-5" aria-hidden="true" />
                {he
                  ? "סדרת יומית — הכנסות והזמנות"
                  : "Daily Series — Revenue & Orders"}
              </h3>
              <div
                className="finance-dashboard__chart"
                role="img"
                aria-label={
                  he
                    ? "גרף עמודות יומי של הכנסות והזמנות"
                    : "Daily bar chart of revenue and orders"
                }
              >
                <div className="finance-dashboard__chart-bars" role="list">
                  {chartData.map((point) => (
                    <div
                      key={point.day}
                      className="finance-dashboard__bar-group"
                      role="listitem"
                      aria-label={
                        he
                          ? `${new Date(point.day).toLocaleDateString("he-IL")}: ${formatCurrency(point.gross)} ברוטו, ${point.orders} הזמנות`
                          : `${new Date(point.day).toLocaleDateString("en-IL")}: ${formatCurrency(point.gross)} gross, ${point.orders} orders`
                      }
                    >
                      <div className="finance-dashboard__bar-wrapper">
                        <div
                          className="finance-dashboard__bar finance-dashboard__bar--gross"
                          style={{
                            height: `${(point.gross / maxGross) * 100}%`,
                          }}
                          title={`${he ? "ברוטו" : "Gross"}: ${formatCurrency(point.gross)}`}
                        />
                        <div
                          className="finance-dashboard__bar finance-dashboard__bar--net"
                          style={{
                            height: `${(point.net / maxGross) * 100}%`,
                          }}
                          title={`${he ? "נטו" : "Net"}: ${formatCurrency(point.net)}`}
                        />
                      </div>
                      <div className="finance-dashboard__bar-labels">
                        <span className="finance-dashboard__bar-day">
                          {new Date(point.day).toLocaleDateString(
                            he ? "he-IL" : "en-IL",
                            { day: "2-digit", month: "2-digit" },
                          )}
                        </span>
                        <span
                          className="finance-dashboard__bar-orders"
                          title={he ? "הזמנות" : "Orders"}
                        >
                          {point.orders}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="finance-dashboard__chart-legend flex items-center justify-center gap-4 mt-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded finance-dashboard__legend-gross"
                      aria-hidden="true"
                    />
                    {he ? "ברוטו" : "Gross"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded finance-dashboard__legend-net"
                      aria-hidden="true"
                    />
                    {he ? "נטו" : "Net"}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="w-3 h-3 rounded bg-current/30"
                      aria-hidden="true"
                    />
                    {he ? "הזמנות (מספר)" : "Orders (count)"}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
