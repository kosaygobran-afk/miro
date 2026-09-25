"use client";

import { useState, useCallback } from "react";
import { Plus, Edit, Eye, EyeOff } from "lucide-react";

type ProductVariant = {
  id: string;
  product_id: string;
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
  low_stock_threshold: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  stock_qty: number;
  created_at: string;
  updated_at: string;
  suppliers?: { id: string; company_name: string } | null;
};

type Supplier = { id: string; company_name: string; is_active?: boolean };

export function VariantsManager({
  locale,
  productId,
  initialVariants,
  suppliers,
  onVariantsChange,
  disabled,
}: {
  locale: "he" | "en";
  productId: string;
  initialVariants: ProductVariant[];
  suppliers: Supplier[];
  onVariantsChange: (variants: ProductVariant[]) => void;
  disabled?: boolean;
}) {
  const he = locale === "he";
  const [variants, setVariants] = useState<ProductVariant[]>(initialVariants);
  const [showForm, setShowForm] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(
    null,
  );
  const [formData, setFormData] = useState({
    sku: "",
    barcode: "",
    color_he: "",
    color_en: "",
    color_hex: "",
    price_override: "",
    cost_override: "",
    supplier_id: "",
    supplier_sku: "",
    is_default: false,
    is_active: true,
    low_stock_threshold: 0,
    reorder_point: "",
    reorder_qty: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadVariants = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/management/variants?productId=${productId}`,
        {
          cache: "no-store",
        },
      );
      if (response.ok) {
        const { variants: variantsData } = await response.json();
        setVariants(variantsData);
        onVariantsChange(variantsData);
      }
    } catch (err) {
      console.error("Failed to load variants", err);
    }
  }, [productId, onVariantsChange]);

  const resetForm = () => {
    setFormData({
      sku: "",
      barcode: "",
      color_he: "",
      color_en: "",
      color_hex: "",
      price_override: "",
      cost_override: "",
      supplier_id: "",
      supplier_sku: "",
      is_default: false,
      is_active: true,
      low_stock_threshold: 0,
      reorder_point: "",
      reorder_qty: "",
    });
    setEditingVariant(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (variant: ProductVariant) => {
    setFormData({
      sku: variant.sku,
      barcode: variant.barcode ?? "",
      color_he: variant.color_he ?? "",
      color_en: variant.color_en ?? "",
      color_hex: variant.color_hex ?? "",
      price_override: variant.price_override?.toString() ?? "",
      cost_override: variant.cost_override?.toString() ?? "",
      supplier_id: variant.supplier_id ?? "",
      supplier_sku: variant.supplier_sku ?? "",
      is_default: variant.is_default,
      is_active: variant.is_active,
      low_stock_threshold: variant.low_stock_threshold,
      reorder_point: variant.reorder_point?.toString() ?? "",
      reorder_qty: variant.reorder_qty?.toString() ?? "",
    });
    setEditingVariant(variant);
    setShowForm(true);
  };

  const handleFormChange = (
    field: string,
    value: string | number | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitForm = async () => {
    setSaving(true);
    setError("");
    try {
      const method = editingVariant ? "PATCH" : "POST";
      const url = "/api/management/variants";
      const body = {
        ...(editingVariant ? { id: editingVariant.id } : {}),
        product_id: productId,
        sku: formData.sku,
        barcode: formData.barcode || null,
        color_he: formData.color_he || null,
        color_en: formData.color_en || null,
        color_hex: formData.color_hex || null,
        price_override: formData.price_override
          ? Number(formData.price_override)
          : null,
        cost_override: formData.cost_override
          ? Number(formData.cost_override)
          : null,
        supplier_id: formData.supplier_id || null,
        supplier_sku: formData.supplier_sku || null,
        is_default: formData.is_default,
        is_active: formData.is_active,
        low_stock_threshold: Number(formData.low_stock_threshold),
        reorder_point: formData.reorder_point
          ? Number(formData.reorder_point)
          : null,
        reorder_qty: formData.reorder_qty ? Number(formData.reorder_qty) : null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        if (err.code === "duplicate_sku") {
          throw new Error(he ? "מק״ט זה כבר קיים" : "This SKU already exists");
        }
        if (err.code === "duplicate_barcode") {
          throw new Error(
            he ? "ברקוד זה כבר קיים" : "This barcode already exists",
          );
        }
        throw new Error(err.error || (he ? "שגיאה בשמירה" : "Save failed"));
      }

      setShowForm(false);
      resetForm();
      await loadVariants();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה בשמירה"
            : "Save failed",
      );
    } finally {
      setSaving(false);
    }
  };

  const archiveVariant = async (variant: ProductVariant) => {
    if (
      !confirm(
        he
          ? "האם לארכב וריאנט זה? הוא יהפוך ללא פעיל."
          : "Archive this variant? It will become inactive.",
      )
    )
      return;
    setError("");
    try {
      const response = await fetch(
        `/api/management/variants?id=${variant.id}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const err = await response.json();
        if (err.code === "has_stock_movements") {
          throw new Error(
            he
              ? "לא ניתן למחוק - יש תנועות מלאי. הוריאנט יאורכב."
              : "Cannot delete - has stock movements. Variant will be archived.",
          );
        }
        throw new Error(err.error || (he ? "שגיאה בארכוב" : "Archive failed"));
      }
      await loadVariants();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה בארכוב"
            : "Archive failed",
      );
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return he ? "—" : "—";
    return new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(price);
  };

  const totalStock = variants
    .filter((v) => v.is_active)
    .reduce((sum, v) => sum + v.stock_qty, 0);

  if (variants.length === 0 && !showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium">
            {he ? "וריאנטים" : "Variants"}
          </label>
          {!disabled && (
            <button
              type="button"
              className="miro-button miro-button-primary"
              onClick={openCreateForm}
            >
              <Plus className="mr-2 h-4 w-4" />
              {he ? "הוסף וריאנט ראשון" : "Add first variant"}
            </button>
          )}
        </div>
        <div className="miro-card p-8 text-center border-dashed border-border-subtle">
          <p className="text-muted-foreground">
            {he
              ? "אין וריאנטים עדיין. כל מוצר חייב לפחות וריאנט אחד פעיל עם SKU וברקוד ייחודיים."
              : "No variants yet. Each product must have at least one active variant with unique SKU and barcode."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <label className="block text-sm font-medium">
            {he ? "וריאנטים" : "Variants"}
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            {he
              ? `${variants.length} וריאנט${variants.length !== 1 ? "ים" : ""} • ${totalStock} יח׳ במלאי כולל`
              : `${variants.length} variant${variants.length !== 1 ? "s" : ""} • ${totalStock} units total stock`}
          </p>
        </div>
        {!disabled && (
          <button
            type="button"
            className="miro-button miro-button-primary"
            onClick={openCreateForm}
          >
            <Plus className="mr-2 h-4 w-4" />
            {he ? "הוסף וריאנט" : "Add variant"}
          </button>
        )}
      </div>

      {error && (
        <div
          className="miro-card border-destructive/50 bg-destructive/5 p-3"
          role="alert"
        >
          <div className="flex items-center gap-2 text-sm text-destructive">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {error}
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block">
        <div className="miro-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="grid">
              <caption className="sr-only">
                {he ? "טבלת ניהול וריאנטים" : "Variants management table"}
              </caption>
              <thead className="bg-surface-muted border-b border-border-subtle">
                <tr>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "צבע" : "Color"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    SKU
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "ברקוד" : "Barcode"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "מחיר" : "Price"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "עלות" : "Cost"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "ספק" : "Supplier"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "מלאי" : "Stock"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "מצב" : "Status"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "ברירת מחדל" : "Default"}
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs">
                    {he ? "פעולות" : "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {variants.map((variant) => (
                  <tr
                    key={variant.id}
                    className={`hover:bg-surface-muted/50 ${!variant.is_active ? "opacity-50" : ""}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {variant.color_hex && (
                          <div
                            className="h-6 w-6 rounded border border-border-subtle"
                            style={{ backgroundColor: variant.color_hex }}
                            title={
                              he
                                ? (variant.color_he ?? "")
                                : (variant.color_en ?? "")
                            }
                            aria-label={
                              he
                                ? `צבע: ${variant.color_he}`
                                : `Color: ${variant.color_en}`
                            }
                          />
                        )}
                        <span className="font-medium">
                          {he
                            ? (variant.color_he ?? "—")
                            : (variant.color_en ?? "—")}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">{variant.sku}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {variant.barcode ?? "—"}
                    </td>
                    <td className="p-3 font-medium">
                      {formatPrice(variant.price_override)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatPrice(variant.cost_override)}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {variant.suppliers?.company_name ?? "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          variant.stock_qty <=
                            (variant.low_stock_threshold || 0) &&
                          variant.low_stock_threshold > 0
                            ? "text-destructive font-medium"
                            : ""
                        }
                      >
                        {variant.stock_qty}
                        {variant.low_stock_threshold > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (min: {variant.low_stock_threshold})
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`status-badge ${variant.is_active ? "status-badge--active" : "status-badge--suspended"}`}
                      >
                        {variant.is_active
                          ? he
                            ? "פעיל"
                            : "Active"
                          : he
                            ? "לא פעיל"
                            : "Inactive"}
                      </span>
                    </td>
                    <td className="p-3">
                      {variant.is_default && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {he ? "ברירת מחדל" : "Default"}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {!disabled && (
                          <button
                            type="button"
                            className="miro-button miro-button-secondary text-xs p-2"
                            onClick={() => openEditForm(variant)}
                            aria-label={he ? "ערוך וריאנט" : "Edit variant"}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {!disabled && (
                          <button
                            type="button"
                            className={`miro-button miro-button-secondary text-xs p-2 ${variant.is_active ? "text-destructive hover:bg-destructive/10" : ""}`}
                            onClick={() => archiveVariant(variant)}
                            aria-label={
                              variant.is_active
                                ? he
                                  ? "ארכב"
                                  : "Archive"
                                : he
                                  ? "הפעל"
                                  : "Activate"
                            }
                          >
                            {variant.is_active ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Card List */}
      <div
        className="lg:hidden space-y-3"
        role="list"
        aria-label={he ? "וריאנטים" : "Variants"}
      >
        {variants.map((variant) => (
          <article
            key={variant.id}
            className={`miro-card p-4 ${!variant.is_active ? "opacity-50" : ""}`}
            role="listitem"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {variant.color_hex && (
                  <div
                    className="h-8 w-8 rounded border border-border-subtle flex-shrink-0"
                    style={{ backgroundColor: variant.color_hex }}
                    title={
                      he ? (variant.color_he ?? "") : (variant.color_en ?? "")
                    }
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">
                      {he
                        ? (variant.color_he ?? "—")
                        : (variant.color_en ?? "—")}
                    </p>
                    {variant.is_default && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                        {he ? "ברירת מחדל" : "Default"}
                      </span>
                    )}
                    <span
                      className={`status-badge ${variant.is_active ? "status-badge--active" : "status-badge--suspended"} whitespace-nowrap`}
                    >
                      {variant.is_active
                        ? he
                          ? "פעיל"
                          : "Active"
                        : he
                          ? "לא פעיל"
                          : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {variant.sku}
                  </p>
                </div>
              </div>
              {!disabled && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="miro-button miro-button-secondary text-xs p-2"
                    onClick={() => openEditForm(variant)}
                    aria-label={he ? "ערוך וריאנט" : "Edit variant"}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={`miro-button miro-button-secondary text-xs p-2 ${variant.is_active ? "text-destructive hover:bg-destructive/10" : ""}`}
                    onClick={() => archiveVariant(variant)}
                    aria-label={
                      variant.is_active
                        ? he
                          ? "ארכב"
                          : "Archive"
                        : he
                          ? "הפעל"
                          : "Activate"
                    }
                  >
                    {variant.is_active ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">
                  {he ? "ברקוד" : "Barcode"}:
                </span>
                <p className="font-mono">{variant.barcode ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {he ? "מחיר" : "Price"}:
                </span>
                <p className="font-medium">
                  {formatPrice(variant.price_override)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {he ? "עלות" : "Cost"}:
                </span>
                <p className="text-muted-foreground">
                  {formatPrice(variant.cost_override)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {he ? "ספק" : "Supplier"}:
                </span>
                <p>{variant.suppliers?.company_name ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {he ? "מלאי" : "Stock"}:
                </span>
                <p
                  className={
                    variant.stock_qty <= (variant.low_stock_threshold || 0) &&
                    variant.low_stock_threshold > 0
                      ? "text-destructive font-medium"
                      : "font-medium"
                  }
                >
                  {variant.stock_qty}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">
                  {he ? "סף מלאי נמוך" : "Low stock threshold"}:
                </span>
                <p>{variant.low_stock_threshold}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Variant Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="variant-form-title"
        >
          <div className="bg-background rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-border-subtle p-6 flex items-center justify-between">
              <h3 id="variant-form-title" className="text-xl font-black">
                {editingVariant
                  ? he
                    ? "ערוך וריאנט"
                    : "Edit Variant"
                  : he
                    ? "הוסף וריאנט"
                    : "Add Variant"}
              </h3>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                aria-label={he ? "סגור" : "Close"}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitForm();
              }}
              className="p-6 space-y-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "מק״ט (SKU) *" : "SKU *"}
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => handleFormChange("sku", e.target.value)}
                    className="miro-input"
                    required
                    disabled={!!(disabled || saving || editingVariant)}
                    placeholder="UNIQUE-SKU-001"
                    aria-required="true"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {he
                      ? "מזהה ייחודי חובה. לא ניתן לשינוי לאחר יצירה."
                      : "Required unique identifier. Cannot be changed after creation."}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "ברקוד" : "Barcode"}
                  </label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) =>
                      handleFormChange("barcode", e.target.value)
                    }
                    className="miro-input"
                    placeholder="1234567890123"
                    disabled={disabled || saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "צבע (עברית)" : "Color (Hebrew)"}
                  </label>
                  <input
                    type="text"
                    value={formData.color_he}
                    onChange={(e) =>
                      handleFormChange("color_he", e.target.value)
                    }
                    className="miro-input"
                    placeholder={he ? "למשל: שחור" : "e.g., Black"}
                    disabled={disabled || saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "צבע (אנגלית)" : "Color (English)"}
                  </label>
                  <input
                    type="text"
                    value={formData.color_en}
                    onChange={(e) =>
                      handleFormChange("color_en", e.target.value)
                    }
                    className="miro-input"
                    placeholder="e.g., Black"
                    disabled={disabled || saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "קוד צבע Hex" : "Color Hex"}
                  </label>
                  <input
                    type="color"
                    value={formData.color_hex || "#000000"}
                    onChange={(e) =>
                      handleFormChange("color_hex", e.target.value)
                    }
                    className="miro-input h-10 cursor-pointer"
                    disabled={disabled || saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "מחיר מכירה (₪)" : "Sale Price (₪)"}
                  </label>
                  <input
                    type="number"
                    value={formData.price_override}
                    onChange={(e) =>
                      handleFormChange("price_override", e.target.value)
                    }
                    className="miro-input"
                    min="0"
                    step="0.01"
                    placeholder={
                      he
                        ? "משאיר ריק למחיר מוצר"
                        : "Leave empty for product price"
                    }
                    disabled={disabled || saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "עלות רכישה (₪)" : "Purchase Cost (₪)"}
                  </label>
                  <input
                    type="number"
                    value={formData.cost_override}
                    onChange={(e) =>
                      handleFormChange("cost_override", e.target.value)
                    }
                    className="miro-input"
                    min="0"
                    step="0.01"
                    placeholder={
                      he
                        ? "משאיר ריק לעלות מוצר"
                        : "Leave empty for product cost"
                    }
                    disabled={disabled || saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "סף מלאי נמוך" : "Low Stock Threshold"}
                  </label>
                  <input
                    type="number"
                    value={formData.low_stock_threshold}
                    onChange={(e) =>
                      handleFormChange(
                        "low_stock_threshold",
                        Number(e.target.value),
                      )
                    }
                    className="miro-input"
                    min="0"
                    step="1"
                    disabled={disabled || saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "נקודת הזמנה חוזרת" : "Reorder Point"}
                  </label>
                  <input
                    type="number"
                    value={formData.reorder_point}
                    onChange={(e) =>
                      handleFormChange("reorder_point", e.target.value)
                    }
                    className="miro-input"
                    min="0"
                    step="1"
                    placeholder={he ? "אופציונלי" : "Optional"}
                    disabled={disabled || saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "כמות הזמנה חוזרת" : "Reorder Qty"}
                  </label>
                  <input
                    type="number"
                    value={formData.reorder_qty}
                    onChange={(e) =>
                      handleFormChange("reorder_qty", e.target.value)
                    }
                    className="miro-input"
                    min="0"
                    step="1"
                    placeholder={he ? "אופציונלי" : "Optional"}
                    disabled={disabled || saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "מק״ט ספק" : "Supplier SKU"}
                  </label>
                  <input
                    type="text"
                    value={formData.supplier_sku}
                    onChange={(e) =>
                      handleFormChange("supplier_sku", e.target.value)
                    }
                    className="miro-input"
                    placeholder={he ? "מק״ט אצל הספק" : "Supplier's SKU"}
                    disabled={disabled || saving}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {he ? "ספק" : "Supplier"}
                  </label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) =>
                      handleFormChange("supplier_id", e.target.value)
                    }
                    className="miro-input"
                    disabled={disabled || saving}
                  >
                    <option value="">{he ? "ללא ספק" : "No supplier"}</option>
                    {suppliers
                      .filter((s) => s.is_active !== false)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.company_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_default}
                      onChange={(e) =>
                        handleFormChange("is_default", e.target.checked)
                      }
                      className="rounded border-border-subtle"
                      disabled={disabled || saving}
                    />
                    <span>{he ? "וריאנט ברירת מחדל" : "Default variant"}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) =>
                        handleFormChange("is_active", e.target.checked)
                      }
                      className="rounded border-border-subtle"
                      disabled={disabled || saving}
                    />
                    <span>{he ? "פעיל" : "Active"}</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border-subtle pt-6">
                <button
                  type="button"
                  className="miro-button miro-button-secondary"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  {he ? "ביטול" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="miro-button miro-button-primary"
                  disabled={saving || disabled}
                >
                  {saving ? (
                    <>
                      <svg
                        className="mr-2 h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      {he ? "שומר..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      <svg
                        className="mr-2 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {he ? "שמור" : "Save"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
