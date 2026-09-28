"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ReceiptText } from "lucide-react";
import {
  DataTable,
  DateRangePicker,
  EmptyState,
  ErrorState,
  FormSection,
  ListSkeleton,
  dateRangeLabels,
  resolveDateRange,
  type DateRangeValue,
} from "./ui";
import { salesHistoryCopy as copy } from "./sales-copy";
import { formatDateTime, formatIls, type SaleOrder } from "./sales-types";
import styles from "./sales.module.css";

const PAGE_SIZE = 25;

function toFromIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

function toToIso(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

export function SalesHistoryView({
  locale,
  reloadKey,
}: {
  locale: "he" | "en";
  reloadKey: number;
}) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];

  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolvedKey, setResolvedKey] = useState("");

  const fetchKey = useMemo(
    () =>
      JSON.stringify([
        dateRange?.from ?? "",
        dateRange?.to ?? "",
        offset,
        reloadKey,
      ]),
    [dateRange, offset, reloadKey],
  );
  const loading = resolvedKey !== fetchKey;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (dateRange?.from) params.set("from", toFromIso(dateRange.from));
    if (dateRange?.to) params.set("to", toToIso(dateRange.to));
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));

    fetch(`/api/management/sales?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(
            typeof data?.error === "string" && data.error
              ? data.error
              : copy.errorTitle[locale],
          );
          setOrders([]);
          setTotalCount(0);
          setResolvedKey(fetchKey);
          return;
        }
        setError("");
        setOrders((data.orders ?? []) as SaleOrder[]);
        setTotalCount(
          typeof data.totalCount === "number" ? data.totalCount : 0,
        );
        setResolvedKey(fetchKey);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(copy.errorTitle[locale]);
          setResolvedKey(fetchKey);
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKey fully encodes every parameter used here
  }, [fetchKey, locale]);

  const setFilter = (setter: () => void) => {
    setter();
    setOffset(0);
  };

  const toggleExpanded = (orderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showSkeleton = loading && orders.length === 0 && !error;

  return (
    <FormSection
      title={t(copy.sectionTitle)}
      description={t(copy.sectionDescription)}
    >
      <div className={styles.historyFilters}>
        {dateRange ? (
          <>
            <DateRangePicker
              value={dateRange}
              onChange={(next) => setFilter(() => setDateRange(next))}
              labels={dateRangeLabels(locale)}
            />
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={() => setFilter(() => setDateRange(null))}
            >
              {t(copy.clearDates)}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            onClick={() =>
              setFilter(() =>
                setDateRange({ preset: "last7", ...resolveDateRange("last7") }),
              )
            }
          >
            <CalendarDays size={15} aria-hidden="true" />
            {dateRangeLabels(locale).groupLabel}
          </button>
        )}
      </div>

      {error ? (
        <ErrorState
          title={copy.errorTitle[locale]}
          description={error === copy.errorTitle[locale] ? undefined : error}
          onRetry={() => setFilter(() => setOffset(0))}
          retryLabel={t(copy.retry)}
        />
      ) : showSkeleton ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          <div aria-busy={loading}>
            <DataTable
              caption={t(copy.tableCaption)}
              minWidth="56rem"
              isEmpty={orders.length === 0}
              emptyState={
                <EmptyState
                  icon={<ReceiptText size={22} aria-hidden="true" />}
                  title={t(copy.emptyTitle)}
                  description={t(copy.emptyDescription)}
                />
              }
              head={
                <tr>
                  <th scope="col">{t(copy.colOrder)}</th>
                  <th scope="col">{t(copy.colDate)}</th>
                  <th scope="col">{t(copy.colCustomer)}</th>
                  <th scope="col">{t(copy.colRecordedBy)}</th>
                  <th scope="col">{t(copy.colItems)}</th>
                  <th scope="col">{t(copy.colVat)}</th>
                  <th scope="col">{t(copy.colTotal)}</th>
                  <th scope="col" aria-label={t(copy.colToggle)} />
                </tr>
              }
            >
              {orders.flatMap((order) => {
                const isOpen = expanded.has(order.id);
                const baseRow = (
                  <tr key={order.id}>
                    <td>
                      <span className={styles.mono} dir="ltr">
                        {order.order_number}
                      </span>
                    </td>
                    <td>
                      <time dateTime={order.created_at} dir="ltr">
                        {formatDateTime(order.created_at, locale)}
                      </time>
                    </td>
                    <td>
                      <span className={styles.customerCell}>
                        <span dir="auto">{order.customer_name}</span>
                        <span className={styles.customerEmail} dir="ltr">
                          {order.customer_email}
                        </span>
                      </span>
                    </td>
                    <td>
                      {order.recordedBy?.displayName ? (
                        <span dir="auto">{order.recordedBy.displayName}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {order.order_items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}
                    </td>
                    <td>
                      <span className={styles.mono} dir="ltr">
                        {formatIls(order.vat_total, locale)}
                      </span>
                    </td>
                    <td>
                      <span className={styles.mono} dir="ltr">
                        {formatIls(order.total, locale)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.expandButton}
                        aria-expanded={isOpen}
                        aria-label={
                          isOpen ? t(copy.collapseOrder) : t(copy.expandOrder)
                        }
                        onClick={() => toggleExpanded(order.id)}
                      >
                        <ChevronDown size={15} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
                if (!isOpen) return [baseRow];
                return [
                  baseRow,
                  <tr key={`${order.id}-items`}>
                    <td colSpan={8} className={styles.expandedCell}>
                      <table className={styles.itemsTable}>
                        <thead>
                          <tr>
                            <th scope="col">{t(copy.itemProduct)}</th>
                            <th scope="col">{t(copy.itemSku)}</th>
                            <th scope="col">{t(copy.itemQty)}</th>
                            <th scope="col">{t(copy.itemUnitPrice)}</th>
                            <th scope="col">{t(copy.itemDiscount)}</th>
                            <th scope="col">{t(copy.itemVat)}</th>
                            <th scope="col">{t(copy.itemNet)}</th>
                            <th scope="col">{t(copy.itemTotal)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.order_items.map((item) => (
                            <tr key={item.id}>
                              <td dir="auto">
                                {he
                                  ? item.product_name_he
                                  : item.product_name_en}
                              </td>
                              <td>
                                <span className={styles.mono} dir="ltr">
                                  {item.sku_snapshot}
                                </span>
                              </td>
                              <td>{item.quantity}</td>
                              <td dir="ltr" className={styles.mono}>
                                {formatIls(item.unit_price, locale)}
                              </td>
                              <td dir="ltr" className={styles.mono}>
                                {formatIls(item.discount_amount, locale)}
                              </td>
                              <td dir="ltr" className={styles.mono}>
                                {formatIls(item.vat_amount, locale)}
                              </td>
                              <td dir="ltr" className={styles.mono}>
                                {formatIls(item.net_amount, locale)}
                              </td>
                              <td dir="ltr" className={styles.mono}>
                                {formatIls(item.total_price, locale)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>,
                ];
              })}
            </DataTable>
          </div>

          {totalCount > 0 ? (
            <div className={styles.pagination}>
              <p className={styles.paginationInfo} aria-live="polite">
                {`${totalCount} ${t(copy.ordersCount)} · ${page} ${t(copy.pageOf)} ${pages}`}
              </p>
              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--ghost"
                  disabled={loading || offset === 0}
                  onClick={() =>
                    setOffset((prev) => Math.max(0, prev - PAGE_SIZE))
                  }
                >
                  {t(copy.prevPage)}
                </button>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--ghost"
                  disabled={loading || offset + PAGE_SIZE >= totalCount}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                >
                  {t(copy.nextPage)}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </FormSection>
  );
}
