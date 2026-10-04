"use client";

import { useState } from "react";
import { formatCount, formatCurrency, t, accountsCopy } from "./accounts-copy";
import { DashboardSkeleton } from "@/components/management/ui/skeleton";
import { DataTable } from "@/components/management/ui/data-table";
import { EmptyState } from "@/components/management/ui/empty-state";
import { ErrorState } from "@/components/management/ui/error-state";
import { MetricCard } from "@/components/management/ui/metric-card";
import { OverflowText } from "@/components/management/ui/overflow-text";
import {
  DateRangePicker,
  dateRangeLabels,
  resolveDateRange,
  type DateRangeValue,
} from "@/components/management/ui/date-range-picker";
import { Drawer } from "@/components/management/ui/drawer";
import { useManagementReport } from "@/components/management/ui/use-management-report";
import {
  ReportingHeader,
  reportingStyles as report,
} from "@/components/management/ui/reporting-workspace";
import {
  ArrowUpRight,
  Banknote,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";

type PaymentMethod =
  "cash" | "credit_card" | "bank_transfer" | "bit" | "check" | "other";

type AccountsResponse = {
  range: { from: string; to: string; generatedAt: string };
  orders: {
    order_id: string;
    order_number: string;
    created_at: string;
    status: string;
    source: string;
    customer_name: string | null;
    customer_email: string | null;
    recorded_by_name: string | null;
    items_count: number;
    units_count: number;
    subtotal_net: number;
    discount: number;
    net_total: number;
    vat_total: number;
    total: number;
    payments: {
      payment_method: PaymentMethod;
      amount: number;
      installments: number | null;
      payment_status: string;
      external_reference: string | null;
      paid_at: string | null;
    }[];
  }[];
  summary: {
    transaction_count: number;
    revenue: number;
    units_sold: number;
    avg_ticket: number;
    by_method: Record<PaymentMethod, number>;
  };
  total_count: number;
};

type PaymentMethodOption = {
  value: PaymentMethod | "";
  label: string;
};

function getPaymentMethodOptions(locale: Locale): PaymentMethodOption[] {
  const methods: PaymentMethod[] = [
    "cash",
    "credit_card",
    "bank_transfer",
    "bit",
    "check",
    "other",
  ];
  const labels: Record<PaymentMethod, { he: string; en: string }> = {
    cash: { he: "מזומן", en: "Cash" },
    credit_card: { he: "כרטיס אשראי", en: "Credit Card" },
    bank_transfer: { he: "העברה בנקאית", en: "Bank Transfer" },
    bit: { he: "ביט", en: "Bit" },
    check: { he: "צ'ק", en: "Check" },
    other: { he: "אחר", en: "Other" },
  };
  return [
    { value: "", label: t(locale, { he: "כל השיטות", en: "All methods" }) },
    ...methods.map((method) => ({
      value: method,
      label: t(locale, labels[method]),
    })),
  ];
}

type PaymentStatusOption = {
  value: string;
  label: string;
};

function getPaymentStatusOptions(locale: Locale): PaymentStatusOption[] {
  // We don't have a centralized list of payment statuses, but we can infer from common ones
  // or we can leave it as a text input. However, the API expects a status parameter.
  // Let's assume common statuses: pending, paid, failed, refunded, etc.
  // Since we don't have a definitive list, we'll make it a text input for flexibility.
  // But the task says "payment status select", so we need to provide options.
  // We'll check if there's a pattern in other dashboards. Since we don't see one, we'll create a select with common options.
  const statuses: string[] = ["pending", "paid", "failed", "refunded"];
  const labels: Record<
    PaymentStatusOption["value"],
    { he: string; en: string }
  > = {
    pending: { he: "ממתין", en: "Pending" },
    paid: { he: "משולם", en: "Paid" },
    failed: { he: "נכשל", en: "Failed" },
    refunded: { he: "החזר", en: "Refunded" },
  };
  return [
    { value: "", label: t(locale, { he: "כל הסטטוסים", en: "All statuses" }) },
    ...statuses.map((status) => ({
      value: status,
      label: t(locale, labels[status]),
    })),
  ];
}

export function AccountsDashboard({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const [range, setRange] = useState<DateRangeValue>(() => ({
    preset: "last7",
    ...resolveDateRange("last7"),
  }));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paymentStatus, setPaymentStatus] = useState<string>(""); // empty for all
  const [cashierSearch, setCashierSearch] = useState("");
  const [generalSearch, setGeneralSearch] = useState("");
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [totalCount] = useState(0);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    order_number: string;
    created_at: string;
    status: string;
    source: string;
    customer_name: string | null;
    customer_email: string | null;
    recorded_by_name: string | null;
    order_items: Array<{
      sku_snapshot: string;
      product_name_he: string;
      product_name_en: string;
      quantity: number;
      unit_price: number;
      discount_amount: number;
      vat_amount: number;
      total_price: number;
    }>;
    order_payments: Array<{
      payment_method: string;
      amount: number;
      installments: number | null;
      payment_status: string;
      external_reference: string | null;
      paid_at: string | null;
    }>;
    stock_movements: Array<{
      reference: string;
      id: string;
    }>;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchDetail = async (orderId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/management/accounts/${orderId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      } else {
        setDetailData(null);
      }
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = (orderId: string) => {
    setDetailOrderId(orderId);
    fetchDetail(orderId);
  };

  const closeDetail = () => {
    setDetailOrderId(null);
    setDetailData(null);
  };

  const { data, error, loading, reload } =
    useManagementReport<AccountsResponse>(
      `/api/management/accounts?${new URLSearchParams({
        from: range.from,
        to: range.to,
        method: paymentMethod,
        status: paymentStatus,
        cashier: cashierSearch,
        search: generalSearch,
        limit: limit.toString(),
        offset: offset.toString(),
      }).toString()}`,
      he ? "לא ניתן לטעון נתוני חשבונות" : "Unable to load accounts data",
    );

  const totals = data?.summary ?? null;
  const orders = data?.orders ?? [];

  // Prepare data for the table
  const tableData = orders.map((order) => ({
    ...order,
    // Format dates for display
    formattedDate: new Date(order.created_at).toLocaleString(
      he ? "he-IL" : "en-IL",
      {
        timeZone: "Asia/Jerusalem",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    ),
    // Payment summary text
    paymentSummaryText: order.payments
      .map((p) => {
        const methodLabel = t(locale, {
          he:
            p.payment_method === "cash"
              ? "מזומן"
              : p.payment_method === "credit_card"
                ? "כרטיס אשראי"
                : p.payment_method === "bank_transfer"
                  ? "העברה בנקאית"
                  : p.payment_method === "bit"
                    ? "ביט"
                    : p.payment_method === "check"
                      ? "צ\'ק"
                      : "אחר",
          en:
            p.payment_method === "cash"
              ? "Cash"
              : p.payment_method === "credit_card"
                ? "Credit Card"
                : p.payment_method === "bank_transfer"
                  ? "Bank Transfer"
                  : p.payment_method === "bit"
                    ? "Bit"
                    : p.payment_method === "check"
                      ? "Check"
                      : "Other",
        });
        const amount = formatCurrency(p.amount, locale);
        const installments = p.installments ? `${p.installments}x` : "";
        return `${methodLabel} ${amount} ${installments}`.trim();
      })
      .join(", "),
  }));

  // Prepare summary metric cards
  const metricCards = [
    {
      label: t(locale, accountsCopy.posRevenue),
      value: totals ? formatCurrency(totals.revenue, locale) : "—",
      icon: <Banknote size={20} />,
      key: "revenue",
    },
    {
      label: t(locale, accountsCopy.posTransactions),
      value: totals ? formatCount(totals.transaction_count, locale) : "—",
      icon: <ShoppingBag size={20} />,
      key: "transactions",
    },
    {
      label: t(locale, accountsCopy.posUnitsSold),
      value: totals ? formatCount(totals.units_sold, locale) : "—",
      icon: <Package size={20} />,
      key: "unitsSold",
    },
    {
      label: t(locale, accountsCopy.posAvgTicket),
      value: totals ? formatCurrency(totals.avg_ticket, locale) : "—",
      icon: <TrendingUp size={20} />,
      key: "avgTicket",
    },
  ];

  // Prepare payment method breakdown for the summary section
  const paymentMethodBreakdown = totals?.by_method
    ? Object.entries(totals.by_method).map(([method, amount]) => ({
        method: method as PaymentMethod,
        amount,
        label: t(locale, {
          he:
            method === "cash"
              ? "מזומן"
              : method === "credit_card"
                ? "כרטיס אשראי"
                : method === "bank_transfer"
                  ? "העברה בנקאית"
                  : method === "bit"
                    ? "ביט"
                    : method === "check"
                      ? "צ\'ק"
                      : "אחר",
          en:
            method === "cash"
              ? "Cash"
              : method === "credit_card"
                ? "Credit Card"
                : method === "bank_transfer"
                  ? "Bank Transfer"
                  : method === "bit"
                    ? "Bit"
                    : method === "check"
                      ? "Check"
                      : "Other",
        }),
      }))
    : [];

  return (
    <section
      className={`${report.workspace} insight-report-workspace`}
      aria-busy={loading}
    >
      <ReportingHeader
        locale={locale}
        section="accounts"
        title={t(locale, accountsCopy.title)}
        subtitle={t(locale, accountsCopy.subtitle)}
        actions={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--secondary"
              onClick={() => {
                // Reset filters
                setPaymentMethod("");
                setPaymentStatus("");
                setCashierSearch("");
                setGeneralSearch("");
                setOffset(0);
              }}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {he ? "איפוס" : "Reset"}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              disabled={loading}
              onClick={reload}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {he ? "רענון" : "Refresh"}
            </button>
          </>
        }
      />
      <div className={report.toolbar}>
        <div className="flex flex-wrap items-center gap-4">
          <DateRangePicker
            value={range}
            onChange={setRange}
            labels={dateRangeLabels(locale)}
          />
          <div className="relative">
            <label className="block text-xs font-medium mb-1">
              {t(locale, accountsCopy.paymentMethodFilter)}
            </label>
            <select
              className="mgmt-select"
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value as PaymentMethod | "");
                setOffset(0); // Reset page when filter changes
              }}
            >
              {getPaymentMethodOptions(locale).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <label className="block text-xs font-medium mb-1">
              {t(locale, accountsCopy.paymentStatusFilter)}
            </label>
            <select
              className="mgmt-select"
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setOffset(0);
              }}
            >
              {getPaymentStatusOptions(locale).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <label className="block text-xs font-medium mb-1">
              {t(locale, accountsCopy.cashierSearch)}
            </label>
            <input
              type="text"
              className="miro-input"
              value={cashierSearch}
              onChange={(e) => {
                setCashierSearch(e.target.value);
                setOffset(0);
              }}
              placeholder={t(locale, accountsCopy.cashierSearch)}
            />
          </div>
          <div className="relative">
            <label className="block text-xs font-medium mb-1">
              {t(locale, accountsCopy.generalSearch)}
            </label>
            <input
              type="text"
              className="miro-input"
              value={generalSearch}
              onChange={(e) => {
                setGeneralSearch(e.target.value);
                setOffset(0);
              }}
              placeholder={t(locale, accountsCopy.generalSearch)}
            />
          </div>
        </div>
      </div>
      <p className={report.muted} role="status">
        {loading
          ? he
            ? "מעדכן נתונים…"
            : "Updating figures…"
          : data
            ? `${new Date(data.range.from).toLocaleDateString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem" })} – ${new Date(data.range.to).toLocaleDateString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem" })} · ${he ? "עודכן" : "Updated"} ${new Date(data.range.generatedAt).toLocaleTimeString(he ? "he-IL" : "en-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}`
            : ""}
      </p>

      {error && !data ? (
        <ErrorState
          title={t(locale, {
            he: "לא ניתן לטעון את הדוח",
            en: "Unable to load report",
          })}
          description={error}
          onRetry={reload}
          retryLabel={t(locale, { he: "נסה שוב", en: "Retry" })}
        />
      ) : null}

      {loading && !data ? (
        <DashboardSkeleton
          label={he ? "טוען נתוני חשבונות…" : "Loading accounts data…"}
        />
      ) : data ? (
        <>
          <div className={report.metrics}>
            {metricCards.map((card) => (
              <MetricCard
                key={card.key}
                label={<OverflowText text={card.label} />}
                value={card.value}
                icon={card.icon}
              />
            ))}
          </div>

          {paymentMethodBreakdown.length > 0 ? (
            <div className={report.panel}>
              <div className={report.panelHeader}>
                <h2>
                  {t(locale, {
                    he: "פירוט לפי שיטת תשלום",
                    en: "Payment method breakdown",
                  })}
                </h2>
              </div>
              <dl className={report.ledger}>
                {paymentMethodBreakdown.map((item) => (
                  <div key={item.method}>
                    <dt>
                      <OverflowText text={item.label} />
                    </dt>
                    <dd dir="ltr">{formatCurrency(item.amount, locale)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className={report.panel}>
            <div className={report.panelHeader}>
              <h2>{t(locale, { he: "עסקאות", en: "Transactions" })}</h2>
            </div>
            {tableData.length > 0 ? (
              <DataTable
                columnWidths={[
                  "18%",
                  "15%",
                  "12%",
                  "10%",
                  "10%",
                  "12%",
                  "15%",
                  "8%",
                ]}
                minWidth="70rem"
                tableClassName="mgmt-accounts-table"
                stickyHeader={false}
                caption={t(locale, {
                  he: "פירוט עסקאות קופה",
                  en: "POS transactions breakdown",
                })}
                isEmpty={false}
                emptyState={
                  <EmptyState
                    title={t(locale, accountsCopy.emptyTitle)}
                    description={t(locale, accountsCopy.emptyDescription)}
                  />
                }
                head={
                  <tr>
                    <th scope="col">{t(locale, accountsCopy.dateTime)}</th>
                    <th scope="col">{t(locale, accountsCopy.receiptNumber)}</th>
                    <th scope="col">{t(locale, accountsCopy.customer)}</th>
                    <th scope="col">{t(locale, accountsCopy.cashier)}</th>
                    <th scope="col" className={report.numeric}>
                      {t(locale, accountsCopy.itemCount)}
                    </th>
                    <th scope="col" className={report.numeric}>
                      {t(locale, accountsCopy.total)}
                    </th>
                    <th scope="col">
                      {t(locale, accountsCopy.paymentSummary)}
                    </th>
                    <th scope="col">{t(locale, accountsCopy.details)}</th>
                  </tr>
                }
              >
                {tableData.map((order) => (
                  <tr key={order.order_id}>
                    <td>
                      <time dateTime={order.created_at}>
                        {order.formattedDate}
                      </time>
                    </td>
                    <td dir="ltr">
                      <OverflowText text={order.order_number} />
                    </td>
                    <td dir="auto">
                      <OverflowText
                        text={
                          order.customer_name ??
                          t(locale, { he: "אורח", en: "Guest" })
                        }
                      />
                    </td>
                    <td dir="auto">
                      <OverflowText
                        text={
                          order.recorded_by_name ??
                          t(locale, { he: "לא זמין", en: "N/A" })
                        }
                      />
                    </td>
                    <td className={report.numeric}>
                      {formatCount(order.items_count, locale)}
                    </td>
                    <td className={report.numeric} dir="ltr">
                      {formatCurrency(order.total, locale)}
                    </td>
                    <td>
                      <OverflowText text={order.paymentSummaryText} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--secondary"
                        onClick={() => openDetail(order.order_id)}
                      >
                        <ArrowUpRight size={17} aria-hidden="true" />
                        {he ? "פרטים" : "Details"}
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Add empty state if no data */}
                {tableData.length === 0 && (
                  <tr>
                    <td colSpan={8} className={report.note}>
                      {t(locale, accountsCopy.emptyTitle)}
                    </td>
                  </tr>
                )}
              </DataTable>
            ) : (
              <EmptyState
                title={t(locale, accountsCopy.emptyTitle)}
                description={t(locale, accountsCopy.emptyDescription)}
              />
            )}
          </div>

          {/* Pagination controls */}
          <div className={report.toolbar} style={{ justifyContent: "center" }}>
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => {
                setOffset(Math.max(0, offset - limit));
              }}
              className="mgmt-button mgmt-button--secondary"
            >
              {he ? "הקודם" : "Previous"}
            </button>
            <span className={report.muted} style={{ margin: "0 1rem" }}>
              {he
                ? `הצגת ${offset + 1}-${Math.min(offset + limit, totalCount)} מתוך ${totalCount}`
                : `Showing ${offset + 1}-${Math.min(offset + limit, totalCount)} of ${totalCount}`}
            </span>
            <button
              type="button"
              disabled={offset + limit >= totalCount || loading}
              onClick={() => {
                setOffset(offset + limit);
              }}
              className="mgmt-button mgmt-button--secondary"
            >
              {he ? "הבא" : "Next"}
            </button>
          </div>
        </>
      ) : null}

      {/* Details Drawer */}
      <Drawer
        open={detailOrderId !== null}
        onClose={closeDetail}
        title={t(locale, accountsCopy.receipt)}
        side="end"
        className={report.drawer}
        closeLabel={he ? "סגירה" : "Close"}
      >
        <div className={report.details}>
          {detailLoading ? (
            <p className={report.muted}>
              {he ? "טוען פרטים…" : "Loading details…"}
            </p>
          ) : detailData ? (
            <>
              {/* Receipt Section */}
              <div className={report.panel}>
                <div className={report.panelHeader}>
                  <h2>{t(locale, accountsCopy.receipt)}</h2>
                </div>
                <dl className={report.ledger}>
                  <div>
                    <dt>{t(locale, accountsCopy.receiptNumberLabel)}</dt>
                    <dd dir="ltr">
                      <OverflowText text={detailData.order_number ?? "—"} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, accountsCopy.dateLabel)}</dt>
                    <dd>
                      {new Date(detailData.created_at).toLocaleString(
                        he ? "he-IL" : "en-IL",
                        { timeZone: "Asia/Jerusalem" },
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, accountsCopy.cashierLabel)}</dt>
                    <dd dir="auto">
                      <OverflowText
                        text={
                          detailData.recorded_by_name ??
                          t(locale, { he: "לא זמין", en: "N/A" })
                        }
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, accountsCopy.customerNameLabel)}</dt>
                    <dd dir="auto">
                      <OverflowText
                        text={
                          detailData.customer_name ??
                          t(locale, { he: "אורח", en: "Guest" })
                        }
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>{t(locale, accountsCopy.customerEmailLabel)}</dt>
                    <dd dir="ltr">{detailData.customer_email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, { he: "סטטוס", en: "Status" })}</dt>
                    <dd>{detailData.status}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, { he: "מקור", en: "Source" })}</dt>
                    <dd>
                      <span
                        data-sales-channel={
                          detailData.source === "pos" ? "pos" : "website"
                        }
                        className="mgmt-sales-channel-badge"
                      >
                        {detailData.source === "pos"
                          ? t(locale, { he: "קופה", en: "POS" })
                          : detailData.source === "website"
                            ? t(locale, { he: "אתר", en: "Website" })
                            : t(locale, { he: "מדור קודם", en: "Legacy" })}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Items Section */}
              {detailData.order_items && detailData.order_items.length > 0 ? (
                <div className={report.panel}>
                  <div className={report.panelHeader}>
                    <h2>{t(locale, accountsCopy.items)}</h2>
                  </div>
                  <div className="overflow-auto">
                    <table className="mgmt-detail-table">
                      <thead>
                        <tr>
                          <th scope="col">
                            {t(locale, accountsCopy.skuLabel)}
                          </th>
                          <th scope="col">
                            {t(locale, accountsCopy.nameLabel)}
                          </th>
                          <th scope="col" className={report.numeric}>
                            {t(locale, accountsCopy.qtyLabel)}
                          </th>
                          <th scope="col" className={report.numeric}>
                            {t(locale, accountsCopy.unitPriceLabel)}
                          </th>
                          <th scope="col" className={report.numeric}>
                            {t(locale, accountsCopy.discountLabel)}
                          </th>
                          <th scope="col" className={report.numeric}>
                            {t(locale, accountsCopy.vatLabel)}
                          </th>
                          <th scope="col" className={report.numeric}>
                            {t(locale, accountsCopy.lineTotalLabel)}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.order_items.map((item, idx) => (
                          <tr key={idx}>
                            <td dir="ltr">
                              <OverflowText text={item.sku_snapshot ?? "—"} />
                            </td>
                            <td dir="auto">
                              <OverflowText
                                text={
                                  he
                                    ? item.product_name_he
                                    : item.product_name_en
                                }
                              />
                            </td>
                            <td className={report.numeric}>
                              {formatCount(item.quantity, locale)}
                            </td>
                            <td className={report.numeric} dir="ltr">
                              {formatCurrency(item.unit_price, locale)}
                            </td>
                            <td className={report.numeric} dir="ltr">
                              {formatCurrency(
                                item.discount_amount ?? 0,
                                locale,
                              )}
                            </td>
                            <td className={report.numeric} dir="ltr">
                              {formatCurrency(item.vat_amount ?? 0, locale)}
                            </td>
                            <td className={report.numeric} dir="ltr">
                              {formatCurrency(item.total_price, locale)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Payments Section */}
              {detailData.order_payments &&
              detailData.order_payments.length > 0 ? (
                <div className={report.panel}>
                  <div className={report.panelHeader}>
                    <h2>{t(locale, accountsCopy.payments)}</h2>
                  </div>
                  <dl className={report.ledger}>
                    {detailData.order_payments.map((payment, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: "1rem",
                          paddingBottom: "1rem",
                          borderBottom:
                            idx < detailData.order_payments.length - 1
                              ? "1px solid var(--border-subtle)"
                              : "none",
                        }}
                      >
                        <div>
                          <dt>{t(locale, accountsCopy.methodLabel)}</dt>
                          <dd>
                            <span
                              data-sales-channel={payment.payment_method}
                              className="mgmt-sales-channel-badge"
                              style={{
                                background: "var(--sales-channel-pos)",
                              }}
                            >
                              {payment.payment_method === "cash"
                                ? t(locale, { he: "מזומן", en: "Cash" })
                                : payment.payment_method === "credit_card"
                                  ? t(locale, {
                                      he: "כרטיס אשראי",
                                      en: "Credit Card",
                                    })
                                  : payment.payment_method === "bank_transfer"
                                    ? t(locale, {
                                        he: "העברה בנקאית",
                                        en: "Bank Transfer",
                                      })
                                    : payment.payment_method === "bit"
                                      ? t(locale, { he: "ביט", en: "Bit" })
                                      : payment.payment_method === "check"
                                        ? t(locale, {
                                            he: "צ'ק",
                                            en: "Check",
                                          })
                                        : t(locale, {
                                            he: "אחר",
                                            en: "Other",
                                          })}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>{t(locale, accountsCopy.amountLabel)}</dt>
                          <dd dir="ltr">
                            {formatCurrency(payment.amount, locale)}
                          </dd>
                        </div>
                        <div>
                          <dt>{t(locale, accountsCopy.installmentsLabel)}</dt>
                          <dd>
                            {payment.installments
                              ? `${payment.installments}x`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>{t(locale, accountsCopy.statusLabel)}</dt>
                          <dd>{payment.payment_status}</dd>
                        </div>
                        <div>
                          <dt>{t(locale, accountsCopy.referenceLabel)}</dt>
                          <dd dir="ltr">{payment.external_reference ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>{t(locale, accountsCopy.paidAtLabel)}</dt>
                          <dd>
                            {payment.paid_at
                              ? new Date(payment.paid_at).toLocaleString(
                                  he ? "he-IL" : "en-IL",
                                  { timeZone: "Asia/Jerusalem" },
                                )
                              : "—"}
                          </dd>
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {/* Inventory Section */}
              {detailData.stock_movements &&
              detailData.stock_movements.length > 0 ? (
                <div className={report.panel}>
                  <div className={report.panelHeader}>
                    <h2>{t(locale, accountsCopy.inventory)}</h2>
                  </div>
                  <dl className={report.ledger}>
                    {detailData.stock_movements.map((movement, idx) => (
                      <div key={idx}>
                        <dt>{t(locale, accountsCopy.movementRefLabel)}</dt>
                        <dd dir="ltr">{movement.reference ?? movement.id}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </>
          ) : (
            <p className={report.muted}>
              {he ? "לא נמצאו פרטי הזמנה" : "Order details not found"}
            </p>
          )}
        </div>
      </Drawer>
    </section>
  );
}
