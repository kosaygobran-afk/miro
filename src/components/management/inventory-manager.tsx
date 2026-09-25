"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  Package,
  AlertTriangle,
  XCircle,
  Minus,
  History,
  RefreshCw,
  ChevronUp,
  Loader2,
  Truck,
  Edit3,
  AlertCircle,
} from "lucide-react";

type Variant = {
  id: string;
  sku: string;
  barcode: string | null;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  price_override: number | null;
  cost_override: number | null;
  supplier_id: string | null;
  supplier_sku: string | null;
  is_default: boolean;
  is_active: boolean;
  stock_qty: number;
  low_stock_threshold: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  created_at: string;
  updated_at: string;
  products: {
    id: string;
    name_he: string;
    name_en: string;
    slug: string;
    status: string;
    tracking_mode: string;
    out_of_stock_policy: string;
  } | null;
  suppliers: {
    id: string;
    company_name: string;
  } | null;
};

type StockMovement = {
  id: string;
  delta: number;
  previous_qty: number;
  resulting_qty: number;
  type: string;
  reference: string | null;
  unit_cost: number | null;
  note: string | null;
  actor_id: string;
  created_at: string;
};

type ReplenishmentItem = {
  id: string;
  sku: string;
  product_name_he: string;
  product_name_en: string;
  stock_qty: number;
  low_stock_threshold: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  recommended_order: number;
  supplier_name: string | null;
};

const movementTypes = [
  {
    value: "purchase_receipt",
    label: { he: "קבלת רכש", en: "Purchase Receipt" },
  },
  { value: "damage", label: { he: "נזק", en: "Damage" } },
  { value: "loss", label: { he: "אובדן", en: "Loss" } },
  { value: "transfer_out", label: { he: "העברה החוצה", en: "Transfer Out" } },
] as const;

const adjustReasons = [
  { value: "damage", label: { he: "נזק", en: "Damage" } },
  { value: "loss", label: { he: "אובדן", en: "Loss" } },
  { value: "correction", label: { he: "תיקון ספירה", en: "Count Correction" } },
  { value: "other", label: { he: "אחר", en: "Other" } },
] as const;

function formatCurrency(value: number, locale: "he" | "en"): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateStr: string, locale: "he" | "en"): string {
  return new Date(dateStr).toLocaleString(locale === "he" ? "he-IL" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMovementLabel(type: string, locale: "he" | "en"): string {
  const found = movementTypes.find((m) => m.value === type);
  if (found) return locale === "he" ? found.label.he : found.label.en;
  return type.replace(/_/g, " ");
}

interface InventoryManagerProps {
  locale: "he" | "en";
}

export function InventoryManager({ locale }: InventoryManagerProps) {
  const he = locale === "he";
  const [variants, setVariants] = useState<Variant[]>([]);
  const [replenishment, setReplenishment] = useState<ReplenishmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );
  const [busyVariant, setBusyVariant] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<
    Record<string, StockMovement[]>
  >({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  // Modal states
  const [receiveModal, setReceiveModal] = useState<{
    variant: Variant | null;
    quantity: string;
    unitCost: string;
    reference: string;
  }>({
    variant: null,
    quantity: "",
    unitCost: "",
    reference: "",
  });
  const [adjustModal, setAdjustModal] = useState<{
    variant: Variant | null;
    counted: string;
    reason: string;
  }>({
    variant: null,
    counted: "",
    reason: "",
  });
  const [outModal, setOutModal] = useState<{
    variant: Variant | null;
    type: string;
    delta: string;
    reference: string;
    note: string;
  }>({
    variant: null,
    type: "damage",
    delta: "",
    reference: "",
    note: "",
  });

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (lowStockFilter) params.append("lowStock", "true");
      params.append("limit", "200");

      const response = await fetch(
        `/api/management/inventory?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const data = await response.json();
      if (response.ok) {
        setVariants(data.variants ?? []);
      } else {
        setError(
          data.error ||
            (he ? "לא ניתן לטעון מלאי" : "Failed to load inventory"),
        );
      }
    } catch {
      setError(he ? "שגיאת חיבור" : "Connection error");
    } finally {
      setLoading(false);
    }
  }, [search, lowStockFilter, he]);

  const fetchReplenishment = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/management/inventory?lowStock=false&limit=500",
        { cache: "no-store" },
      );
      const data = await response.json();
      if (response.ok && data.variants) {
        const items: ReplenishmentItem[] = data.variants
          .filter((v: Variant) => {
            const threshold = v.reorder_point ?? v.low_stock_threshold;
            return v.stock_qty <= threshold;
          })
          .map((v: Variant) => {
            const threshold = v.reorder_point ?? v.low_stock_threshold;
            const recommended = v.reorder_qty ?? threshold * 2;
            return {
              id: v.id,
              sku: v.sku,
              product_name_he: v.products?.name_he || "",
              product_name_en: v.products?.name_en || "",
              stock_qty: v.stock_qty,
              low_stock_threshold: v.low_stock_threshold,
              reorder_point: v.reorder_point,
              reorder_qty: v.reorder_qty,
              recommended_order: recommended,
              supplier_name: v.suppliers?.company_name || null,
            };
          });
        setReplenishment(items);
      }
    } catch {
      // Silently fail for replenishment
    }
  }, []);

  useEffect(() => {
    // Initial load - use AbortController to avoid setState-in-effect lint issue
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (lowStockFilter) params.append("lowStock", "true");
    params.append("limit", "200");

    fetch(`/api/management/inventory?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.variants) {
            setVariants(data.variants);
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

    // Fetch replenishment separately
    fetch("/api/management/inventory?lowStock=false&limit=500", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (!controller.signal.aborted && data.variants) {
          const items: ReplenishmentItem[] = data.variants
            .filter((v: Variant) => {
              const threshold = v.reorder_point ?? v.low_stock_threshold;
              return v.stock_qty <= threshold;
            })
            .map((v: Variant) => {
              const threshold = v.reorder_point ?? v.low_stock_threshold;
              const recommended = v.reorder_qty ?? threshold * 2;
              return {
                id: v.id,
                sku: v.sku,
                product_name_he: v.products?.name_he || "",
                product_name_en: v.products?.name_en || "",
                stock_qty: v.stock_qty,
                low_stock_threshold: v.low_stock_threshold,
                reorder_point: v.reorder_point,
                reorder_qty: v.reorder_qty,
                recommended_order: recommended,
                supplier_name: v.suppliers?.company_name || null,
              };
            });
          setReplenishment(items);
        }
      })
      .catch(() => {
        // Silently fail for replenishment
      });

    return () => controller.abort();
  }, [search, lowStockFilter, he]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const fetchHistory = async (variantId: string) => {
    if (historyData[variantId]) {
      setHistoryOpen(variantId);
      return;
    }
    setHistoryLoading(variantId);
    try {
      const response = await fetch(
        `/api/management/inventory?variantId=${variantId}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (response.ok) {
        setHistoryData((prev) => ({
          ...prev,
          [variantId]: data.movements ?? [],
        }));
        setHistoryOpen(variantId);
      }
    } catch {
      showToast(
        he ? "לא ניתן לטעון היסטוריה" : "Failed to load history",
        "error",
      );
    } finally {
      setHistoryLoading(null);
    }
  };

  const closeHistory = () => setHistoryOpen(null);

  const handleReceive = async (variant: Variant) => {
    setReceiveModal({ variant, quantity: "", unitCost: "", reference: "" });
  };

  const handleAdjust = async (variant: Variant) => {
    setAdjustModal({ variant, counted: String(variant.stock_qty), reason: "" });
  };

  const handleOut = async (variant: Variant) => {
    setOutModal({
      variant,
      type: "damage",
      delta: "",
      reference: "",
      note: "",
    });
  };

  const submitReceive = async () => {
    const qty = parseInt(receiveModal.quantity, 10);
    if (!receiveModal.variant || !Number.isFinite(qty) || qty <= 0) return;
    const cost = receiveModal.unitCost.trim()
      ? parseFloat(receiveModal.unitCost)
      : null;
    if (receiveModal.unitCost.trim() && !Number.isFinite(cost)) return;
    setBusyVariant(receiveModal.variant.id);
    try {
      const response = await fetch("/api/management/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: receiveModal.variant.id,
          delta: qty,
          type: "purchase_receipt",
          reference: receiveModal.reference || null,
          unitCost: cost,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(he ? "קבלת מלאי נרשמה" : "Stock receipt recorded");
        setReceiveModal({
          variant: null,
          quantity: "",
          unitCost: "",
          reference: "",
        });
        fetchVariants();
        fetchReplenishment();
      } else {
        showToast(
          data.error || (he ? "שגיאה בקבלת מלאי" : "Receive failed"),
          "error",
        );
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusyVariant(null);
    }
  };

  const submitAdjust = async () => {
    if (!adjustModal.variant) return;
    const counted = parseInt(adjustModal.counted, 10);
    if (!Number.isFinite(counted) || counted < 0 || !adjustModal.reason) return;
    setBusyVariant(adjustModal.variant.id);
    try {
      const response = await fetch("/api/management/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: adjustModal.variant.id,
          counted,
          reason: adjustModal.reason,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(he ? "ההתאמה נרשמה" : "Adjustment recorded");
        setAdjustModal({ variant: null, counted: "", reason: "" });
        fetchVariants();
        fetchReplenishment();
      } else {
        showToast(
          data.error || (he ? "שגיאה בהתאמה" : "Adjust failed"),
          "error",
        );
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusyVariant(null);
    }
  };

  const submitOut = async () => {
    if (!outModal.variant) return;
    const qty = parseInt(outModal.delta, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const allowed = ["damage", "loss", "supplier_return", "transfer_out"];
    if (!allowed.includes(outModal.type)) return;
    setBusyVariant(outModal.variant.id);
    try {
      const response = await fetch("/api/management/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: outModal.variant.id,
          delta: -qty,
          type: outModal.type,
          reference: outModal.reference || null,
          note: outModal.note || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(he ? "ההוצאה נרשמה" : "Out movement recorded");
        setOutModal({
          variant: null,
          type: "damage",
          delta: "",
          reference: "",
          note: "",
        });
        fetchVariants();
        fetchReplenishment();
      } else if (
        response.status === 400 &&
        data.code === "insufficient_stock"
      ) {
        showToast(he ? "אין מספיק מלאי" : "Insufficient stock", "error");
      } else {
        showToast(
          data.error || (he ? "שגיאה בהוצאת מלאי" : "Out movement failed"),
          "error",
        );
      }
    } catch {
      showToast(he ? "שגיאת חיבור" : "Connection error", "error");
    } finally {
      setBusyVariant(null);
    }
  };

  return (
    <div className="inventory-manager space-y-6">
      {message && (
        <div
          className={`inventory-manager__toast ${messageType === "success" ? "inventory-manager__toast--success" : "inventory-manager__toast--error"}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      {/* Replenishment Summary Card */}
      {replenishment.length > 0 && (
        <div className="inventory-manager__replenishment miro-card">
          <div className="inventory-manager__replenishment-header">
            <h2 className="inventory-manager__replenishment-title">
              <Package
                className="h-5 w-5 inline-block align-middle ml-2"
                aria-hidden="true"
              />
              {he ? "סיכום חידוש מלאי" : "Replenishment Summary"}
            </h2>
            <p className="inventory-manager__replenishment-subtitle">
              {he
                ? `${replenishment.length} וריאנטים מתחת לנקודת הזמנה חוזרת`
                : `${replenishment.length} variants below reorder point`}
            </p>
          </div>
          <div className="inventory-manager__replenishment-list">
            {replenishment.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="inventory-manager__replenishment-item"
              >
                <div className="inventory-manager__replenishment-info">
                  <p className="inventory-manager__replenishment-name">
                    {he ? item.product_name_he : item.product_name_en}
                  </p>
                  <p className="inventory-manager__replenishment-sku">
                    SKU: {item.sku}{" "}
                    {item.supplier_name && `• ${item.supplier_name}`}
                  </p>
                </div>
                <div className="inventory-manager__replenishment-stats">
                  <span className="inventory-manager__replenishment-stock">
                    {he ? "מלאי נוכחי" : "Current"}:{" "}
                    <strong>{item.stock_qty}</strong>
                  </span>
                  <span className="inventory-manager__replenishment-threshold">
                    {he ? "סף" : "Threshold"}: {item.low_stock_threshold}
                  </span>
                  <span className="inventory-manager__replenishment-recommended">
                    {he ? "מומלץ להזמין" : "Recommended"}:{" "}
                    <strong>{item.recommended_order}</strong>
                  </span>
                </div>
              </div>
            ))}
            {replenishment.length > 10 && (
              <p className="inventory-manager__replenishment-more">
                {he
                  ? `ועוד ${replenishment.length - 10} פריטים...`
                  : `And ${replenishment.length - 10} more...`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="miro-card">
        <div className="inventory-manager__header">
          <div className="inventory-manager__header-left">
            <h2 className="text-xl font-black">
              <Package
                className="h-6 w-6 inline-block align-middle ml-2"
                aria-hidden="true"
              />
              {he ? "ניהול מלאי וריאנטים" : "Variant Inventory Management"}
            </h2>
          </div>
          <div className="inventory-manager__header-right">
            <div className="inventory-manager__search">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  he
                    ? "חיפוש SKU, ברקוד, שם מוצר..."
                    : "Search SKU, barcode, product name..."
                }
                className="miro-input"
                aria-label={he ? "חיפוש מלאי" : "Search inventory"}
              />
            </div>
            <label className="inventory-manager__filter-toggle">
              <input
                type="checkbox"
                checked={lowStockFilter}
                onChange={(e) => setLowStockFilter(e.target.checked)}
              />
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span>{he ? "מלאי נמוך בלבד" : "Low stock only"}</span>
            </label>
            <button
              className="miro-button miro-button-secondary"
              onClick={() => {
                fetchVariants();
                fetchReplenishment();
              }}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>{he ? "רענן" : "Refresh"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="inventory-manager__error" role="alert">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            <span>{error}</span>
            <button
              className="miro-button miro-button-secondary text-sm"
              onClick={fetchVariants}
            >
              {he ? "נסה שוב" : "Retry"}
            </button>
          </div>
        )}

        {loading ? (
          <div
            className="inventory-manager__loading"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="h-8 w-8 animate-spin text-primary"
              aria-hidden="true"
            />
            <p>{he ? "טוען מלאי…" : "Loading inventory…"}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="inventory-manager__table-wrapper">
              <table className="inventory-manager__table" role="grid">
                <caption className="sr-only">
                  {he
                    ? "טבלת ניהול מלאי וריאנטים"
                    : "Variant inventory management table"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{he ? "מוצר" : "Product"}</th>
                    <th scope="col">{he ? "SKU" : "SKU"}</th>
                    <th scope="col">{he ? "ברקוד" : "Barcode"}</th>
                    <th scope="col">{he ? "צבע" : "Color"}</th>
                    <th scope="col">{he ? "מלאי" : "Stock"}</th>
                    <th scope="col">{he ? "סף נמוך" : "Low Threshold"}</th>
                    <th scope="col">{he ? "נקודת הזמנה" : "Reorder Pt"}</th>
                    <th scope="col">{he ? "כמות הזמנה" : "Reorder Qty"}</th>
                    <th scope="col">{he ? "ספק" : "Supplier"}</th>
                    <th scope="col">{he ? "פעולות" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="inventory-manager__empty-cell"
                      >
                        {he ? "אין וריאנטים תואמים" : "No matching variants"}
                      </td>
                    </tr>
                  ) : (
                    variants.map((variant) => (
                      <tr key={variant.id}>
                        <td>
                          <div className="inventory-manager__product-cell">
                            <p className="font-medium">
                              {he
                                ? variant.products?.name_he
                                : variant.products?.name_en}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {variant.products?.slug}
                            </p>
                          </div>
                        </td>
                        <td>
                          <code className="font-mono text-sm">
                            {variant.sku}
                          </code>
                        </td>
                        <td>
                          <code className="font-mono text-sm">
                            {variant.barcode || "—"}
                          </code>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            {variant.color_hex && (
                              <span
                                className="inventory-manager__color-swatch"
                                style={
                                  {
                                    backgroundColor: variant.color_hex,
                                  } as React.CSSProperties
                                }
                                aria-label={
                                  he
                                    ? (variant.color_he ?? "")
                                    : (variant.color_en ?? "")
                                }
                              />
                            )}
                            <span>
                              {he ? variant.color_he : variant.color_en}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`inventory-manager__stock ${variant.stock_qty === 0 ? "inventory-manager__stock--zero" : variant.stock_qty <= variant.low_stock_threshold ? "inventory-manager__stock--low" : ""}`}
                          >
                            {variant.stock_qty}
                          </span>
                        </td>
                        <td>{variant.low_stock_threshold}</td>
                        <td>{variant.reorder_point ?? "—"}</td>
                        <td>{variant.reorder_qty ?? "—"}</td>
                        <td>{variant.suppliers?.company_name || "—"}</td>
                        <td>
                          <div className="inventory-manager__actions">
                            <button
                              className="miro-button miro-button-secondary text-xs"
                              onClick={() => handleReceive(variant)}
                              disabled={busyVariant === variant.id}
                            >
                              <Truck className="h-3 w-3" aria-hidden="true" />
                              {he ? "קבלה" : "Receive"}
                            </button>
                            <button
                              className="miro-button miro-button-secondary text-xs"
                              onClick={() => handleAdjust(variant)}
                              disabled={busyVariant === variant.id}
                            >
                              <Edit3 className="h-3 w-3" aria-hidden="true" />
                              {he ? "התאמה" : "Adjust"}
                            </button>
                            <button
                              className="miro-button miro-button-secondary text-xs"
                              onClick={() => handleOut(variant)}
                              disabled={busyVariant === variant.id}
                            >
                              <Minus className="h-3 w-3" aria-hidden="true" />
                              {he ? "הוצאה" : "Out"}
                            </button>
                            <button
                              className="miro-button miro-button-secondary text-xs"
                              onClick={() => fetchHistory(variant.id)}
                              disabled={historyLoading === variant.id}
                            >
                              {historyOpen === variant.id ? (
                                <ChevronUp
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              ) : (
                                <History
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="hidden sm:inline">
                                {he ? "היסטוריה" : "History"}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="inventory-manager__card-list" role="list">
              {variants.map((variant) => (
                <article
                  key={variant.id}
                  className="inventory-manager__card"
                  role="listitem"
                >
                  <div className="inventory-manager__card-header">
                    <div>
                      <p className="inventory-manager__card-name">
                        {he
                          ? variant.products?.name_he
                          : variant.products?.name_en}
                      </p>
                      <p className="inventory-manager__card-sku">
                        SKU: <code>{variant.sku}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {variant.stock_qty === 0 && (
                        <span className="status-badge status-badge--blocked">
                          <XCircle
                            className="h-3 w-3 mr-1"
                            aria-hidden="true"
                          />
                          {he ? "חסר במלאי" : "Out of Stock"}
                        </span>
                      )}
                      {variant.stock_qty > 0 &&
                        variant.stock_qty <= variant.low_stock_threshold && (
                          <span className="status-badge status-badge--suspended">
                            <AlertTriangle
                              className="h-3 w-3 mr-1"
                              aria-hidden="true"
                            />
                            {he ? "מלאי נמוך" : "Low Stock"}
                          </span>
                        )}
                    </div>
                  </div>
                  <div className="inventory-manager__card-body">
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "ברקוד" : "Barcode"}
                      </span>
                      <span className="inventory-manager__card-value font-mono">
                        {variant.barcode || "—"}
                      </span>
                    </div>
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "צבע" : "Color"}
                      </span>
                      <span className="inventory-manager__card-value">
                        {variant.color_hex && (
                          <span
                            className="inventory-manager__color-swatch inline-block align-middle ml-2"
                            style={{ backgroundColor: variant.color_hex }}
                          />
                        )}
                        {he ? variant.color_he : variant.color_en}
                      </span>
                    </div>
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "מלאי" : "Stock"}
                      </span>
                      <span
                        className={`inventory-manager__card-value inventory-manager__stock ${variant.stock_qty === 0 ? "inventory-manager__stock--zero" : variant.stock_qty <= variant.low_stock_threshold ? "inventory-manager__stock--low" : ""}`}
                      >
                        {variant.stock_qty}
                      </span>
                    </div>
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "סף נמוך" : "Low Threshold"}
                      </span>
                      <span className="inventory-manager__card-value">
                        {variant.low_stock_threshold}
                      </span>
                    </div>
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "נקודת הזמנה" : "Reorder Point"}
                      </span>
                      <span className="inventory-manager__card-value">
                        {variant.reorder_point ?? "—"}
                      </span>
                    </div>
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "כמות הזמנה" : "Reorder Qty"}
                      </span>
                      <span className="inventory-manager__card-value">
                        {variant.reorder_qty ?? "—"}
                      </span>
                    </div>
                    <div className="inventory-manager__card-row">
                      <span className="inventory-manager__card-label">
                        {he ? "ספק" : "Supplier"}
                      </span>
                      <span className="inventory-manager__card-value">
                        {variant.suppliers?.company_name || "—"}
                      </span>
                    </div>
                  </div>
                  <div className="inventory-manager__card-actions">
                    <button
                      className="miro-button miro-button-secondary text-sm"
                      onClick={() => handleReceive(variant)}
                      disabled={busyVariant === variant.id}
                    >
                      <Truck className="h-4 w-4" aria-hidden="true" />
                      {he ? "קבלת מלאי" : "Receive Stock"}
                    </button>
                    <button
                      className="miro-button miro-button-secondary text-sm"
                      onClick={() => handleAdjust(variant)}
                      disabled={busyVariant === variant.id}
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                      {he ? "התאמת מלאי" : "Adjust Stock"}
                    </button>
                    <button
                      className="miro-button miro-button-secondary text-sm"
                      onClick={() => handleOut(variant)}
                      disabled={busyVariant === variant.id}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                      {he ? "הוצאה ידנית" : "Manual Out"}
                    </button>
                    <button
                      className="miro-button miro-button-secondary text-sm"
                      onClick={() => fetchHistory(variant.id)}
                      disabled={historyLoading === variant.id}
                    >
                      {historyOpen === variant.id ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <History className="h-4 w-4" aria-hidden="true" />
                      )}
                      {he ? "היסטוריה" : "History"}
                    </button>
                  </div>

                  {/* Inline History Panel */}
                  {historyOpen === variant.id && historyData[variant.id] && (
                    <div className="inventory-manager__history-panel">
                      <div className="inventory-manager__history-header">
                        <h4>{he ? "היסטוריית תנועות" : "Movement History"}</h4>
                        <button
                          className="miro-button miro-button-secondary text-xs"
                          onClick={closeHistory}
                        >
                          {he ? "סגור" : "Close"}
                        </button>
                      </div>
                      {historyLoading === variant.id ? (
                        <div className="inventory-manager__history-loading">
                          <Loader2
                            className="h-5 w-5 animate-spin"
                            aria-hidden="true"
                          />
                          <span>
                            {he ? "טוען היסטוריה…" : "Loading history…"}
                          </span>
                        </div>
                      ) : historyData[variant.id].length === 0 ? (
                        <p className="inventory-manager__history-empty">
                          {he
                            ? "אין תנועות מלאי לווריאנט זה"
                            : "No stock movements for this variant"}
                        </p>
                      ) : (
                        <div className="inventory-manager__history-list">
                          {historyData[variant.id].map((movement) => (
                            <div
                              key={movement.id}
                              className="inventory-manager__history-item"
                            >
                              <div className="inventory-manager__history-main">
                                <span className="inventory-manager__history-date">
                                  {formatDate(movement.created_at, locale)}
                                </span>
                                <span className="inventory-manager__history-type">
                                  {getMovementLabel(movement.type, locale)}
                                </span>
                                <span
                                  className={`inventory-manager__history-delta ${movement.delta > 0 ? "inventory-manager__history-delta--positive" : "inventory-manager__history-delta--negative"}`}
                                >
                                  {movement.delta > 0 ? "+" : ""}
                                  {movement.delta}
                                </span>
                              </div>
                              <div className="inventory-manager__history-details">
                                {movement.reference && (
                                  <span className="inventory-manager__history-ref">
                                    {he ? "אסמכתא" : "Ref"}:{" "}
                                    {movement.reference}
                                  </span>
                                )}
                                {movement.note && (
                                  <span className="inventory-manager__history-note">
                                    {he ? "הערה" : "Note"}: {movement.note}
                                  </span>
                                )}
                                <span className="inventory-manager__history-resulting">
                                  {he ? "מלאי נוכחי" : "Current stock"}:{" "}
                                  {movement.resulting_qty}
                                </span>
                                {movement.unit_cost !== null && (
                                  <span className="inventory-manager__history-cost">
                                    {he ? "עלות יחידה" : "Unit cost"}:{" "}
                                    {formatCurrency(movement.unit_cost, locale)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        {/* Modals - Receive */}
        {receiveModal.variant && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() =>
              setReceiveModal({
                variant: null,
                quantity: "",
                unitCost: "",
                reference: "",
              })
            }
          >
            <div
              className="bg-background rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border-subtle p-4 flex items-center justify-between">
                <h3 className="text-lg font-black">
                  {he ? "קבלת מלאי חדשה" : "New Stock Receipt"}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {he ? "מוצר" : "Product"}:{" "}
                  {he
                    ? receiveModal.variant.products?.name_he
                    : receiveModal.variant.products?.name_en}{" "}
                  (SKU: {receiveModal.variant.sku})
                </p>
                <p className="text-sm text-muted-foreground">
                  {he ? "מלאי נוכחי" : "Current stock"}:{" "}
                  {receiveModal.variant.stock_qty}
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "כמות שהתקבלה" : "Quantity Received"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    className="miro-input"
                    placeholder={he ? "כמות" : "Quantity"}
                    value={receiveModal.quantity}
                    onChange={(e) =>
                      setReceiveModal((prev) => ({
                        ...prev,
                        quantity: e.target.value,
                      }))
                    }
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "עלות ליחידה (₪)" : "Unit Cost (₪)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="miro-input"
                    placeholder="0.00"
                    value={receiveModal.unitCost}
                    onChange={(e) =>
                      setReceiveModal((prev) => ({
                        ...prev,
                        unitCost: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he
                      ? "אסמכתא (מספר הזמנה, חשבונית...)"
                      : "Reference (PO, invoice...)"}
                  </label>
                  <input
                    type="text"
                    className="miro-input"
                    placeholder={he ? "אופציונלי" : "Optional"}
                    value={receiveModal.reference}
                    onChange={(e) =>
                      setReceiveModal((prev) => ({
                        ...prev,
                        reference: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    className="miro-button miro-button-secondary"
                    onClick={() =>
                      setReceiveModal({
                        variant: null,
                        quantity: "",
                        unitCost: "",
                        reference: "",
                      })
                    }
                  >
                    {he ? "ביטול" : "Cancel"}
                  </button>
                  <button
                    className="miro-button miro-button-primary"
                    onClick={submitReceive}
                    disabled={busyVariant === receiveModal.variant.id}
                  >
                    {busyVariant === receiveModal.variant.id ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin mr-2"
                          aria-hidden="true"
                        />
                        {he ? "שומר..." : "Saving..."}
                      </>
                    ) : he ? (
                      "אישור קבלה"
                    ) : (
                      "Confirm Receipt"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modals - Adjust */}
        {adjustModal.variant && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() =>
              setAdjustModal({ variant: null, counted: "", reason: "" })
            }
          >
            <div
              className="bg-background rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border-subtle p-4 flex items-center justify-between">
                <h3 className="text-lg font-black">
                  {he ? "התאמת מלאי" : "Adjust Stock"}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {he ? "מוצר" : "Product"}:{" "}
                  {he
                    ? adjustModal.variant.products?.name_he
                    : adjustModal.variant.products?.name_en}{" "}
                  (SKU: {adjustModal.variant.sku})
                </p>
                <p className="text-sm text-muted-foreground">
                  {he ? "מלאי נוכחי" : "Current stock"}:{" "}
                  {adjustModal.variant.stock_qty}
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "כמות נספרת בפועל" : "Physically Counted Quantity"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    className="miro-input"
                    value={adjustModal.counted}
                    onChange={(e) =>
                      setAdjustModal((prev) => ({
                        ...prev,
                        counted: e.target.value,
                      }))
                    }
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "סיבת ההתאמה" : "Adjustment Reason"}
                  </label>
                  <select
                    className="miro-input"
                    value={adjustModal.reason}
                    onChange={(e) =>
                      setAdjustModal((prev) => ({
                        ...prev,
                        reason: e.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">
                      {he ? "בחר סיבה" : "Select reason"}
                    </option>
                    {adjustReasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {he ? r.label.he : r.label.en}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    className="miro-button miro-button-secondary"
                    onClick={() =>
                      setAdjustModal({ variant: null, counted: "", reason: "" })
                    }
                  >
                    {he ? "ביטול" : "Cancel"}
                  </button>
                  <button
                    className="miro-button miro-button-primary"
                    onClick={submitAdjust}
                    disabled={
                      busyVariant === adjustModal.variant.id ||
                      !adjustModal.reason
                    }
                  >
                    {busyVariant === adjustModal.variant.id ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin mr-2"
                          aria-hidden="true"
                        />
                        {he ? "שומר..." : "Saving..."}
                      </>
                    ) : he ? (
                      "אישור התאמה"
                    ) : (
                      "Confirm Adjustment"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modals - Out Movement */}
        {outModal.variant && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() =>
              setOutModal({
                variant: null,
                type: "damage",
                delta: "",
                reference: "",
                note: "",
              })
            }
          >
            <div
              className="bg-background rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border-subtle p-4 flex items-center justify-between">
                <h3 className="text-lg font-black">
                  {he ? "הוצאת מלאי ידנית" : "Manual Stock Out"}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {he ? "מוצר" : "Product"}:{" "}
                  {he
                    ? outModal.variant.products?.name_he
                    : outModal.variant.products?.name_en}{" "}
                  (SKU: {outModal.variant.sku})
                </p>
                <p className="text-sm text-muted-foreground">
                  {he ? "מלאי נוכחי" : "Current stock"}:{" "}
                  {outModal.variant.stock_qty}
                </p>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "סוג הוצאה" : "Out Type"}
                  </label>
                  <select
                    className="miro-input"
                    value={outModal.type}
                    onChange={(e) =>
                      setOutModal((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    {movementTypes.map((m) => (
                      <option key={m.value} value={m.value}>
                        {he ? m.label.he : m.label.en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "כמות להוצאה" : "Quantity to Remove"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={outModal.variant.stock_qty}
                    className="miro-input"
                    value={outModal.delta}
                    onChange={(e) =>
                      setOutModal((prev) => ({
                        ...prev,
                        delta: e.target.value,
                      }))
                    }
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "אסמכתא" : "Reference"}
                  </label>
                  <input
                    type="text"
                    className="miro-input"
                    placeholder={he ? "אופציונלי" : "Optional"}
                    value={outModal.reference}
                    onChange={(e) =>
                      setOutModal((prev) => ({
                        ...prev,
                        reference: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "הערה" : "Note"}
                  </label>
                  <textarea
                    className="miro-input"
                    rows={2}
                    placeholder={he ? "אופציונלי" : "Optional"}
                    value={outModal.note}
                    onChange={(e) =>
                      setOutModal((prev) => ({ ...prev, note: e.target.value }))
                    }
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    className="miro-button miro-button-secondary"
                    onClick={() =>
                      setOutModal({
                        variant: null,
                        type: "damage",
                        delta: "",
                        reference: "",
                        note: "",
                      })
                    }
                  >
                    {he ? "ביטול" : "Cancel"}
                  </button>
                  <button
                    className="miro-button miro-button-primary"
                    onClick={submitOut}
                    disabled={
                      busyVariant === outModal.variant.id || !outModal.delta
                    }
                  >
                    {busyVariant === outModal.variant.id ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin mr-2"
                          aria-hidden="true"
                        />
                        {he ? "שומר..." : "Saving..."}
                      </>
                    ) : he ? (
                      "אישור הוצאה"
                    ) : (
                      "Confirm Out"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
