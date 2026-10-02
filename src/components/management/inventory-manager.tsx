"use client";

import {
  SearchField,
  OverflowText,
  PageHeader,
  Dialog,
  TableSkeleton,
} from "./ui";

import { ReportChoices } from "./ui/reporting-workspace";
import { Pager } from "./pager";
import { useDebouncedValue } from "./use-debounced-value";
import { CollectionSummary } from "./ui/collection-summary";
import Link from "@/components/motion/motion-link";

import { useState, useEffect, useCallback } from "react";
import { ScrollRegion } from "@/components/management/ui/scroll-region";
import {
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

type InventoryResponse = {
  items?: Variant[];
  totalCount?: number;
  error?: string;
};

const inventoryPageSize = 100;

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
  return new Date(dateStr).toLocaleString(locale === "he" ? "he-IL" : "en-IL", {
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

async function fetchInventoryPages({
  search = "",
  lowStock = false,
  signal,
}: {
  search?: string;
  lowStock?: boolean;
  signal?: AbortSignal;
}): Promise<Variant[]> {
  const variants: Variant[] = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      limit: String(inventoryPageSize),
      offset: String(offset),
    });
    if (search) params.set("search", search);
    if (lowStock) params.set("lowStock", "true");

    const response = await fetch(
      `/api/management/inventory?${params.toString()}`,
      { cache: "no-store", signal },
    );
    const data = (await response.json()) as InventoryResponse;
    if (!response.ok) {
      throw new Error(data.error || "Failed to load inventory");
    }

    const pageItems = Array.isArray(data.items) ? data.items : [];
    variants.push(...pageItems);

    const totalCount = Number(data.totalCount ?? variants.length);
    if (pageItems.length < inventoryPageSize || variants.length >= totalCount) {
      return variants;
    }
    offset += inventoryPageSize;
  }
}

function toReplenishmentItems(variants: Variant[]): ReplenishmentItem[] {
  return variants
    .filter((variant) => {
      const threshold =
        variant.reorder_point ?? variant.low_stock_threshold ?? 0;
      return variant.stock_qty <= threshold;
    })
    .map((variant) => {
      const threshold =
        variant.reorder_point ?? variant.low_stock_threshold ?? 0;
      return {
        id: variant.id,
        sku: variant.sku,
        product_name_he: variant.products?.name_he || "",
        product_name_en: variant.products?.name_en || "",
        stock_qty: variant.stock_qty,
        low_stock_threshold: variant.low_stock_threshold,
        reorder_point: variant.reorder_point,
        reorder_qty: variant.reorder_qty,
        recommended_order: variant.reorder_qty ?? threshold * 2,
        supplier_name: variant.suppliers?.company_name || null,
      };
    });
}

interface InventoryManagerProps {
  locale: "he" | "en";
  initialStockFilter?: "all" | "low" | "out_of_stock";
}

export function InventoryManager({
  locale,
  initialStockFilter = "all",
}: InventoryManagerProps) {
  const he = locale === "he";
  const [variants, setVariants] = useState<Variant[]>([]);
  const [replenishment, setReplenishment] = useState<ReplenishmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [visibleLimit, setVisibleLimit] = useState(25);
  const [visibleOffset, setVisibleOffset] = useState(0);
  const pageOffset = Math.min(
    visibleOffset,
    Math.max(
      0,
      Math.floor((variants.length - 1) / visibleLimit) * visibleLimit,
    ),
  );
  const visibleVariants = variants.slice(pageOffset, pageOffset + visibleLimit);
  const [stockFilter, setStockFilter] = useState<
    "all" | "low" | "out_of_stock"
  >(initialStockFilter);
  const lowStockFilter = stockFilter === "low";
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
  const [historyOpening, setHistoryOpening] = useState<
    Record<string, { quantity: number; captured_at: string } | null>
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

  const fetchVariants = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted) return;
      setLoading(true);
      setError("");
      try {
        const items = await fetchInventoryPages({
          search: debouncedSearch,
          lowStock: lowStockFilter,
          signal,
        });
        if (!signal?.aborted)
          setVariants(
            stockFilter === "out_of_stock"
              ? items.filter((variant) => variant.stock_qty <= 0)
              : items,
          );
      } catch (cause) {
        if (!signal?.aborted) {
          setError(
            cause instanceof Error && cause.message
              ? cause.message
              : he
                ? "שגיאת חיבור"
                : "Connection error",
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [debouncedSearch, lowStockFilter, stockFilter, he],
  );

  const fetchReplenishment = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await fetchInventoryPages({ signal });
      if (!signal?.aborted) {
        setReplenishment(toReplenishmentItems(items));
      }
    } catch {
      // Silently fail for replenishment
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => fetchVariants(controller.signal));

    return () => controller.abort();
  }, [fetchVariants]);

  useEffect(() => {
    const controller = new AbortController();
    // The all-inventory replenishment summary is independent of search and needs one initial fetch.
    void Promise.resolve().then(() => fetchReplenishment(controller.signal));
    return () => controller.abort();
  }, [fetchReplenishment]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const invalidateHistory = (variantId: string) => {
    setHistoryData((current) => {
      const next = { ...current };
      delete next[variantId];
      return next;
    });
    setHistoryOpen(null);
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
        setHistoryOpening((prev) => ({
          ...prev,
          [variantId]: data.openingBalance ?? null,
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
        invalidateHistory(receiveModal.variant.id);
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
        invalidateHistory(adjustModal.variant.id);
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
        invalidateHistory(outModal.variant.id);
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
      <PageHeader
        title={he ? "המלאי, בשליטה" : "Inventory, under control"}
        subtitle={
          he
            ? "מלאי זמין, חידוש אספקה ותנועות — תמונה ברורה לכל וריאנט."
            : "Available stock, replenishment and movements. A clear picture for every variant."
        }
        actions={
          <Link
            href={`/${locale}/admin/suppliers`}
            className="mgmt-button mgmt-button--secondary"
          >
            <Truck size={17} aria-hidden="true" />
            {he ? "ספקים" : "Suppliers"}
          </Link>
        }
      />
      <CollectionSummary
        items={[
          {
            label: he ? "וריאנטים בסינון" : "Variants in this filter",
            value: loading ? "—" : variants.length,
          },
          {
            label: he ? "יחידות זמינות בסינון" : "Stock units in this filter",
            value: loading
              ? "—"
              : variants.reduce((sum, variant) => sum + variant.stock_qty, 0),
          },
          {
            label: he ? "מלאי נמוך בסינון" : "Low stock in this filter",
            value: loading
              ? "—"
              : variants.filter(
                  (variant) =>
                    variant.stock_qty > 0 &&
                    variant.stock_qty <= variant.low_stock_threshold,
                ).length,
          },
          {
            label: he ? "אזלו בסינון" : "Out of stock in this filter",
            value: loading
              ? "—"
              : variants.filter((variant) => variant.stock_qty <= 0).length,
          },
        ]}
      />
      <ReportChoices
        label={he ? "מצב מלאי" : "Stock status"}
        value={stockFilter}
        onChange={(value) => {
          setStockFilter(value);
          setVisibleOffset(0);
        }}
        options={[
          { value: "all", label: he ? "כל המלאי" : "All stock" },
          { value: "low", label: he ? "מלאי נמוך" : "Low stock" },
          { value: "out_of_stock", label: he ? "אזלו" : "Out of stock" },
        ]}
      />
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
                className="h-5 w-5 inline-block align-middle ms-2"
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
          <div
            className="inventory-manager__replenishment-list"
            tabIndex={0}
            role="region"
            aria-label={he ? "רשימת השלמת מלאי" : "Replenishment list"}
          >
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
                className="h-6 w-6 inline-block align-middle ms-2"
                aria-hidden="true"
              />
              {he ? "ניהול מלאי וריאנטים" : "Variant Inventory Management"}
            </h2>
          </div>
          <div className="inventory-manager__header-right">
            <SearchField
              className="mgmt-inventory-search"
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                setVisibleOffset(0);
              }}
              label={he ? "חיפוש מלאי" : "Search inventory"}
              placeholder={
                he
                  ? "חיפוש SKU, ברקוד, שם מוצר…"
                  : "Search SKU, barcode or product name…"
              }
              clearLabel={he ? "ניקוי חיפוש" : "Clear search"}
            />

            <label className="inventory-manager__filter-toggle">
              <input
                type="checkbox"
                checked={lowStockFilter}
                onChange={(e) => {
                  setStockFilter(e.target.checked ? "low" : "all");
                  setVisibleOffset(0);
                }}
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
              onClick={() => void fetchVariants()}
            >
              {he ? "נסה שוב" : "Retry"}
            </button>
          </div>
        )}

        {loading ? (
          <TableSkeleton
            mobileCards
            columnWidths={[
              "20%",
              "12%",
              "13%",
              "8%",
              "6%",
              "7%",
              "7%",
              "7%",
              "9%",
              "11%",
            ]}
            columns={
              he
                ? [
                    "מוצר",
                    "SKU",
                    "ברקוד",
                    "צבע",
                    "מלאי",
                    "סף נמוך",
                    "נקודת הזמנה",
                    "כמות הזמנה",
                    "ספק",
                    "פעולות",
                  ]
                : [
                    "Product",
                    "SKU",
                    "Barcode",
                    "Color",
                    "Stock",
                    "Low threshold",
                    "Reorder point",
                    "Reorder qty",
                    "Supplier",
                    "Actions",
                  ]
            }
            minWidth="90rem"
            label={he ? "טוען מלאי…" : "Loading inventory…"}
          />
        ) : (
          <>
            {/* Desktop Table */}
            <ScrollRegion
              className="inventory-manager__table-wrapper"
              label={
                he
                  ? "טבלת ניהול מלאי וריאנטים"
                  : "Variant inventory management table"
              }
            >
              <table className="inventory-manager__table">
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
                <tbody className="motion-content-reveal">
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
                    visibleVariants.map((variant) => (
                      <tr key={variant.id}>
                        <td>
                          <div className="inventory-manager__product-cell">
                            <p className="font-medium">
                              {he
                                ? variant.products?.name_he
                                : variant.products?.name_en}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              <OverflowText
                                text={variant.products?.slug ?? "—"}
                                dir="ltr"
                              />
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
            </ScrollRegion>

            {/* Mobile Card View */}
            <div className="inventory-manager__card-list" role="list">
              {visibleVariants.map((variant) => (
                <div
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
                            className="h-3 w-3 me-1"
                            aria-hidden="true"
                          />
                          {he ? "חסר במלאי" : "Out of Stock"}
                        </span>
                      )}
                      {variant.stock_qty > 0 &&
                        variant.stock_qty <= variant.low_stock_threshold && (
                          <span className="status-badge status-badge--suspended">
                            <AlertTriangle
                              className="h-3 w-3 me-1"
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
                            className="inventory-manager__color-swatch inline-block align-middle ms-2"
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
                      {historyOpening[variant.id] ? (
                        <p className="inventory-manager__history-empty">
                          {he
                            ? "יתרת פתיחה מיובאת"
                            : "Imported opening balance"}
                          : {historyOpening[variant.id]?.quantity} ·{" "}
                          {formatDate(
                            historyOpening[variant.id]!.captured_at,
                            locale,
                          )}
                          .{" "}
                          {he
                            ? "זהו צילום מצב ללא רישום של עובד שביצע תנועה."
                            : "This is a snapshot, not an employee stock movement."}
                        </p>
                      ) : null}
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
                </div>
              ))}
            </div>
            <Pager
              totalCount={variants.length}
              limit={visibleLimit}
              offset={pageOffset}
              onOffsetChange={setVisibleOffset}
              onLimitChange={(value) => {
                setVisibleLimit(value);
                setVisibleOffset(0);
              }}
              locale={locale}
              busy={loading}
            />
          </>
        )}

        {/* Modals - Receive */}
        <Dialog
          open={receiveModal.variant !== null}
          onClose={() => {
            if (!busyVariant)
              setReceiveModal({
                variant: null,
                quantity: "",
                unitCost: "",
                reference: "",
              });
          }}
          title={he ? "קבלת מלאי חדשה" : "New stock receipt"}
          closeLabel={he ? "סגירה" : "Close"}
          size="sm"
        >
          {receiveModal.variant ? (
            <div className="space-y-4">
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
                <label
                  htmlFor="receiveModal-quantity"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "כמות שהתקבלה" : "Quantity Received"}
                </label>
                <input
                  id="receiveModal-quantity"
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
                />
              </div>
              <div>
                <label
                  htmlFor="receiveModal-unit-cost"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "עלות ליחידה (₪)" : "Unit Cost (₪)"}
                </label>
                <input
                  id="receiveModal-unit-cost"
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
                <label
                  htmlFor="receiveModal-reference"
                  className="block text-sm font-medium mb-1"
                >
                  {he
                    ? "אסמכתא (מספר הזמנה, חשבונית...)"
                    : "Reference (PO, invoice...)"}
                </label>
                <input
                  id="receiveModal-reference"
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
                        className="h-4 w-4 animate-spin me-2"
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
          ) : null}
        </Dialog>

        {/* Modals - Adjust */}
        <Dialog
          open={adjustModal.variant !== null}
          onClose={() => {
            if (!busyVariant)
              setAdjustModal({ variant: null, counted: "", reason: "" });
          }}
          title={he ? "התאמת מלאי" : "Adjust stock"}
          closeLabel={he ? "סגירה" : "Close"}
          size="sm"
        >
          {adjustModal.variant ? (
            <div className="space-y-4">
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
                <label
                  htmlFor="adjustModal-counted"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "כמות נספרת בפועל" : "Physically Counted Quantity"}
                </label>
                <input
                  id="adjustModal-counted"
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
                />
              </div>
              <div>
                <label
                  htmlFor="adjustModal-reason"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "סיבת ההתאמה" : "Adjustment Reason"}
                </label>
                <select
                  id="adjustModal-reason"
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
                  <option value="">{he ? "בחר סיבה" : "Select reason"}</option>
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
                        className="h-4 w-4 animate-spin me-2"
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
          ) : null}
        </Dialog>

        {/* Modals - Out Movement */}
        <Dialog
          open={outModal.variant !== null}
          onClose={() => {
            if (!busyVariant)
              setOutModal({
                variant: null,
                type: "damage",
                delta: "",
                reference: "",
                note: "",
              });
          }}
          title={he ? "הוצאת מלאי" : "Out movement"}
          closeLabel={he ? "סגירה" : "Close"}
          size="sm"
        >
          {outModal.variant ? (
            <div className="space-y-4">
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
                <label
                  htmlFor="outModal-type"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "סוג הוצאה" : "Out Type"}
                </label>
                <select
                  id="outModal-type"
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
                <label
                  htmlFor="outModal-quantity"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "כמות להוצאה" : "Quantity to Remove"}
                </label>
                <input
                  id="outModal-quantity"
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
                />
              </div>
              <div>
                <label
                  htmlFor="outModal-reference"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "אסמכתא" : "Reference"}
                </label>
                <input
                  id="outModal-reference"
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
                <label
                  htmlFor="outModal-note"
                  className="block text-sm font-medium mb-1"
                >
                  {he ? "הערה" : "Note"}
                </label>
                <textarea
                  id="outModal-note"
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
                        className="h-4 w-4 animate-spin me-2"
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
          ) : null}
        </Dialog>
      </div>
    </div>
  );
}
