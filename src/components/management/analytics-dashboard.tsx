"use client";

import { useState } from "react";
import {
  Activity,
  BarChart2,
  Eye,
  MessageSquare,
  MousePointerClick,
  Search,
  TrendingUp,
  Users,
  RefreshCw,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { DataTable } from "@/components/management/ui/data-table";
import {
  DateRangePicker,
  dateRangeLabels,
  resolveDateRange,
  type DateRangeValue,
} from "@/components/management/ui/date-range-picker";
import { EmptyState } from "@/components/management/ui/empty-state";
import { ErrorState } from "@/components/management/ui/error-state";
import { MetricCard } from "@/components/management/ui/metric-card";
import { Notice } from "@/components/management/ui/notice";
import { Drawer } from "./ui/drawer";
import Link from "next/link";
import { reportingRangeParams } from "@/lib/management-reporting";
import { useManagementReport } from "./ui/use-management-report";
import {
  ReportingHeader,
  ReportChoices,
  reportingStyles as report,
} from "./ui/reporting-workspace";
import { ListSkeleton } from "@/components/management/ui/skeleton";
import { OverflowText } from "./ui/overflow-text";
import { Toolbar } from "@/components/management/ui/toolbar";
import {
  analyticsCopy,
  formatCount,
  formatPercent,
  t,
} from "./analytics-dashboard.copy";
import { ActivityChart } from "./ui/activity-chart";
import styles from "./analytics-dashboard.module.css";

type AnalyticsResponse = {
  range: { from: string; to: string; generatedAt: string };
  totals: {
    /** product_view events — product detail page views. */
    views: number;
    /** product_impression events — listing/search impressions. */
    impressions: number;
    uniqueSessions: number;
    searches: number;
    noResultSearches: number;
    contactClicks: {
      contact: number;
      phone: number;
      whatsapp: number;
      total: number;
    };
    productInquiries: number;
    enquiriesSubmitted: number;
    enquiryConversionRate: number;
    salesCount: number | null;
  };
  perProduct: {
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
    /** enquiries / views (0 when there are no views). */
    conversion: number;
  }[];
  perSearchTerm: { searchQuery: string; searches: number }[];
  perCategory: {
    categoryId: string | null;
    slug: string | null;
    name: { he: string | null; en: string | null };
    views: number;
  }[];
  dailySeries: Record<string, Record<string, { events: number }>>;
  partial: { uniqueViewersCapped: boolean };
};

function RankingCard({
  title,
  emptyLabel,
  items,
  locale,
}: {
  title: string;
  emptyLabel: string;
  items: { key: string; label: string; value: number }[];
  locale: Locale;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className={styles.cardField}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {items.length > 0 ? (
        <ol className={styles.rankingList}>
          {items.map((item) => (
            <li key={item.key} className={styles.rankingItem}>
              <span className={styles.rankingLabel} dir="auto">
                <OverflowText text={item.label} />
              </span>
              <span className={styles.rankingValue}>
                {formatCount(item.value, locale)}
              </span>
              <span className={styles.rankingTrack} aria-hidden="true">
                <span
                  className={styles.rankingFill}
                  style={{ inlineSize: `${(item.value / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.note}>{emptyLabel}</p>
      )}
    </div>
  );
}

export function AnalyticsDashboard({ locale }: { locale: Locale }) {
  const he = locale === "he";

  const [range, setRange] = useState<DateRangeValue>(() => ({
    preset: "last7",
    ...resolveDateRange("last7"),
  }));
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"overview" | "products">("overview");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [activityMetric, setActivityMetric] = useState<
    "all" | "product_view" | "product_impression" | "product_search"
  >("all");
  const [sort, setSort] = useState<"views" | "enquiries" | "conversion">(
    "views",
  );
  const [categoryFilter, setCategoryFilter] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    data,
    error: refreshError,
    loading: initialLoading,
    reload: retry,
  } = useManagementReport<AnalyticsResponse>(
    `/api/management/analytics?${reportingRangeParams(range)}`,
    t(locale, analyticsCopy.loadFailedTitle),
  );
  const selected =
    data?.perProduct.find((product) => product.productId === selectedId) ??
    null;

  const totals = data?.totals ?? null;
  const zeroResultRate =
    totals && totals.searches > 0
      ? totals.noResultSearches / totals.searches
      : 0;
  const viewToEnquiryRate =
    totals && totals.views > 0 ? totals.productInquiries / totals.views : 0;
  const filteredProducts = (data?.perProduct ?? [])
    .filter((product) => {
      if (categoryFilter && product.category?.id !== categoryFilter)
        return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return [product.name.he, product.name.en, product.slug].some(
        (value) => value && value.toLowerCase().includes(q),
      );
    })
    .sort((a, b) => b[sort] - a[sort] || b.views - a.views);
  const dailyActivity = Object.entries(data?.dailySeries ?? {})
    .map(([day, eventGroups]) => ({
      day,
      events:
        activityMetric === "all"
          ? Object.values(eventGroups).reduce(
              (sum, group) => sum + group.events,
              0,
            )
          : (eventGroups[activityMetric]?.events ?? 0),
    }))
    .sort((first, second) => first.day.localeCompare(second.day));
  const activityTotal = dailyActivity.reduce(
    (sum, point) => sum + point.events,
    0,
  );
  const peakDay = dailyActivity.reduce<(typeof dailyActivity)[number] | null>(
    (peak, point) => (!peak || point.events > peak.events ? point : peak),
    null,
  );
  const topSearches = [...(data?.perSearchTerm ?? [])]
    .sort((first, second) => second.searches - first.searches)
    .slice(0, 5);
  const topCategories = [...(data?.perCategory ?? [])]
    .sort((first, second) => second.views - first.views)
    .slice(0, 5);

  const rangeLabel = data
    ? `${new Date(data.range.from).toLocaleDateString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem" })} – ${new Date(data.range.to).toLocaleDateString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem" })}`
    : null;
  const categories = [
    ...new Map(
      (data?.perProduct ?? []).flatMap((product) =>
        product.category
          ? [[product.category.id, product.category] as const]
          : [],
      ),
    ).values(),
  ];
  return (
    <section
      className={`${styles.root} ${report.workspace}`}
      aria-busy={initialLoading}
    >
      <ReportingHeader
        locale={locale}
        section="analytics"
        title={
          he ? "מהעניין באתר לפנייה הבאה" : "From interest to your next enquiry"
        }
        subtitle={
          he
            ? "הבן מה הלקוחות מחפשים, אילו מוצרים מעניינים אותם ואיך הם יוצרים קשר."
            : "Understand what customers search for, which products draw attention, and how they get in touch."
        }
        actions={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--secondary"
              onClick={() => setOptionsOpen(true)}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              {he ? "אפשרויות תצוגה" : "View options"}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              disabled={initialLoading}
              onClick={retry}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {he ? "רענון" : "Refresh"}
            </button>
          </>
        }
      />
      <div className={report.toolbar}>
        <ReportChoices
          label={he ? "תצוגת אנליטיקה" : "Analytics view"}
          value={view}
          onChange={setView}
          options={[
            {
              value: "overview",
              label: he ? "סקירת פעילות" : "Activity overview",
            },
            {
              value: "products",
              label: he ? "ביצועי מוצרים" : "Product performance",
            },
          ]}
        />
        <DateRangePicker
          value={range}
          onChange={setRange}
          labels={dateRangeLabels(locale)}
        />
      </div>
      <p className={styles.note} role="status">
        {initialLoading
          ? he
            ? "מעדכן נתונים…"
            : "Updating insights…"
          : data
            ? `${rangeLabel} · ${he ? "עודכן" : "Updated"} ${new Date(data.range.generatedAt).toLocaleTimeString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}`
            : ""}
      </p>

      {refreshError && !data ? (
        <ErrorState
          title={t(locale, analyticsCopy.loadFailedTitle)}
          description={refreshError}
          onRetry={retry}
          retryLabel={t(locale, analyticsCopy.retry)}
        />
      ) : null}
      {refreshError && data ? (
        <Notice tone="warning">{t(locale, analyticsCopy.refreshFailed)}</Notice>
      ) : null}

      {initialLoading && !data ? (
        <>
          <div className={styles.skeletonGrid} aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => (
              <MetricCard key={index} label="…" value="" loading />
            ))}
          </div>
          <ListSkeleton rows={6} />
        </>
      ) : (
        <>
          <div
            className={styles.headerGrid}
            aria-label={t(locale, analyticsCopy.title)}
            aria-busy={!totals}
          >
            <MetricCard
              tone="accent"
              icon={<Eye size={18} />}
              label={t(locale, analyticsCopy.metricViews)}
              value={totals ? formatCount(totals.views, locale) : "—"}
            />
            <MetricCard
              icon={<BarChart2 size={18} />}
              label={t(locale, analyticsCopy.metricImpressions)}
              value={totals ? formatCount(totals.impressions, locale) : "—"}
              footer={t(locale, analyticsCopy.impressionsNote)}
            />
            <MetricCard
              icon={<Users size={18} />}
              label={t(locale, analyticsCopy.metricUniqueSessions)}
              value={totals ? formatCount(totals.uniqueSessions, locale) : "—"}
              footer={
                data?.partial.uniqueViewersCapped
                  ? t(locale, analyticsCopy.uniqueViewersCapped)
                  : t(locale, analyticsCopy.uniqueSessionsNote)
              }
            />
            <MetricCard
              icon={<Search size={18} />}
              label={t(locale, analyticsCopy.metricSearches)}
              value={totals ? formatCount(totals.searches, locale) : "—"}
              footer={
                totals
                  ? `${formatCount(totals.noResultSearches, locale)} ${t(locale, analyticsCopy.zeroResultNote)} (${formatPercent(zeroResultRate, locale)})`
                  : undefined
              }
            />
            <MetricCard
              icon={<MousePointerClick size={18} />}
              label={t(locale, analyticsCopy.metricContactClicks)}
              value={
                totals ? formatCount(totals.contactClicks.total, locale) : "—"
              }
              footer={
                totals ? (
                  <ul className={styles.breakdown}>
                    <li>
                      {t(locale, analyticsCopy.clickCall)}:{" "}
                      {formatCount(totals.contactClicks.phone, locale)}
                    </li>
                    <li>
                      {t(locale, analyticsCopy.clickWhatsapp)}:{" "}
                      {formatCount(totals.contactClicks.whatsapp, locale)}
                    </li>
                    <li>
                      {t(locale, analyticsCopy.clickEnquiry)}:{" "}
                      {formatCount(totals.contactClicks.contact, locale)}
                    </li>
                  </ul>
                ) : undefined
              }
            />
            <MetricCard
              icon={<MessageSquare size={18} />}
              label={t(locale, analyticsCopy.metricEnquiriesSubmitted)}
              value={
                totals ? formatCount(totals.enquiriesSubmitted, locale) : "—"
              }
              footer={t(locale, analyticsCopy.enquiriesSubmittedNote)}
            />
            <MetricCard
              tone="success"
              icon={<TrendingUp size={18} />}
              label={t(locale, analyticsCopy.metricConversion)}
              value={
                totals
                  ? totals.views > 0
                    ? formatPercent(viewToEnquiryRate, locale)
                    : "—"
                  : "—"
              }
              footer={
                totals
                  ? `${formatCount(totals.productInquiries, locale)} ${t(locale, analyticsCopy.enquiryClickCount)} · ${t(locale, analyticsCopy.conversionNote)}`
                  : undefined
              }
            />
            <MetricCard
              icon={<Eye size={18} />}
              label={he ? "מוצרים עם צפיות" : "Products with detail views"}
              value={
                data
                  ? formatCount(
                      data.perProduct.filter((product) => product.views > 0)
                        .length,
                      locale,
                    )
                  : "—"
              }
              footer={
                he
                  ? "מוצרים שונים שנצפו בטווח שנבחר"
                  : "Distinct products viewed in the selected range"
              }
            />
          </div>

          {view === "overview" ? (
            <>
              <section className={styles.insightsGrid}>
                <div className={`${styles.cardField} ${styles.activityCard}`}>
                  <div>
                    <h2 className={styles.sectionTitle}>
                      <Activity size={18} aria-hidden="true" />
                      {t(locale, analyticsCopy.activityTitle)}
                    </h2>
                    <p className={styles.note}>
                      {t(locale, analyticsCopy.activityDescription)}
                    </p>
                  </div>
                  {dailyActivity.length > 0 ? (
                    <>
                      <div className={styles.activitySummary}>
                        <div>
                          <span>
                            {he ? "אירועים בטווח" : "Events in range"}
                          </span>
                          <strong>{formatCount(activityTotal, locale)}</strong>
                        </div>
                        <div>
                          <span>
                            {he ? "ימים עם פעילות" : "Days with activity"}
                          </span>
                          <strong>
                            {formatCount(
                              dailyActivity.filter((point) => point.events > 0)
                                .length,
                              locale,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>{he ? "היום הפעיל ביותר" : "Busiest day"}</span>
                          <strong>
                            {peakDay && peakDay.events > 0
                              ? new Date(
                                  `${peakDay.day}T12:00:00Z`,
                                ).toLocaleDateString(he ? "he-IL" : "en-IL", {
                                  day: "numeric",
                                  month: "short",
                                  timeZone: "UTC",
                                })
                              : "—"}
                          </strong>
                        </div>
                      </div>
                      <div className={report.panelHeader}>
                        <ReportChoices
                          label={he ? "פעילות בתרשים" : "Chart activity"}
                          value={activityMetric}
                          onChange={setActivityMetric}
                          options={[
                            {
                              value: "all",
                              label: he ? "כל האירועים" : "All events",
                            },
                            {
                              value: "product_view",
                              label: he ? "צפיות" : "Views",
                            },
                            {
                              value: "product_impression",
                              label: he ? "חשיפות" : "Impressions",
                            },
                            {
                              value: "product_search",
                              label: he ? "חיפושים" : "Searches",
                            },
                          ]}
                        />
                        <ReportChoices
                          label={he ? "סוג התרשים" : "Chart style"}
                          value={chartType}
                          onChange={setChartType}
                          options={[
                            { value: "line", label: he ? "קווים" : "Lines" },
                            { value: "bar", label: he ? "עמודות" : "Bars" },
                          ]}
                        />
                      </div>
                      <ActivityChart
                        kind={chartType}
                        days={dailyActivity.map((point) => point.day)}
                        series={[
                          {
                            label: t(locale, analyticsCopy.events),
                            values: dailyActivity.map((point) => point.events),
                            tone: "cyan",
                          },
                        ]}
                        locale={locale}
                        unit={he ? "מספר אירועים" : "Event count"}
                        note={
                          he
                            ? "סיכומים יומיים לפי UTC. אין כאן פירוט לפי שעה; ימים ללא אירועים אינם מוצגים."
                            : "Daily totals in UTC. Hourly detail is not available here; days without recorded events are omitted."
                        }
                      />
                    </>
                  ) : (
                    <p className={styles.note}>
                      {t(locale, analyticsCopy.noRankingData)}
                    </p>
                  )}
                </div>

                <RankingCard
                  title={t(locale, analyticsCopy.topSearchesTitle)}
                  emptyLabel={t(locale, analyticsCopy.noRankingData)}
                  items={topSearches.map((item) => ({
                    key: item.searchQuery,
                    label: item.searchQuery,
                    value: item.searches,
                  }))}
                  locale={locale}
                />
                <RankingCard
                  title={t(locale, analyticsCopy.topCategoriesTitle)}
                  emptyLabel={t(locale, analyticsCopy.noRankingData)}
                  items={topCategories.map((item, index) => ({
                    key: item.categoryId ?? `unknown-${index}`,
                    label:
                      (he ? item.name.he : item.name.en) ??
                      (he ? item.name.en : item.name.he) ??
                      t(locale, analyticsCopy.unknownCategory),
                    value: item.views,
                  }))}
                  locale={locale}
                />
              </section>
              <section className={report.panel}>
                <div className={report.panelHeader}>
                  <h2>{he ? "ערוצי יצירת קשר" : "How customers reach you"}</h2>
                  <Link
                    href={`/${locale}/admin/requests`}
                    className="mgmt-button mgmt-button--secondary"
                  >
                    {he ? "פתיחת הפניות" : "Open requests"}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                <dl className={report.ledger}>
                  {(
                    [
                      [
                        he ? "טלפון" : "Phone clicks",
                        totals?.contactClicks.phone,
                      ],
                      [
                        he ? "וואטסאפ" : "WhatsApp clicks",
                        totals?.contactClicks.whatsapp,
                      ],
                      [
                        he ? "טופס יצירת קשר" : "Contact form clicks",
                        totals?.contactClicks.contact,
                      ],
                      [
                        he ? "פניות שנשלחו" : "Submitted requests",
                        totals?.enquiriesSubmitted,
                      ],
                    ] as const
                  ).map(([label, count]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {count === undefined ? "—" : formatCount(count, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className={report.muted}>
                  {he
                    ? "לחיצות אינן פניות שנשלחו. המדדים מציגים פעילות, ולא משפך של לקוחות ייחודיים."
                    : "Clicks and submitted requests are separate measures of activity, rather than a funnel of unique customers."}
                </p>
              </section>
            </>
          ) : (
            <div className={styles.cardField}>
              <h2 className={styles.sectionTitle}>
                {t(locale, analyticsCopy.tableTitle)}
              </h2>
              <p className={styles.note}>
                {he
                  ? "עד עשרת המוצרים המובילים לפי צפיות בטווח שנבחר. החיפוש, המיון והקטגוריה חלים על קבוצה זו."
                  : "Up to ten leading products by views in this range. Search, sorting, and category filters apply to this group."}
              </p>
              <Toolbar
                searchValue={query}
                onSearchChange={setQuery}
                searchPlaceholder={t(locale, analyticsCopy.searchPlaceholder)}
                searchLabel={t(locale, analyticsCopy.searchLabel)}
              >
                <label className={styles.filterLabel}>
                  {he ? "מיון" : "Sort by"}
                  <select
                    className="mgmt-select"
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as typeof sort)
                    }
                  >
                    <option value="views">{he ? "צפיות" : "Views"}</option>
                    <option value="enquiries">
                      {he ? "פניות" : "Enquiries"}
                    </option>
                    <option value="conversion">
                      {he ? "שיעור פנייה" : "Enquiry rate"}
                    </option>
                  </select>
                </label>
                <label className={styles.filterLabel}>
                  {he ? "קטגוריה" : "Category"}
                  <select
                    className="mgmt-select"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    <option value="">
                      {he ? "כל הקטגוריות" : "All categories"}
                    </option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {(he ? category.name_he : category.name_en) ??
                          category.name_en ??
                          category.name_he ??
                          t(locale, analyticsCopy.unknownCategory)}
                      </option>
                    ))}
                  </select>
                </label>
              </Toolbar>
              <DataTable
                columnWidths={[
                  "22%",
                  "16%",
                  "9%",
                  "12%",
                  "12%",
                  "9%",
                  "10%",
                  "10%",
                ]}
                minWidth="70rem"
                tableClassName="mgmt-analytics-table"
                stickyHeader={false}
                caption={t(locale, analyticsCopy.tableCaption)}
                isEmpty={filteredProducts.length === 0}
                emptyState={
                  <EmptyState
                    compact
                    title={
                      query.trim()
                        ? t(locale, analyticsCopy.searchEmptyTitle)
                        : t(locale, analyticsCopy.tableEmptyTitle)
                    }
                    description={t(locale, analyticsCopy.tableEmptyDescription)}
                  />
                }
                head={
                  <tr>
                    <th scope="col">{t(locale, analyticsCopy.colProduct)}</th>
                    <th scope="col">{t(locale, analyticsCopy.colCategory)}</th>
                    <th scope="col" className={styles.numeric}>
                      {t(locale, analyticsCopy.colViews)}
                    </th>
                    <th scope="col" className={styles.numeric}>
                      {t(locale, analyticsCopy.colUniqueViewers)}
                    </th>
                    <th scope="col" className={styles.numeric}>
                      {t(locale, analyticsCopy.colContactClicks)}
                    </th>
                    <th scope="col" className={styles.numeric}>
                      {t(locale, analyticsCopy.colEnquiries)}
                    </th>
                    <th scope="col" className={styles.numeric}>
                      {t(locale, analyticsCopy.colConversion)}
                    </th>
                    <th scope="col">{he ? "פרטים" : "Details"}</th>
                  </tr>
                }
              >
                {filteredProducts.map((product) => {
                  const name = he
                    ? (product.name.he ?? product.name.en)
                    : (product.name.en ?? product.name.he);
                  const category = product.category
                    ? he
                      ? (product.category.name_he ?? product.category.name_en)
                      : (product.category.name_en ?? product.category.name_he)
                    : null;
                  return (
                    <tr key={product.productId}>
                      <td>
                        <div className={styles.productCell}>
                          <span dir="auto">
                            <OverflowText
                              text={
                                name ?? t(locale, analyticsCopy.unknownProduct)
                              }
                            />
                          </span>
                          {product.slug ? (
                            <span
                              className={`${styles.productSlug} ${styles.ltrText}`}
                            >
                              <OverflowText text={product.slug} dir="ltr" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td dir="auto">
                        <OverflowText
                          text={
                            category ?? t(locale, analyticsCopy.unknownCategory)
                          }
                        />
                      </td>
                      <td className={styles.numeric}>
                        {formatCount(product.views, locale)}
                      </td>
                      <td className={styles.numeric}>
                        {formatCount(product.uniqueViewers, locale)}
                      </td>
                      <td className={styles.numeric}>
                        {formatCount(product.contactClicks, locale)}
                      </td>
                      <td className={styles.numeric}>
                        {formatCount(product.enquiries, locale)}
                      </td>
                      <td className={styles.numeric}>
                        {product.views > 0
                          ? formatPercent(product.conversion, locale)
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="mgmt-button mgmt-button--secondary"
                          onClick={() => setSelectedId(product.productId)}
                          aria-label={`${he ? "פרטים עבור" : "Details for"} ${name ?? product.productId}`}
                        >
                          <ArrowUpRight size={17} aria-hidden="true" />
                          {he ? "פרטים" : "Details"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          )}
        </>
      )}
      <Drawer
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title={he ? "אפשרויות אנליטיקה" : "Analytics options"}
        side="end"
        className={report.drawer}
        closeLabel={he ? "סגירה" : "Close"}
      >
        <div className={report.details}>
          <DateRangePicker
            value={range}
            onChange={setRange}
            labels={dateRangeLabels(locale)}
          />
          <ReportChoices
            label={he ? "סוג התרשים" : "Chart style"}
            value={chartType}
            onChange={setChartType}
            options={[
              { value: "line", label: he ? "קווים" : "Lines" },
              { value: "bar", label: he ? "עמודות" : "Bars" },
            ]}
          />
          <p className={report.muted}>
            {he
              ? "נתוני פעילות יומיים לפי UTC. מבקרים ייחודיים למוצר עשויים להיות מוגבלים בנתוני המקור."
              : "Daily activity uses UTC. Per-product unique viewers may be limited by the source data cap."}
          </p>
          <Link
            href={`/${locale}/admin/storefront-merchandising`}
            className="mgmt-button mgmt-button--secondary"
          >
            {he ? "ניהול תצוגת החנות" : "Store merchandising"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </Drawer>
      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={
          selected ? (
            <OverflowText
              text={
                (he ? selected.name.he : selected.name.en) ??
                selected.name.en ??
                selected.name.he ??
                t(locale, analyticsCopy.unknownProduct)
              }
            />
          ) : (
            ""
          )
        }
        side="end"
        className={report.drawer}
        closeLabel={he ? "סגירה" : "Close"}
      >
        {selected ? (
          <div className={report.details}>
            <p className={report.muted}>{rangeLabel}</p>
            <dl className={report.ledger}>
              {(
                [
                  [t(locale, analyticsCopy.colViews), selected.views],
                  [
                    t(locale, analyticsCopy.colUniqueViewers),
                    selected.uniqueViewers,
                  ],
                  [
                    t(locale, analyticsCopy.colContactClicks),
                    selected.contactClicks,
                  ],
                  [t(locale, analyticsCopy.colEnquiries), selected.enquiries],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{formatCount(value, locale)}</dd>
                </div>
              ))}
            </dl>
            <p className={report.muted}>
              {t(locale, analyticsCopy.colConversion)}:{" "}
              {selected.views
                ? formatPercent(selected.conversion, locale)
                : "—"}
              .{" "}
              {he
                ? "פניות חלקי צפיות במוצר."
                : "Enquiries divided by product views."}
            </p>
            {data?.partial.uniqueViewersCapped ? (
              <Notice tone="warning">
                {t(locale, analyticsCopy.uniqueViewersCapped)}
              </Notice>
            ) : null}
            <Link
              href={`/${locale}/admin/products/${selected.productId}`}
              className="mgmt-button mgmt-button--secondary"
            >
              {he ? "עריכת המוצר" : "Edit product"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            {selected.slug && selected.category?.slug ? (
              <Link
                href={`/${locale}/store/${selected.category.slug}/${selected.slug}`}
                className="mgmt-button mgmt-button--secondary"
              >
                {he ? "המוצר בחנות" : "View in store"}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ) : null}
            <Link
              href={`/${locale}/admin/requests`}
              className="mgmt-button mgmt-button--ghost"
            >
              {he ? "תור הפניות" : "Request queue"}
            </Link>
          </div>
        ) : null}
      </Drawer>
    </section>
  );
}
