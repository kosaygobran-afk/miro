import Link from "next/link";
import {
  AlertTriangle,
  Box,
  Boxes,
  FileEdit,
  Inbox,
  ScrollText,
  ShoppingCart,
  Timer,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { DataTable } from "@/components/management/ui/data-table";
import { EmptyState } from "@/components/management/ui/empty-state";
import { ErrorState } from "@/components/management/ui/error-state";
import {
  MetricCard,
  type MetricCardTone,
} from "@/components/management/ui/metric-card";
import { PageHeader } from "@/components/management/ui/page-header";
import {
  activitySentence,
  formatCurrency,
  formatRelativeTime,
  overviewCopy,
  t,
} from "./overview-panel.copy";
import styles from "./overview-panel.module.css";

export type SalesBucket = {
  revenue: number;
  net: number;
  vat: number;
  count: number;
};

export type AttentionData = {
  newEnquiries: number;
  staleEnquiries: number;
  lowStock: number;
  outOfStock: number;
  draftProducts: number;
};

export type TopMover = {
  id: string;
  nameHe: string | null;
  nameEn: string | null;
  unitsSold: number;
};

export type RecentSale = {
  id: string;
  orderNumber: string;
  customerName: string | null;
  total: number;
  createdAt: string;
  recordedByName: string | null;
};

export type ActivityEntry = {
  id: string;
  action: string;
  /** Display name resolved for the actor; null when unknown. */
  actorName: string | null;
  /** True when the event has no actor (system/automation entry). */
  actorIsSystem: boolean;
  entityName: string | null;
  createdAt: string;
};

export type PanelState<T> = {
  data: T | null;
  /** When true, `data` is unusable — render an ErrorState, never fake zeros. */
  error: boolean;
};

export type OverviewPanelProps = {
  locale: Locale;
  /** Server-computed render time (ISO) for stable relative timestamps. */
  nowIso: string;
  kpis: PanelState<{ today: SalesBucket; month: SalesBucket }>;
  attention: PanelState<AttentionData>;
  operations: PanelState<{
    inventoryUnits: number;
    inventoryValue: number;
    topMovers: TopMover[];
    recentSales: RecentSale[];
  }>;
  activity: PanelState<{ events: ActivityEntry[] }>;
};

function PanelError({ locale }: { locale: Locale }) {
  return (
    <ErrorState
      title={t(locale, overviewCopy.dataUnavailable)}
      description={t(locale, overviewCopy.dataUnavailableHint)}
    />
  );
}

export function OverviewPanel({
  locale,
  nowIso,
  kpis,
  attention,
  operations,
  activity,
}: OverviewPanelProps) {
  const he = locale === "he";
  const base = `/${locale}/admin`;

  const netVatNote = (bucket: SalesBucket) =>
    he
      ? `נטו: ${formatCurrency(bucket.net, locale)} · מע״מ: ${formatCurrency(bucket.vat, locale)}`
      : `Net: ${formatCurrency(bucket.net, locale)} · VAT: ${formatCurrency(bucket.vat, locale)}`;

  const attentionCards = attention.data
    ? ([
        {
          key: "newEnquiries",
          label: t(locale, overviewCopy.newEnquiries),
          value: attention.data.newEnquiries,
          icon: <Inbox size={18} />,
          href: `${base}/requests?status=new`,
          tone: "default" as MetricCardTone,
        },
        {
          key: "staleEnquiries",
          label: t(locale, overviewCopy.staleEnquiries),
          value: attention.data.staleEnquiries,
          icon: <Timer size={18} />,
          href: `${base}/requests?status=new`,
          tone:
            attention.data.staleEnquiries > 0
              ? ("warning" as MetricCardTone)
              : ("default" as MetricCardTone),
        },
        {
          key: "lowStock",
          label: t(locale, overviewCopy.lowStock),
          value: attention.data.lowStock,
          icon: <AlertTriangle size={18} />,
          href: `${base}/inventory?status=low`,
          tone:
            attention.data.lowStock > 0
              ? ("warning" as MetricCardTone)
              : ("default" as MetricCardTone),
        },
        {
          key: "outOfStock",
          label: t(locale, overviewCopy.outOfStock),
          value: attention.data.outOfStock,
          icon: <XCircle size={18} />,
          href: `${base}/inventory?status=out_of_stock`,
          tone:
            attention.data.outOfStock > 0
              ? ("danger" as MetricCardTone)
              : ("default" as MetricCardTone),
        },
        {
          key: "draftProducts",
          label: t(locale, overviewCopy.draftProducts),
          value: attention.data.draftProducts,
          icon: <FileEdit size={18} />,
          href: `${base}/products?status=draft`,
          tone: "default" as MetricCardTone,
        },
      ] as const)
    : null;

  const showRecordedByColumn = Boolean(
    operations.data?.recentSales.some((sale) => sale.recordedByName),
  );

  return (
    <section className={styles.root}>
      <PageHeader
        title={t(locale, overviewCopy.title)}
        subtitle={t(locale, overviewCopy.subtitle)}
      />

      {/* ROW 1 — primary KPIs (orders-backed only) */}
      <div className={styles.row}>
        <h2 className={styles.rowTitle}>{t(locale, overviewCopy.kpisRow)}</h2>
        {kpis.error || !kpis.data ? (
          <PanelError locale={locale} />
        ) : (
          <div className={styles.cardGrid}>
            <MetricCard
              tone="accent"
              icon={<TrendingUp size={18} />}
              label={t(locale, overviewCopy.revenueToday)}
              value={formatCurrency(kpis.data.today.revenue, locale)}
              footer={netVatNote(kpis.data.today)}
            />
            <MetricCard
              tone="accent"
              icon={<TrendingUp size={18} />}
              label={t(locale, overviewCopy.revenueMonth)}
              value={formatCurrency(kpis.data.month.revenue, locale)}
              footer={netVatNote(kpis.data.month)}
            />
            <MetricCard
              icon={<ShoppingCart size={18} />}
              label={t(locale, overviewCopy.salesCountToday)}
              value={kpis.data.today.count.toLocaleString(
                he ? "he-IL" : "en-IL",
              )}
            />
            <MetricCard
              icon={<ShoppingCart size={18} />}
              label={t(locale, overviewCopy.salesCountMonth)}
              value={kpis.data.month.count.toLocaleString(
                he ? "he-IL" : "en-IL",
              )}
            />
          </div>
        )}
      </div>

      {/* ROW 2 — attention */}
      <div className={styles.row}>
        <h2 className={styles.rowTitle}>
          {t(locale, overviewCopy.attentionRow)}
        </h2>
        {attention.error || !attention.data || !attentionCards ? (
          <PanelError locale={locale} />
        ) : (
          <div className={styles.cardGrid}>
            {attentionCards.map((card) => (
              <Link
                key={card.key}
                href={card.href}
                className={styles.metricLink}
              >
                <MetricCard
                  tone={card.tone}
                  icon={card.icon}
                  label={card.label}
                  value={card.value.toLocaleString(he ? "he-IL" : "en-IL")}
                  footer={
                    <span className={styles.metricFooterLink}>
                      {t(locale, overviewCopy.openFiltered)}
                    </span>
                  }
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ROW 3 — operations */}
      <div className={styles.row}>
        <h2 className={styles.rowTitle}>
          {t(locale, overviewCopy.operationsRow)}
        </h2>
        {operations.error || !operations.data ? (
          <PanelError locale={locale} />
        ) : (
          <div className={styles.opsGrid}>
            <div className={styles.panelCard}>
              <h3 className={styles.panelTitle}>
                {t(locale, overviewCopy.inventoryUnits)} ·{" "}
                {t(locale, overviewCopy.inventoryValue)}
              </h3>
              <div className={styles.innerGrid}>
                <MetricCard
                  icon={<Box size={18} />}
                  label={t(locale, overviewCopy.inventoryUnits)}
                  value={operations.data.inventoryUnits.toLocaleString(
                    he ? "he-IL" : "en-IL",
                  )}
                />
                <MetricCard
                  icon={<Boxes size={18} />}
                  label={t(locale, overviewCopy.inventoryValue)}
                  value={formatCurrency(operations.data.inventoryValue, locale)}
                />
              </div>
              <div>
                <h4 className={styles.panelTitle}>
                  {t(locale, overviewCopy.topMoversTitle)}
                </h4>
                <p className={styles.panelNote}>
                  {t(locale, overviewCopy.topMoversRange)}
                </p>
                {operations.data.topMovers.length === 0 ? (
                  <EmptyState
                    compact
                    title={t(locale, overviewCopy.topMoversEmpty)}
                  />
                ) : (
                  <ol className={styles.moverList}>
                    {operations.data.topMovers.map((mover) => {
                      const name = he
                        ? (mover.nameHe ?? mover.nameEn)
                        : (mover.nameEn ?? mover.nameHe);
                      return (
                        <li key={mover.id} className={styles.moverItem}>
                          <span className={styles.moverName} dir="auto">
                            {name ?? "—"}
                          </span>
                          <span className={styles.moverCount}>
                            {mover.unitsSold.toLocaleString(
                              he ? "he-IL" : "en-IL",
                            )}{" "}
                            {t(locale, overviewCopy.unitsSold)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>

            <div className={styles.panelCard}>
              <h3 className={styles.panelTitle}>
                {t(locale, overviewCopy.recentSalesTitle)}
              </h3>
              <DataTable
                stickyHeader={false}
                caption={he ? "טבלת מכירות אחרונות" : "Recent sales table"}
                isEmpty={operations.data.recentSales.length === 0}
                emptyState={
                  <EmptyState
                    compact
                    title={t(locale, overviewCopy.recentSalesEmpty)}
                  />
                }
                head={
                  <tr>
                    <th scope="col">
                      {t(locale, overviewCopy.colOrderNumber)}
                    </th>
                    <th scope="col">{t(locale, overviewCopy.colCustomer)}</th>
                    <th scope="col">{t(locale, overviewCopy.colTotal)}</th>
                    {showRecordedByColumn ? (
                      <th scope="col">
                        {t(locale, overviewCopy.colRecordedBy)}
                      </th>
                    ) : null}
                    <th scope="col">{t(locale, overviewCopy.colWhen)}</th>
                  </tr>
                }
              >
                {operations.data.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <span className={styles.ltrText}>{sale.orderNumber}</span>
                    </td>
                    <td dir="auto">{sale.customerName ?? "—"}</td>
                    <td>
                      <span className={styles.ltrText}>
                        {formatCurrency(sale.total, locale)}
                      </span>
                    </td>
                    {showRecordedByColumn ? (
                      <td dir="auto">{sale.recordedByName ?? "—"}</td>
                    ) : null}
                    <td>
                      {formatRelativeTime(sale.createdAt, nowIso, locale)}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </div>
        )}
      </div>

      {/* ROW 4 — activity */}
      <div className={styles.row}>
        <h2 className={styles.rowTitle}>
          {t(locale, overviewCopy.activityRow)}
        </h2>
        {activity.error || !activity.data ? (
          <PanelError locale={locale} />
        ) : (
          <div className={styles.panelCard}>
            {activity.data.events.length === 0 ? (
              <EmptyState
                compact
                icon={<ScrollText size={20} />}
                title={t(locale, overviewCopy.activityEmpty)}
              />
            ) : (
              <ul className={styles.activityList}>
                {activity.data.events.map((event) => {
                  const actor =
                    event.actorName ??
                    t(
                      locale,
                      event.actorIsSystem
                        ? overviewCopy.actorSystem
                        : overviewCopy.actorUnknown,
                    );
                  return (
                    <li key={event.id} className={styles.activityItem}>
                      <span className={styles.activityText} dir="auto">
                        {activitySentence(
                          locale,
                          event.action,
                          actor,
                          event.entityName,
                        )}
                      </span>
                      <time
                        className={styles.activityTime}
                        dateTime={event.createdAt}
                      >
                        {formatRelativeTime(event.createdAt, nowIso, locale)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
