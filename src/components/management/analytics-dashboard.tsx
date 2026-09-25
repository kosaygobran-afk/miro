"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Eye,
  Users,
  Search,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Package,
  Tag,
  AlertCircle,
  RotateCcw,
  BarChart2,
  X,
} from "lucide-react";

type AnalyticsTotals = {
  views: number;
  uniqueSessions: number;
  searches: number;
  noResultSearches: number;
  inquiries: number;
  salesCount: number;
};

type PerProduct = {
  productId: string;
  views: number;
  uniqueViewers: number;
  inquiries: number;
  clicks: number;
};

type PerSearchTerm = {
  searchQuery: string;
  searches: number;
  results: number;
  noResult: number;
};

type PerCategory = {
  categoryId: string;
  views: number;
};

type DailySeries = Record<
  string,
  Record<
    string,
    { events: number; uniqueSessions: number; uniqueUsers: number }
  >
>;

type AnalyticsData = {
  totals: AnalyticsTotals;
  perProduct: PerProduct[];
  perSearchTerm: PerSearchTerm[];
  perCategory: PerCategory[];
  dailySeries: DailySeries;
};

type DateRange = { from: string; to: string } | null;

export function AnalyticsDashboard({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";

  const [data, setData] = useState<AnalyticsData | null>(null);
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
          `/api/management/analytics?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (res.ok) {
          setData(json);
        } else {
          setError(
            json.error ||
              (he
                ? "לא ניתן לטעון נתוני אנליטיקה"
                : "Unable to load analytics data"),
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
    // Initial load - fetch without showing loading spinner (loading is true by default)
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (dateRange?.from) params.set("from", dateRange.from);
    if (dateRange?.to) params.set("to", dateRange.to);
    fetch(`/api/management/analytics?${params.toString()}`, {
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
                  ? "לא ניתן לטעון נתוני אנליטיקה"
                  : "Unable to load analytics data"),
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

  const formatNumber = (num: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL").format(num);

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

  const rangeLabel = dateRange
    ? `${new Date(dateRange.from).toLocaleDateString(he ? "he-IL" : "en-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} – ${new Date(dateRange.to).toLocaleDateString(he ? "he-IL" : "en-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}`
    : he
      ? "כל הזמנים"
      : "All time";

  // Stat cards
  const statCards = data
    ? [
        {
          key: "views",
          label: he ? "צפיות במוצרים" : "Product Views",
          value: formatNumber(data.totals.views),
          icon: Eye,
          iconColor: "text-primary",
        },
        {
          key: "uniqueSessions",
          label: he ? "צופים ייחודיים" : "Unique Viewers",
          value: formatNumber(data.totals.uniqueSessions),
          icon: Users,
          iconColor: "text-secondary-accent",
        },
        {
          key: "searches",
          label: he ? "חיפושים" : "Searches",
          value: formatNumber(data.totals.searches),
          icon: Search,
          iconColor: "text-primary",
        },
        {
          key: "noResultSearches",
          label: he ? "חיפושים ללא תוצאות" : "No-Result Searches",
          value: formatNumber(data.totals.noResultSearches),
          icon: AlertTriangle,
          iconColor: "text-error-text",
        },
        {
          key: "inquiries",
          label: he ? "פניות" : "Inquiries",
          value: formatNumber(data.totals.inquiries),
          icon: MessageSquare,
          iconColor: "text-success-text",
        },
        {
          key: "salesCount",
          label: he ? "מכירות" : "Sales",
          value: formatNumber(data.totals.salesCount),
          icon: TrendingUp,
          iconColor: "text-primary",
        },
      ]
    : [];

  // Daily chart data for views and searches
  const dailySeries = data?.dailySeries ?? {};
  const chartDays = Object.keys(dailySeries).sort();
  const viewsData = chartDays.map((day) => {
    const dayData = dailySeries[day];
    const viewEvent =
      dayData?.["product_view"] ?? dayData?.["product_impression"];
    return {
      day,
      views: viewEvent?.events ?? 0,
      searches: dayData?.["product_search"]?.events ?? 0,
    };
  });
  const maxViews =
    viewsData.length > 0 ? Math.max(...viewsData.map((d) => d.views)) : 1;
  const maxSearches =
    viewsData.length > 0 ? Math.max(...viewsData.map((d) => d.searches)) : 1;

  if (loading) {
    return (
      <div
        className="miro-card analytics-dashboard__loading"
        role="status"
        aria-live="polite"
      >
        <div className="analytics-dashboard__spinner" aria-hidden="true" />
        <p>{he ? "טוען נתוני אנליטיקה…" : "Loading analytics data…"}</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="miro-card analytics-dashboard__error" role="alert">
        <AlertCircle
          className="h-10 w-10 text-error-text mx-auto mb-3"
          aria-hidden="true"
        />
        <p className="text-lg font-medium mb-2 text-center">
          {he ? "שגיאה בטעינת נתוני אנליטיקה" : "Failed to load analytics data"}
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

  const hasData =
    data &&
    (data.totals.views > 0 ||
      data.totals.searches > 0 ||
      data.totals.inquiries > 0 ||
      (data.perProduct?.length ?? 0) > 0 ||
      (data.perSearchTerm?.length ?? 0) > 0 ||
      (data.perCategory?.length ?? 0) > 0);

  return (
    <div className="analytics-dashboard space-y-6">
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {he ? "דשבורד אנליטיקה" : "Analytics Dashboard"}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {he
                  ? "מדדי מעורבות, חיפושים וביצועי מוצרים"
                  : "Engagement metrics, searches, and product performance"}
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
                    className={`analytics-dashboard__preset-btn px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
                <div className="flex items-center gap-2 analytics-dashboard__custom-range">
                  <label htmlFor="analytics-from" className="sr-only">
                    {he ? "מתאריך" : "From"}
                  </label>
                  <input
                    id="analytics-from"
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
                  <label htmlFor="analytics-to" className="sr-only">
                    {he ? "עד תאריך" : "To"}
                  </label>
                  <input
                    id="analytics-to"
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

              <span className="analytics-dashboard__range-label text-sm text-muted-foreground">
                {rangeLabel}
              </span>
            </div>
          </div>

          {/* Stat Cards Grid */}
          <div className="p-6 pt-0">
            <div
              className="miro-stat-grid"
              role="list"
              aria-label={he ? "מדדי אנליטיקה" : "Analytics metrics"}
            >
              {statCards.map((stat) => (
                <article
                  key={stat.key}
                  className="miro-stat-card"
                  role="listitem"
                >
                  <div
                    className="analytics-dashboard__stat-icon"
                    aria-hidden="true"
                  >
                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                  <div className="analytics-dashboard__stat-content">
                    <p className="miro-stat-value tabular-nums">{stat.value}</p>
                    <p className="miro-stat-label">{stat.label}</p>
                  </div>
                </article>
              ))}
            </div>

            {/* Daily Series Chart */}
            {hasData && viewsData.length > 0 && (
              <section className="mt-8" aria-labelledby="daily-chart-title">
                <h3
                  id="daily-chart-title"
                  className="text-lg font-semibold mb-4 flex items-center gap-2"
                >
                  <BarChart2 className="h-5 w-5" aria-hidden="true" />
                  {he
                    ? "סדרת יומית — צפיות וחיפושים"
                    : "Daily Series — Views & Searches"}
                </h3>
                <div
                  className="analytics-dashboard__chart"
                  role="img"
                  aria-label={
                    he
                      ? "גרף עמודות יומי של צפיות וחיפושים"
                      : "Daily bar chart of views and searches"
                  }
                >
                  <div className="analytics-dashboard__chart-bars" role="list">
                    {viewsData.map((point) => (
                      <div
                        key={point.day}
                        className="analytics-dashboard__bar-group"
                        role="listitem"
                        aria-label={`${new Date(point.day).toLocaleDateString(he ? "he-IL" : "en-IL")}: ${formatNumber(point.views)} views, ${formatNumber(point.searches)} searches`}
                      >
                        <div className="analytics-dashboard__bar-wrapper">
                          <div
                            className="analytics-dashboard__bar analytics-dashboard__bar--views"
                            style={{
                              height: `${maxViews > 0 ? (point.views / maxViews) * 100 : 0}%`,
                            }}
                            title={
                              he
                                ? `\u05E6\u05E4\u05D9\u05D5\u05EA: ${formatNumber(point.views)}`
                                : `Views: ${formatNumber(point.views)}`
                            }
                          />
                          <div
                            className="analytics-dashboard__bar analytics-dashboard__bar--searches"
                            style={{
                              height: `${maxSearches > 0 ? (point.searches / maxSearches) * 100 : 0}%`,
                            }}
                            title={
                              he
                                ? `\u05D7\u05D9\u05E4\u05D5\u05E9\u05D9\u05DD: ${formatNumber(point.searches)}`
                                : `Searches: ${formatNumber(point.searches)}`
                            }
                          />
                        </div>
                        <div className="analytics-dashboard__bar-labels">
                          <span className="analytics-dashboard__bar-day">
                            {new Date(point.day).toLocaleDateString(
                              he ? "he-IL" : "en-IL",
                              { day: "2-digit", month: "2-digit" },
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="analytics-dashboard__chart-legend flex items-center justify-center gap-4 mt-4 text-sm">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded analytics-dashboard__legend-views"
                        aria-hidden="true"
                      />
                      {he ? "צפיות" : "Views"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded analytics-dashboard__legend-searches"
                        aria-hidden="true"
                      />
                      {he ? "חיפושים" : "Searches"}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* Tables Section */}
            {hasData && (
              <div className="mt-8 space-y-8">
                {/* Most Viewed Products */}
                {(data.perProduct?.length ?? 0) > 0 && (
                  <section aria-labelledby="products-table-title">
                    <h3
                      id="products-table-title"
                      className="text-lg font-semibold mb-3 flex items-center gap-2"
                    >
                      <Package className="h-5 w-5" aria-hidden="true" />
                      {he ? "מוצרים נצפים ביותר" : "Most Viewed Products"}
                    </h3>
                    <div className="analytics-dashboard__table-wrapper">
                      <table
                        className="analytics-dashboard__table"
                        role="table"
                      >
                        <caption className="sr-only">
                          {he
                            ? "טבלת מוצרים נצפים ביותר"
                            : "Most viewed products table"}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">
                              {he ? "מזהה מוצר" : "Product ID"}
                            </th>
                            <th scope="col">{he ? "צפיות" : "Views"}</th>
                            <th scope="col">
                              {he ? "צופים ייחודיים" : "Unique Viewers"}
                            </th>
                            <th scope="col">{he ? "פניות" : "Inquiries"}</th>
                            <th scope="col">{he ? "קליקים" : "Clicks"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.perProduct
                            .sort((a, b) => b.views - a.views)
                            .slice(0, 20)
                            .map((product) => (
                              <tr key={product.productId}>
                                <td>
                                  <code className="font-mono text-sm">
                                    {product.productId.slice(0, 8)}…
                                  </code>
                                </td>
                                <td className="tabular-nums font-mono">
                                  {formatNumber(product.views)}
                                </td>
                                <td className="tabular-nums font-mono">
                                  {formatNumber(product.uniqueViewers)}
                                </td>
                                <td className="tabular-nums font-mono text-success-text">
                                  {formatNumber(product.inquiries)}
                                </td>
                                <td className="tabular-nums font-mono">
                                  {formatNumber(product.clicks)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Search Terms */}
                {(data.perSearchTerm?.length ?? 0) > 0 && (
                  <section aria-labelledby="search-table-title">
                    <h3
                      id="search-table-title"
                      className="text-lg font-semibold mb-3 flex items-center gap-2"
                    >
                      <Search className="h-5 w-5" aria-hidden="true" />
                      {he ? "מונחי חיפוש" : "Search Terms"}
                    </h3>
                    <div className="analytics-dashboard__table-wrapper">
                      <table
                        className="analytics-dashboard__table"
                        role="table"
                      >
                        <caption className="sr-only">
                          {he ? "טבלת מונחי חיפוש" : "Search terms table"}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">{he ? "שאילתה" : "Query"}</th>
                            <th scope="col">{he ? "חיפושים" : "Searches"}</th>
                            <th scope="col">
                              {he ? "תוצאות ממוצעות" : "Avg Results"}
                            </th>
                            <th scope="col">
                              {he ? "ללא תוצאות" : "No Results"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.perSearchTerm.slice(0, 20).map((term, idx) => (
                            <tr key={idx}>
                              <td>
                                <code className="text-sm">
                                  {term.searchQuery}
                                </code>
                              </td>
                              <td className="tabular-nums font-mono">
                                {formatNumber(term.searches)}
                              </td>
                              <td className="tabular-nums font-mono">
                                {term.searches > 0
                                  ? (term.results / term.searches).toFixed(1)
                                  : "0"}
                              </td>
                              <td className="tabular-nums font-mono text-error-text">
                                {formatNumber(term.noResult)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* No-Result Searches List */}
                {data.perSearchTerm.some((t) => t.noResult > 0) && (
                  <section aria-labelledby="no-results-title">
                    <h3
                      id="no-results-title"
                      className="text-lg font-semibold mb-3 flex items-center gap-2"
                    >
                      <AlertTriangle
                        className="h-5 w-5 text-error-text"
                        aria-hidden="true"
                      />
                      {he ? "חיפושים ללא תוצאות" : "No-Result Searches"}
                    </h3>
                    <div className="analytics-dashboard__table-wrapper">
                      <table
                        className="analytics-dashboard__table"
                        role="table"
                      >
                        <caption className="sr-only">
                          {he
                            ? "טבלת חיפושים ללא תוצאות"
                            : "No-result searches table"}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">{he ? "שאילתה" : "Query"}</th>
                            <th scope="col">
                              {he ? "פעמים ללא תוצאות" : "No-Result Count"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.perSearchTerm
                            .filter((t) => t.noResult > 0)
                            .sort((a, b) => b.noResult - a.noResult)
                            .slice(0, 20)
                            .map((term, idx) => (
                              <tr key={idx}>
                                <td>
                                  <code className="text-sm">
                                    {term.searchQuery}
                                  </code>
                                </td>
                                <td className="tabular-nums font-mono text-error-text">
                                  {formatNumber(term.noResult)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Category Views */}
                {(data.perCategory?.length ?? 0) > 0 && (
                  <section aria-labelledby="category-table-title">
                    <h3
                      id="category-table-title"
                      className="text-lg font-semibold mb-3 flex items-center gap-2"
                    >
                      <Tag className="h-5 w-5" aria-hidden="true" />
                      {he ? "צפיות לפי קטגוריה" : "Category Views"}
                    </h3>
                    <div className="analytics-dashboard__table-wrapper">
                      <table
                        className="analytics-dashboard__table"
                        role="table"
                      >
                        <caption className="sr-only">
                          {he
                            ? "טבלת צפיות לפי קטגוריה"
                            : "Category views table"}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">
                              {he ? "מזהה קטגוריה" : "Category ID"}
                            </th>
                            <th scope="col">{he ? "צפיות" : "Views"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.perCategory.slice(0, 20).map((cat) => (
                            <tr key={cat.categoryId}>
                              <td>
                                <code className="font-mono text-sm">
                                  {cat.categoryId === "unknown"
                                    ? he
                                      ? "לא ידוע"
                                      : "Unknown"
                                    : cat.categoryId.slice(0, 8)}
                                  …
                                </code>
                              </td>
                              <td className="tabular-nums font-mono">
                                {formatNumber(cat.views)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Empty State */}
            {!hasData && !loading && !error && (
              <div
                className="analytics-dashboard__empty p-12 text-center"
                role="status"
              >
                <BarChart2
                  className="h-16 w-16 text-muted-foreground mx-auto mb-4"
                  aria-hidden="true"
                />
                <p className="text-lg font-medium mb-2">
                  {he
                    ? "אין נתוני אנליטיקה לתקופה שנבחרה"
                    : "No analytics data for selected period"}
                </p>
                <p className="text-muted-foreground">
                  {he
                    ? "נסה לשנות את טווח התאריכים או המתן לאיסוף נתונים"
                    : "Try changing the date range or wait for data collection"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
