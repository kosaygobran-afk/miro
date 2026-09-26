"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Search,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  User,
  Package,
} from "lucide-react";
import { SalesHistory } from "./sales-history";

type InventoryVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  price_override: number | null;
  cost_override: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: boolean;
  products: {
    id: string;
    name_he: string;
    name_en: string;
    slug: string;
    status: string;
    price: number | null;
    purchase_cost: number | null;
  } | null;
  suppliers: {
    id: string;
    company_name: string;
  } | null;
};

type LineItem = {
  variantId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  variant?: InventoryVariant;
};

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

export function SalesPanel({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { variantId: "", quantity: 1, unitPrice: 0, discount: 0 },
  ]);
  const [variants, setVariants] = useState<InventoryVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(true);
  const [variantsError, setVariantsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  // Sales history state (passed to SalesHistory)
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [dateRange, setDateRange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Fetch variants for the picker
  const fetchVariants = useCallback(async () => {
    setVariantsLoading(true);
    setVariantsError("");
    try {
      const res = await fetch("/api/management/inventory?limit=500", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setVariants(data.variants ?? []);
      } else {
        setVariantsError(
          data.error ||
            (he ? "לא ניתן לטעון מוצרים" : "Unable to load products"),
        );
      }
    } catch {
      setVariantsError(he ? "שגיאת חיבור" : "Connection error");
    } finally {
      setVariantsLoading(false);
    }
  }, [he]);

  useEffect(() => {
    // Initial load - use AbortController to avoid setState-in-effect lint issue
    const controller = new AbortController();
    fetch("/api/management/inventory?limit=500", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.variants) {
            setVariants(data.variants);
          }
          setVariantsLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setVariantsError(he ? "שגיאת חיבור" : "Connection error");
          setVariantsLoading(false);
        }
      });
    return () => controller.abort();
  }, [he]);

  // Fetch sales history
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const params = new URLSearchParams();
      if (dateRange?.from) params.set("from", dateRange.from);
      if (dateRange?.to) params.set("to", dateRange.to);
      const res = await fetch(`/api/management/sales?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders ?? []);
      } else {
        setOrdersError(
          data.error ||
            (he
              ? "לא ניתן לטעון היסטוריית מכירות"
              : "Unable to load sales history"),
        );
      }
    } catch {
      setOrdersError(he ? "שגיאת חיבור" : "Connection error");
    } finally {
      setOrdersLoading(false);
    }
  }, [dateRange, he]);

  useEffect(() => {
    // Initial load - use AbortController to avoid setState-in-effect lint issue
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (dateRange?.from) params.set("from", dateRange.from);
    if (dateRange?.to) params.set("to", dateRange.to);
    fetch(`/api/management/sales?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.orders) {
            setOrders(data.orders);
          }
          setOrdersLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOrdersError(he ? "שגיאת חיבור" : "Connection error");
          setOrdersLoading(false);
        }
      });
    return () => controller.abort();
  }, [dateRange, he]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  // Variant picker helpers
  const filteredVariants = variants
    .filter((v) => v.is_active && v.products?.status === "active")
    .filter((v) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const productName =
        (v.products?.name_he ?? "") + " " + (v.products?.name_en ?? "");
      return (
        v.sku.toLowerCase().includes(q) ||
        productName.toLowerCase().includes(q) ||
        (v.barcode?.toLowerCase().includes(q) ?? false)
      );
    });

  const getVariantDisplay = (variant: InventoryVariant) => {
    const product = variant.products;
    const name = he ? (product?.name_he ?? "") : (product?.name_en ?? "");
    const price = variant.price_override ?? product?.price ?? 0;
    const stock = variant.stock_qty;
    const color = he ? variant.color_he : variant.color_en;
    const colorPart = color ? ` • ${color}` : "";
    return `${name}${colorPart} — SKU: ${variant.sku} — ${price.toFixed(2)} ILS — Stock: ${stock}`;
  };

  const handleVariantSelect = (index: number, variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    const product = variant?.products;
    const price = variant?.price_override ?? product?.price ?? 0;
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, variantId, unitPrice: price, variant } : item,
      ),
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { variantId: "", quantity: 1, unitPrice: 0, discount: 0 },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLineItem = (
    index: number,
    field: keyof LineItem,
    value: number | string,
  ) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerEmail.trim()) {
      showToast(
        he ? "שם ואימייל נדרשים" : "Name and email are required",
        "error",
      );
      return;
    }
    const validItems = lineItems.filter(
      (item) => item.variantId && item.quantity > 0,
    );
    if (validItems.length === 0) {
      showToast(he ? "הוסף לפחות פריט אחד" : "Add at least one item", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/management/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone || null,
          },
          items: validItems.map(
            ({ variantId, quantity, unitPrice, discount }) => ({
              variantId,
              quantity,
              unitPrice,
              discount: discount || 0,
            }),
          ),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          he
            ? `המכירה נרשמה — מספר הזמנה: ${data.orderId?.slice(0, 8) ?? "—"}`
            : `Sale recorded — Order #: ${data.orderId?.slice(0, 8) ?? "—"}`,
          "success",
        );
        // Reset form
        setCustomerName("");
        setCustomerEmail("");
        setCustomerPhone("");
        setLineItems([
          { variantId: "", quantity: 1, unitPrice: 0, discount: 0 },
        ]);
        fetchOrders();
      } else {
        if (data.code === "insufficient_stock") {
          showToast(
            he
              ? "מלאי לא מספיק לאחד הפריטים"
              : "Insufficient stock for one or more items",
            "error",
          );
        } else if (data.code === "invalid_product") {
          showToast(
            he ? "מוצר או גרסה לא תקינים" : "Invalid product or variant",
            "error",
          );
        } else {
          showToast(
            data.error || (he ? "רישום המכירה נכשל" : "Failed to record sale"),
            "error",
          );
        }
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDateRangeChange = (
    range: { from: string; to: string } | null,
  ) => {
    setDateRange(range);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(amount);

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const totalDiscount = lineItems.reduce(
    (sum, item) => sum + item.discount * item.quantity,
    0,
  );
  const total = subtotal - totalDiscount;

  return (
    <div className="sales-panel space-y-6">
      <div className="miro-card">
        <div className="border-b border-border-subtle p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {he ? "רישום מכירה" : "Record Sale"}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {he
                  ? "צור הזמנת מכירה חדשה וניהול היסטוריית מכירות"
                  : "Create a new sale order and manage sales history"}
              </p>
            </div>
          </div>
          {message && (
            <p className="mt-3 text-sm" role="status" aria-live="polite">
              <span
                className={`sales-panel__message ${
                  messageType === "success"
                    ? "sales-panel__message--success"
                    : "sales-panel__message--error"
                }`}
              >
                {messageType === "success" ? (
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {message}
              </span>
            </p>
          )}
        </div>

        {/* Record Sale Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5" aria-hidden="true" />
              {he ? "פרטי לקוח" : "Customer Details"}
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="customer-name"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "שם מלא *" : "Full name *"}
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="miro-input"
                  required
                  placeholder={he ? "שם הלקוח" : "Customer name"}
                />
              </div>
              <div>
                <label
                  htmlFor="customer-email"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "אימייל *" : "Email *"}
                </label>
                <input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="miro-input"
                  required
                  placeholder={he ? "email@example.com" : "email@example.com"}
                />
              </div>
              <div>
                <label
                  htmlFor="customer-phone"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "טלפון" : "Phone"}
                </label>
                <input
                  id="customer-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="miro-input"
                  placeholder={he ? "050-1234567" : "050-1234567"}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-border-subtle pt-6">
            <legend className="text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5" aria-hidden="true" />
              {he ? "פריטי הזמנה" : "Order Items"}
            </legend>

            {variantsLoading && (
              <div
                className="sales-panel__loading"
                role="status"
                aria-live="polite"
              >
                <div className="sales-panel__spinner" aria-hidden="true" />
                <p>{he ? "טוען מוצרים…" : "Loading products…"}</p>
              </div>
            )}

            {variantsError && !variantsLoading && (
              <div className="sales-panel__error" role="alert">
                <AlertCircle
                  className="h-5 w-5 text-error-text"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {he ? "שגיאה בטעינת מוצרים" : "Failed to load products"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {variantsError}
                  </p>
                  <button
                    type="button"
                    className="miro-button miro-button-secondary text-sm mt-2"
                    onClick={fetchVariants}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {he ? "נסה שוב" : "Retry"}
                  </button>
                </div>
              </div>
            )}

            {!variantsLoading && !variantsError && (
              <>
                <div className="sales-panel__search-wrapper">
                  <label htmlFor="variant-search" className="sr-only">
                    {he ? "חיפוש מוצר" : "Search product"}
                  </label>
                  <div className="relative">
                    <Search
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      id="variant-search"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        he
                          ? "חפש לפי שם, SKU או ברקוד…"
                          : "Search by name, SKU or barcode…"
                      }
                      className="miro-input ps-10"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div
                      key={index}
                      className="sales-panel__line-item grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 border border-border-subtle rounded-xl bg-surface-muted"
                    >
                      <div className="md:col-span-4">
                        <label
                          htmlFor={`variant-${index}`}
                          className="block text-sm font-medium mb-1"
                        >
                          {he ? "מוצר *" : "Product *"}
                        </label>
                        <select
                          id={`variant-${index}`}
                          value={item.variantId}
                          onChange={(e) =>
                            handleVariantSelect(index, e.target.value)
                          }
                          disabled={submitting}
                          className="miro-input sales-panel__variant-select"
                          aria-label={he ? "בחר מוצר" : "Select product"}
                        >
                          <option value="">
                            {he ? "— בחר מוצר —" : "— Select product —"}
                          </option>
                          {filteredVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {getVariantDisplay(v)}
                            </option>
                          ))}
                        </select>
                        {item.variant && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {he ? "מלאי זמין" : "Available stock"}:{" "}
                            {item.variant.stock_qty}
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label
                          htmlFor={`qty-${index}`}
                          className="block text-sm font-medium mb-1"
                        >
                          {he ? "כמות *" : "Qty *"}
                        </label>
                        <input
                          id={`qty-${index}`}
                          type="number"
                          min="1"
                          max={item.variant?.stock_qty ?? 9999}
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              index,
                              "quantity",
                              parseInt(e.target.value) || 1,
                            )
                          }
                          className="miro-input"
                          required
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label
                          htmlFor={`price-${index}`}
                          className="block text-sm font-medium mb-1"
                        >
                          {he ? "מחיר יחידה (ILS)" : "Unit price (ILS)"}
                        </label>
                        <input
                          id={`price-${index}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateLineItem(
                              index,
                              "unitPrice",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="miro-input"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label
                          htmlFor={`discount-${index}`}
                          className="block text-sm font-medium mb-1"
                        >
                          {he ? "הנחה ליחידה (ILS)" : "Discount/unit (ILS)"}
                        </label>
                        <input
                          id={`discount-${index}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.discount}
                          onChange={(e) =>
                            updateLineItem(
                              index,
                              "discount",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="miro-input"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          disabled={submitting || lineItems.length <= 1}
                          className="miro-button miro-button-secondary h-10"
                          aria-label={he ? "הסר פריט" : "Remove item"}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {lineItems.length < 10 && (
                    <button
                      type="button"
                      onClick={addLineItem}
                      disabled={submitting}
                      className="miro-button miro-button-secondary w-full justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {he ? "הוסף פריט" : "Add item"}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Order Summary */}
            <div className="sales-panel__summary bg-surface p-4 rounded-xl border border-border-subtle">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {he ? "סכום חלקי" : "Subtotal"}
                  </p>
                  <p className="text-xl font-bold">
                    {formatCurrency(subtotal)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {he ? "סה״כ הנחות" : "Total discounts"}
                  </p>
                  <p className="text-xl font-bold text-error-text">
                    -{formatCurrency(totalDiscount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {he ? "פריטים" : "Items"}
                  </p>
                  <p className="text-xl font-bold">
                    {lineItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {he ? "סה״כ לתשלום" : "Total due"}
                  </p>
                  <p className="text-xl font-black text-primary">
                    {formatCurrency(total)}
                  </p>
                </div>
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end pt-4 border-t border-border-subtle">
            <button
              type="submit"
              disabled={submitting}
              className="miro-button miro-button-primary gap-2"
            >
              {submitting ? (
                <>
                  <div
                    className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  {he ? "רושם מכירה…" : "Recording sale…"}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" aria-hidden="true" />
                  {he ? "רשום מכירה" : "Record Sale"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Sales History Section */}
      <SalesHistory
        locale={locale}
        orders={orders}
        loading={ordersLoading}
        error={ordersError}
        onRetry={fetchOrders}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        expandedOrders={expandedOrders}
        onToggleExpand={(orderId) => {
          setExpandedOrders((prev) => {
            const next = new Set(prev);
            if (next.has(orderId)) next.delete(orderId);
            else next.add(orderId);
            return next;
          });
        }}
      />
    </div>
  );
}
