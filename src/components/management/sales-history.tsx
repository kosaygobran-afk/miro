"use client";

import React, { useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Package,
  X,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

// Module-level constant for "now" - initialized once at module load to avoid impure Date.now() in render
const NOW = Date.now();

type OrderItemSnapshot = {
  id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sku_snapshot: string;
  product_name_he: string;
  product_name_en: string;
  unit_cost: number;
  vat_rate: number;
  vat_amount: number;
  discount_amount: number;
  net_amount: number;
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  user_id: string | null;
  source: string;
  subtotal: number;
  vat_total: number;
  total: number;
  net_total: number;
  shipping_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItemSnapshot[];
};

type DateRange = { from: string; to: string } | null;

export function SalesHistory({
  locale,
  orders,
  loading,
  error,
  onRetry,
  dateRange,
  onDateRangeChange,
  expandedOrders,
  onToggleExpand,
}: {
  locale: "he" | "en";
  orders: Order[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  expandedOrders: Set<string>;
  onToggleExpand: (orderId: string) => void;
}) {
  const he = locale === "en" ? false : true;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(amount);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(he ? "he-IL" : "en-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getStatusBadge = (status: string) => {
    const labels: Record<string, { he: string; en: string }> = {
      pending: { he: "ממתין", en: "Pending" },
      confirmed: { he: "מאושר", en: "Confirmed" },
      processing: { he: "בטיפול", en: "Processing" },
      shipped: { he: "נשלח", en: "Shipped" },
      delivered: { he: "נמסר", en: "Delivered" },
      cancelled: { he: "בוטל", en: "Cancelled" },
      refunded: { he: "הוחזר", en: "Refunded" },
    };
    const label = labels[status] ?? { he: status, en: status };
    const variant =
      status === "cancelled" || status === "refunded"
        ? "status-badge--blocked"
        : status === "delivered"
          ? "status-badge--active"
          : "status-badge--suspended";
    return (
      <span className={`status-badge ${variant}`}>
        {he ? label.he : label.en}
      </span>
    );
  };

  const presetRanges = useMemo(
    () => [
      { label: { he: "7 ימים", en: "7 days" }, days: 7 },
      { label: { he: "30 ימים", en: "30 days" }, days: 30 },
      { label: { he: "90 ימים", en: "90 days" }, days: 90 },
      { label: { he: "הכל", en: "All" }, days: null },
    ],
    [],
  );

  const handlePresetClick = (days: number | null) => {
    if (days === null) {
      onDateRangeChange(null);
      return;
    }
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    onDateRangeChange({
      from: from.toISOString(),
      to: to.toISOString(),
    });
  };

  // Compute active preset using module-level NOW constant to avoid impure Date.now() in render
  const activePreset = useMemo(() => {
    for (const preset of presetRanges) {
      if (preset.days === null && !dateRange) return preset.days;
      if (preset.days !== null && dateRange) {
        const rangeStart = new Date(dateRange.from).getTime();
        const expectedStart = NOW - preset.days * 24 * 60 * 60 * 1000;
        if (Math.abs(rangeStart - expectedStart) < 86400000) {
          return preset.days;
        }
      }
    }
    return null;
  }, [dateRange, presetRanges]);

  const handleCustomDateChange = (type: "from" | "to", value: string) => {
    const newRange = dateRange ? { ...dateRange } : { from: "", to: "" };
    newRange[type] = value;
    if (newRange.from && newRange.to) {
      onDateRangeChange(newRange);
    }
  };

  const clearDateRange = () => {
    onDateRangeChange(null);
  };

  if (loading) {
    return (
      <div
        className="miro-card sales-history__loading"
        role="status"
        aria-live="polite"
      >
        <div className="sales-history__spinner" aria-hidden="true" />
        <p>{he ? "טוען היסטוריית מכירות…" : "Loading sales history…"}</p>
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="miro-card sales-history__error" role="alert">
        <div className="p-6">
          <AlertCircle
            className="h-10 w-10 text-error-text mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-lg font-medium mb-2 text-center">
            {he
              ? "שגיאה בטעינת היסטוריית מכירות"
              : "Failed to load sales history"}
          </p>
          <p className="text-muted-foreground text-center mb-4">{error}</p>
          <div className="flex justify-center">
            <button
              type="button"
              className="miro-button miro-button-secondary gap-2"
              onClick={onRetry}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {he ? "נסה שוב" : "Retry"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-history">
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black">
                {he ? "היסטוריית מכירות" : "Sales History"}
              </h3>
              <p className="mt-1 text-muted-foreground text-sm">
                {he
                  ? `מוצגות ${orders.length} הזמנות`
                  : `Showing ${orders.length} orders`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range Presets */}
              <div
                className="flex gap-1.5"
                role="group"
                aria-label={he ? "טווח תאריכים" : "Date range"}
              >
                {presetRanges.map((preset) => {
                  const isActive = activePreset === preset.days;
                  return (
                    <button
                      key={preset.days ?? "all"}
                      type="button"
                      onClick={() => handlePresetClick(preset.days)}
                      className={`sales-history__preset-btn px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-hover text-foreground hover:bg-surface-muted"
                      }`}
                      aria-pressed={!!isActive}
                    >
                      {he ? preset.label.he : preset.label.en}
                    </button>
                  );
                })}
              </div>

              {/* Custom Date Inputs */}
              {dateRange && (
                <div className="flex items-center gap-2 sales-history__custom-range">
                  <label htmlFor="custom-from" className="sr-only">
                    {he ? "מתאריך" : "From"}
                  </label>
                  <input
                    id="custom-from"
                    type="date"
                    value={dateRange.from?.split("T")[0] ?? ""}
                    onChange={(e) =>
                      handleCustomDateChange("from", e.target.value)
                    }
                    className="miro-input w-auto"
                  />
                  <span className="text-muted-foreground">
                    {he ? "עד" : "to"}
                  </span>
                  <label htmlFor="custom-to" className="sr-only">
                    {he ? "עד תאריך" : "To"}
                  </label>
                  <input
                    id="custom-to"
                    type="date"
                    value={dateRange.to?.split("T")[0] ?? ""}
                    onChange={(e) =>
                      handleCustomDateChange("to", e.target.value)
                    }
                    className="miro-input w-auto"
                  />
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
            </div>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="sales-history__empty p-8 text-center" role="status">
            <Package
              className="h-12 w-12 text-muted-foreground mx-auto mb-3"
              aria-hidden="true"
            />
            <p className="text-lg font-medium mb-1">
              {he ? "אין מכירות בתקופה שנבחרה" : "No sales in selected period"}
            </p>
            <p className="text-muted-foreground">
              {he
                ? "נסה לשנות את טווח התאריכים"
                : "Try changing the date range"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="sales-history__table-wrapper">
              <table className="sales-history__table" role="grid">
                <caption className="sr-only">
                  {he ? "טבלת היסטוריית מכירות" : "Sales history table"}
                </caption>
                <thead className="sales-history__thead">
                  <tr>
                    <th className="sales-history__th" scope="col">
                      {he ? "מס׳ הזמנה" : "Order #"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "לקוח" : "Customer"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "תאריך" : "Date"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "ברוטו" : "Gross"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "נטו" : "Net"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "מע״מ" : "VAT"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "סטטוס" : "Status"}
                    </th>
                    <th className="sales-history__th" scope="col">
                      {he ? "פריטים" : "Items"}
                    </th>
                  </tr>
                </thead>
                <tbody className="sales-history__tbody">
                  {orders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`sales-history__row ${
                          expandedOrders.has(order.id)
                            ? "sales-history__row--expanded"
                            : ""
                        }`}
                        onClick={() => onToggleExpand(order.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="sales-history__td">
                          <code className="font-mono text-sm">
                            {order.order_number}
                          </code>
                        </td>
                        <td className="sales-history__td">
                          <div className="sales-history__customer">
                            <p className="font-medium">{order.customer_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.customer_email}
                            </p>
                          </div>
                        </td>
                        <td className="sales-history__td">
                          <time dateTime={order.created_at}>
                            {formatDate(order.created_at)}
                          </time>
                        </td>
                        <td className="sales-history__td font-mono tabular-nums">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="sales-history__td font-mono tabular-nums">
                          {formatCurrency(order.net_total)}
                        </td>
                        <td className="sales-history__td font-mono tabular-nums text-muted-foreground">
                          {formatCurrency(order.vat_total)}
                        </td>
                        <td className="sales-history__td">
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="sales-history__td">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleExpand(order.id);
                            }}
                            className="sales-history__expand-btn"
                            aria-expanded={expandedOrders.has(order.id)}
                            aria-label={
                              expandedOrders.has(order.id)
                                ? he
                                  ? "סגור פריטים"
                                  : "Collapse items"
                                : he
                                  ? "פתח פריטים"
                                  : "Expand items"
                            }
                          >
                            {expandedOrders.has(order.id) ? (
                              <ChevronUp
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronDown
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row - Line Items */}
                      {expandedOrders.has(order.id) && (
                        <tr className="sales-history__expanded-row">
                          <td
                            colSpan={8}
                            className="sales-history__expanded-cell"
                          >
                            <div className="sales-history__line-items">
                              <table
                                className="sales-history__line-items-table"
                                role="table"
                              >
                                <caption className="sr-only">
                                  {he
                                    ? "טבלת פריטי הזמנה"
                                    : "Order line items table"}
                                </caption>
                                <thead>
                                  <tr>
                                    <th scope="col">{he ? "SKU" : "SKU"}</th>
                                    <th scope="col">
                                      {he ? "מוצר" : "Product"}
                                    </th>
                                    <th scope="col">{he ? "כמות" : "Qty"}</th>
                                    <th scope="col">
                                      {he ? "מחיר יחידה" : "Unit price"}
                                    </th>
                                    <th scope="col">
                                      {he ? "הנחה" : "Discount"}
                                    </th>
                                    <th scope="col">{he ? "נטו" : "Net"}</th>
                                    <th scope="col">{he ? "מע״מ" : "VAT"}</th>
                                    <th scope="col">{he ? "עלות" : "Cost"}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.order_items.map((item) => (
                                    <tr key={item.id}>
                                      <td>
                                        <code className="font-mono text-sm">
                                          {item.sku_snapshot}
                                        </code>
                                      </td>
                                      <td>
                                        <p className="font-medium">
                                          {he
                                            ? item.product_name_he
                                            : item.product_name_en}
                                        </p>
                                      </td>
                                      <td className="text-center font-mono tabular-nums">
                                        {item.quantity}
                                      </td>
                                      <td className="font-mono tabular-nums">
                                        {formatCurrency(item.unit_price)}
                                      </td>
                                      <td className="font-mono tabular-nums text-error-text">
                                        {formatCurrency(item.discount_amount)}
                                      </td>
                                      <td className="font-mono tabular-nums font-medium">
                                        {formatCurrency(item.net_amount)}
                                      </td>
                                      <td className="font-mono tabular-nums text-muted-foreground">
                                        {formatCurrency(item.vat_amount)}
                                      </td>
                                      <td className="font-mono tabular-nums text-muted-foreground">
                                        {formatCurrency(
                                          item.unit_cost * item.quantity,
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="sales-history__card-list" role="list">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="sales-history__card"
                  role="listitem"
                >
                  <div className="sales-history__card-header">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="sales-history__card-order-number">
                          <code className="font-mono">
                            #{order.order_number}
                          </code>
                        </p>
                        <p className="sales-history__card-customer">
                          {order.customer_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(order.status)}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(order.id);
                          }}
                          className="sales-history__expand-btn"
                          aria-expanded={expandedOrders.has(order.id)}
                          aria-label={
                            expandedOrders.has(order.id)
                              ? he
                                ? "סגור פריטים"
                                : "Collapse items"
                              : he
                                ? "פתח פריטים"
                                : "Expand items"
                          }
                        >
                          {expandedOrders.has(order.id) ? (
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ChevronDown
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="sales-history__card-meta">
                      <time
                        dateTime={order.created_at}
                        className="text-sm text-muted-foreground"
                      >
                        {formatDate(order.created_at)}
                      </time>
                      <span className="text-sm font-mono tabular-nums text-primary">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  </div>

                  {expandedOrders.has(order.id) && (
                    <div className="sales-history__card-expanded">
                      <div className="sales-history__line-items">
                        <table
                          className="sales-history__line-items-table"
                          role="table"
                        >
                          <caption className="sr-only">
                            {he ? "טבלת פריטי הזמנה" : "Order line items table"}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">{he ? "SKU" : "SKU"}</th>
                              <th scope="col">{he ? "מוצר" : "Product"}</th>
                              <th scope="col">{he ? "כמות" : "Qty"}</th>
                              <th scope="col">
                                {he ? "מחיר יחידה" : "Unit price"}
                              </th>
                              <th scope="col">{he ? "הנחה" : "Discount"}</th>
                              <th scope="col">{he ? "נטו" : "Net"}</th>
                              <th scope="col">{he ? "מע״מ" : "VAT"}</th>
                              <th scope="col">{he ? "עלות" : "Cost"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.order_items.map((item) => (
                              <tr key={item.id}>
                                <td>
                                  <code className="font-mono text-sm">
                                    {item.sku_snapshot}
                                  </code>
                                </td>
                                <td>
                                  <p className="font-medium">
                                    {he
                                      ? item.product_name_he
                                      : item.product_name_en}
                                  </p>
                                </td>
                                <td className="text-center font-mono tabular-nums">
                                  {item.quantity}
                                </td>
                                <td className="font-mono tabular-nums">
                                  {formatCurrency(item.unit_price)}
                                </td>
                                <td className="font-mono tabular-nums text-error-text">
                                  {formatCurrency(item.discount_amount)}
                                </td>
                                <td className="font-mono tabular-nums font-medium">
                                  {formatCurrency(item.net_amount)}
                                </td>
                                <td className="font-mono tabular-nums text-muted-foreground">
                                  {formatCurrency(item.vat_amount)}
                                </td>
                                <td className="font-mono tabular-nums text-muted-foreground">
                                  {formatCurrency(
                                    item.unit_cost * item.quantity,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
