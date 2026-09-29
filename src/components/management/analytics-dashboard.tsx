"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart2,
  Eye,
  MessageSquare,
  MousePointerClick,
  Search,
  TrendingUp,
  Users,
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
import { PageHeader } from "@/components/management/ui/page-header";
import { ListSkeleton } from "@/components/management/ui/skeleton";
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

function rangeToIso(value: { from: string; to: string }): {
  from: string;
  to: string;
} | null {
  if (!value.from || !value.to) return null;
  const from = new Date(`${value.from}T00:00:00`);
  const to = new Date(`${value.to}T23:59:59.999`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return null;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

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
                {item.label}
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
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const iso = rangeToIso(range);
    if (!iso) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: iso.from, to: iso.to });
    fetch(`/api/management/analytics?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (controller.signal.aborted) return;
        if (res.ok && json && json.totals) {
          setData(json as AnalyticsResponse);
          setRefreshError(null);
        } else {
          setRefreshError(
            json && typeof json.error === "string"
              ? json.error
              : t(locale, analyticsCopy.loadFailedTitle),
          );
        }
        setInitialLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setRefreshError(t(locale, analyticsCopy.loadFailedTitle));
        setInitialLoading(false);
      });
    return () => controller.abort();
  }, [range, reloadKey, locale]);

  const retry = useCallback(() => {
    setInitialLoading(true);
    setRefreshError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const totals = data?.totals ?? null;
  const zeroResultRate =
    totals && totals.searches > 0
      ? totals.noResultSearches / totals.searches
      : 0;
  const viewToEnquiryRate =
    totals && totals.views > 0 ? totals.productInquiries / totals.views : 0;
  const filteredProducts = (data?.perProduct ?? []).filter((product) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return [product.name.he, product.name.en, product.slug].some(
      (value) => value && value.toLowerCase().includes(q),
    );
  });
  const dailyActivity = Object.entries(data?.dailySeries ?? {})
    .map(([day, eventGroups]) => ({
      day,
      events: Object.values(eventGroups).reduce(
        (sum, group) => sum + group.events,
        0,
      ),
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
    ? `${new Date(`${range.from}T00:00:00`).toLocaleDateString(he ? "he-IL" : "en-IL")} – ${new Date(`${range.to}T00:00:00`).toLocaleDateString(he ? "he-IL" : "en-IL")}`
    : null;

  return (
    <section className={styles.root}>
      <PageHeader
        title={t(locale, analyticsCopy.title)}
        subtitle={t(locale, analyticsCopy.subtitle)}
      />
      {data?.range.generatedAt ? (
        <p className={styles.note}>
          {he ? "עודכן" : "Updated"}:{" "}
          <time dateTime={data.range.generatedAt}>
            {new Date(data.range.generatedAt).toLocaleString(
              he ? "he-IL" : "en-IL",
              { dateStyle: "medium", timeStyle: "short" },
            )}
          </time>
        </p>
      ) : null}

      {refreshError && !data ? (
        <ErrorState
          title={t(locale, analyticsCopy.loadFailedTitle)}
          description={refreshError}
          onRetry={retry}
          retryLabel={t(locale, analyticsCopy.retry)}
        />
      ) : null}
      {refreshError && data ? (
        <Notice tone="warning" onDismiss={() => setRefreshError(null)}>
          {t(locale, analyticsCopy.refreshFailed)}
        </Notice>
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
          <Toolbar
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder={t(locale, analyticsCopy.searchPlaceholder)}
            searchLabel={t(locale, analyticsCopy.searchLabel)}
            actions={
              rangeLabel ? (
                <span className={styles.note}>
                  {t(locale, analyticsCopy.range)}: {rangeLabel}
                </span>
              ) : undefined
            }
          >
            <DateRangePicker
              value={range}
              onChange={setRange}
              labels={dateRangeLabels(locale)}
            />
          </Toolbar>

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
                      <span>{he ? "אירועים בטווח" : "Events in range"}</span>
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
                  <ActivityChart
                    days={dailyActivity.map((point) => point.day)}
                    series={[
                      {
                        label: t(locale, analyticsCopy.events),
                        values: dailyActivity.map((point) => point.events),
                        tone: "gold",
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

          <div className={styles.cardField}>
            <h2 className={styles.sectionTitle}>
              {t(locale, analyticsCopy.tableTitle)}
            </h2>
            <DataTable
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
                          {name ?? t(locale, analyticsCopy.unknownProduct)}
                        </span>
                        {product.slug ? (
                          <span
                            className={`${styles.productSlug} ${styles.ltrText}`}
                          >
                            {product.slug}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td dir="auto">
                      {category ?? t(locale, analyticsCopy.unknownCategory)}
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
                  </tr>
                );
              })}
            </DataTable>
          </div>
        </>
      )}
    </section>
  );
}
