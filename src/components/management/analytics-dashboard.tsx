"use client";

import { useCallback, useEffect, useState } from "react";
import {
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
  dailySeries: Record<
    string,
    Record<
      string,
      { events: number; uniqueSessions: number; uniqueUsers: number }
    >
  >;
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

  const rangeLabel = data
    ? `${new Date(`${range.from}T00:00:00`).toLocaleDateString(he ? "he-IL" : "en-IL")} – ${new Date(`${range.to}T00:00:00`).toLocaleDateString(he ? "he-IL" : "en-IL")}`
    : null;

  return (
    <section className={styles.root}>
      <PageHeader
        title={t(locale, analyticsCopy.title)}
        subtitle={t(locale, analyticsCopy.subtitle)}
      />

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
            role="list"
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
          </div>

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
