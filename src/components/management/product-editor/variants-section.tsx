"use client";

import { useEffect, useState } from "react";
import { Archive, Package, Pencil, Plus } from "lucide-react";
import {
  ConfirmationDialog,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Notice,
  StatusBadge,
} from "../ui";
import { editorCopy, validationCopy, variantCopy } from "./copy";
import type { Locale, ProductVariant, Supplier } from "./types";
import styles from "./product-editor.module.css";

type VariantForm = {
  sku: string;
  barcode: string;
  color_he: string;
  color_en: string;
  color_hex: string;
  price_override: string;
  cost_override: string;
  supplier_id: string;
  supplier_sku: string;
  low_stock_threshold: string;
  is_active: boolean;
  is_default: boolean;
};

const emptyVariantForm: VariantForm = {
  sku: "",
  barcode: "",
  color_he: "",
  color_en: "",
  color_hex: "",
  price_override: "",
  cost_override: "",
  supplier_id: "",
  supplier_sku: "",
  low_stock_threshold: "0",
  is_active: true,
  is_default: false,
};

function toVariantForm(variant: ProductVariant): VariantForm {
  return {
    sku: variant.sku,
    barcode: variant.barcode ?? "",
    color_he: variant.color_he ?? "",
    color_en: variant.color_en ?? "",
    color_hex: variant.color_hex ?? "",
    price_override: variant.price_override?.toString() ?? "",
    cost_override: variant.cost_override?.toString() ?? "",
    supplier_id: variant.supplier_id ?? "",
    supplier_sku: variant.supplier_sku ?? "",
    low_stock_threshold: String(variant.low_stock_threshold ?? 0),
    is_active: variant.is_active,
    is_default: variant.is_default,
  };
}

function stockStatus(variant: ProductVariant): {
  status: "out_of_stock" | "low_stock" | "in_stock";
  label: keyof typeof variantCopy;
} {
  if (variant.stock_qty <= 0)
    return { status: "out_of_stock", label: "outOfStock" };
  if (
    variant.low_stock_threshold > 0 &&
    variant.stock_qty <= variant.low_stock_threshold
  ) {
    return { status: "low_stock", label: "lowStock" };
  }
  return { status: "in_stock", label: "inStock" };
}

export function VariantsSection({
  locale,
  productId,
  suppliers,
  variants,
  onVariantsChange,
}: {
  locale: Locale;
  productId: string;
  suppliers: Supplier[];
  variants: ProductVariant[];
  onVariantsChange: (variants: ProductVariant[]) => void;
}) {
  const he = locale === "he";
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductVariant | null>(null);
  const [form, setForm] = useState<VariantForm>(emptyVariantForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof VariantForm, string>>
  >({});
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProductVariant | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function reload() {
      try {
        const response = await fetch(
          `/api/management/variants?productId=${productId}`,
          { cache: "no-store" },
        );
        if (ignore) return;
        if (response.ok) {
          const data = (await response.json()) as {
            variants?: ProductVariant[];
          };
          if (!ignore) onVariantsChange(data.variants ?? []);
        } else {
          setNotice(variantCopy.operationFailed[locale]);
        }
      } catch {
        if (!ignore) setNotice(variantCopy.operationFailed[locale]);
      }
    }
    void reload();
    return () => {
      ignore = true;
    };
  }, [productId, onVariantsChange, locale, reloadToken]);

  function setField<K extends keyof VariantForm>(
    key: K,
    value: VariantForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyVariantForm);
    setFieldErrors({});
    setDialogError("");
    setDialogOpen(true);
  }

  function openEdit(variant: ProductVariant) {
    setEditing(variant);
    setForm(toVariantForm(variant));
    setFieldErrors({});
    setDialogError("");
    setDialogOpen(true);
  }

  async function saveVariant() {
    if (saving) return;
    const errors: Partial<Record<keyof VariantForm, string>> = {};
    if (!form.sku.trim()) {
      errors.sku = variantCopy.skuRequired[locale];
    }
    let priceOverride: number | null = null;
    if (form.price_override.trim() !== "") {
      const parsed = Number(form.price_override);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errors.price_override = variantCopy.priceMustBePositive[locale];
      } else {
        priceOverride = parsed;
      }
    }
    let costOverride: number | null = null;
    if (form.cost_override.trim() !== "") {
      const parsed = Number(form.cost_override);
      if (!Number.isFinite(parsed) || parsed < 0) {
        errors.cost_override = validationCopy.invalidNumber[locale];
      } else {
        costOverride = parsed;
      }
    }
    let threshold = 0;
    if (form.low_stock_threshold.trim() !== "") {
      const parsed = Number(form.low_stock_threshold);
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.low_stock_threshold = validationCopy.invalidNumber[locale];
      } else {
        threshold = parsed;
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setDialogError("");
    try {
      const basePayload = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        color_he: form.color_he.trim() || null,
        color_en: form.color_en.trim() || null,
        color_hex: form.color_hex || null,
        price_override: priceOverride,
        cost_override: costOverride,
        supplier_id: form.supplier_id || null,
        supplier_sku: form.supplier_sku.trim() || null,
        is_active: form.is_active,
        low_stock_threshold: threshold,
      };

      let response: Response;
      if (editing) {
        // Keep the payload inside the update_variant RPC whitelist: the
        // strict route rejects unknown keys with 400. is_default flips are
        // only ever set to true here (defaults move forward, never off).
        response = await fetch("/api/management/variants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            product_id: productId,
            ...basePayload,
            ...(form.is_default && !editing.is_default
              ? { is_default: true }
              : {}),
          }),
        });
      } else {
        response = await fetch("/api/management/variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            ...basePayload,
            is_default: form.is_default,
          }),
        });
      }

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (err.error === "duplicate_sku") {
          setFieldErrors({ sku: variantCopy.duplicateSku[locale] });
          return;
        }
        if (err.error === "duplicate_barcode") {
          setFieldErrors({ barcode: variantCopy.duplicateBarcode[locale] });
          return;
        }
        setDialogError(err.error || variantCopy.operationFailed[locale]);
        return;
      }

      setDialogOpen(false);
      setReloadToken((token) => token + 1);
    } catch {
      setDialogError(variantCopy.operationFailed[locale]);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/management/variants?id=${pendingDelete.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setNotice(err.error || variantCopy.operationFailed[locale]);
        return;
      }
      setPendingDelete(null);
      setReloadToken((token) => token + 1);
    } catch {
      setNotice(variantCopy.operationFailed[locale]);
    } finally {
      setDeleting(false);
    }
  }

  const formattedPrice = (value: number | null) =>
    value === null || value === undefined
      ? "—"
      : new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
          style: "currency",
          currency: "ILS",
          maximumFractionDigits: 2,
        }).format(value);

  return (
    <div className={styles.sectionStack}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {variantCopy.emptyDescription[locale]}
        </p>
        <button
          type="button"
          className="miro-button miro-button-primary"
          onClick={openCreate}
        >
          <Plus className="me-2 h-4 w-4" aria-hidden="true" />
          {variantCopy.addVariant[locale]}
        </button>
      </div>

      {notice ? (
        <Notice
          tone="danger"
          onDismiss={() => setNotice("")}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {notice}
        </Notice>
      ) : null}

      <DataTable
        caption={variantCopy.tableCaption[locale]}
        isEmpty={variants.length === 0}
        emptyState={
          <EmptyState
            icon={<Package size={20} />}
            title={variantCopy.empty[locale]}
            description={variantCopy.emptyDescription[locale]}
            compact
          />
        }
        minWidth="48rem"
        head={
          <tr>
            <th scope="col">SKU</th>
            <th scope="col">{variantCopy.barcode[locale]}</th>
            <th scope="col">{he ? "צבע" : "Color"}</th>
            <th scope="col">{variantCopy.priceOverride[locale]}</th>
            <th scope="col">{variantCopy.stock[locale]}</th>
            <th scope="col">{he ? "מצב" : "State"}</th>
            <th scope="col">{variantCopy.isDefault[locale]}</th>
            <th scope="col">{he ? "פעולות" : "Actions"}</th>
          </tr>
        }
      >
        {variants.map((variant) => {
          const stock = stockStatus(variant);
          return (
            <tr key={variant.id}>
              <td>
                <span className="font-mono text-sm" dir="ltr">
                  {variant.sku}
                </span>
              </td>
              <td>
                <span className="font-mono text-sm" dir="ltr">
                  {variant.barcode ?? "—"}
                </span>
              </td>
              <td>
                <span className="inline-flex items-center gap-2">
                  {variant.color_hex ? (
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-border-subtle"
                      style={{ backgroundColor: variant.color_hex }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span dir="auto">
                    {he
                      ? (variant.color_he ?? variant.color_en ?? "—")
                      : (variant.color_en ?? variant.color_he ?? "—")}
                  </span>
                </span>
              </td>
              <td dir="ltr" className="text-start">
                {formattedPrice(variant.price_override)}
              </td>
              <td>{variant.stock_qty}</td>
              <td>
                <span className="inline-flex items-center gap-1">
                  <StatusBadge
                    status={variant.is_active ? "active" : "archived"}
                    size="sm"
                  >
                    {variant.is_active
                      ? variantCopy.activeBadge[locale]
                      : variantCopy.inactiveBadge[locale]}
                  </StatusBadge>
                  <StatusBadge status={stock.status} size="sm" withDot={false}>
                    {variantCopy[stock.label][locale]}
                  </StatusBadge>
                </span>
              </td>
              <td>
                {variant.is_default ? (
                  <StatusBadge
                    status="active"
                    tone="accent"
                    size="sm"
                    withDot={false}
                  >
                    {variantCopy.defaultBadge[locale]}
                  </StatusBadge>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => openEdit(variant)}
                    aria-label={variantCopy.editVariant[locale]}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {variant.is_active ? (
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => setPendingDelete(variant)}
                      aria-label={variantCopy.deleteVariant[locale]}
                    >
                      <Archive className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          if (!saving) setDialogOpen(false);
        }}
        title={
          editing
            ? variantCopy.editVariant[locale]
            : variantCopy.newVariant[locale]
        }
        size="lg"
        closeLabel={editorCopy.close[locale]}
        footer={
          <>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {editorCopy.cancel[locale]}
            </button>
            <button
              type="button"
              className="miro-button miro-button-primary"
              onClick={() => void saveVariant()}
              disabled={saving}
              aria-busy={saving || undefined}
            >
              {saving
                ? editorCopy.saving[locale]
                : variantCopy.saveVariant[locale]}
            </button>
          </>
        }
      >
        <div className={styles.sectionStack}>
          {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
          <div className={styles.fieldGrid}>
            <FormField
              id="variant-sku"
              label={variantCopy.sku[locale]}
              required
              error={fieldErrors.sku}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={form.sku}
                  maxLength={100}
                  onChange={(e) => setField("sku", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-barcode"
              label={variantCopy.barcode[locale]}
              error={fieldErrors.barcode}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={form.barcode}
                  maxLength={100}
                  onChange={(e) => setField("barcode", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-color-he"
              label={variantCopy.colorHe[locale]}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="rtl"
                  value={form.color_he}
                  maxLength={100}
                  onChange={(e) => setField("color_he", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-color-en"
              label={variantCopy.colorEn[locale]}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={form.color_en}
                  maxLength={100}
                  onChange={(e) => setField("color_en", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-color-hex"
              label={variantCopy.colorHex[locale]}
            >
              {(control) => (
                <input
                  {...control}
                  type="color"
                  className="miro-input h-10 cursor-pointer"
                  dir="ltr"
                  value={form.color_hex || "#000000"}
                  onChange={(e) => setField("color_hex", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-supplier"
              label={variantCopy.supplier[locale]}
            >
              {(control) => (
                <select
                  {...control}
                  className="miro-input"
                  value={form.supplier_id}
                  onChange={(e) => setField("supplier_id", e.target.value)}
                  disabled={saving}
                >
                  <option value="">{variantCopy.noSupplier[locale]}</option>
                  {suppliers
                    .filter((s) => s.is_active !== false)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.company_name}
                      </option>
                    ))}
                </select>
              )}
            </FormField>
            <FormField
              id="variant-supplier-sku"
              label={variantCopy.supplierSku[locale]}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={form.supplier_sku}
                  maxLength={100}
                  onChange={(e) => setField("supplier_sku", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-price-override"
              label={variantCopy.priceOverride[locale]}
              description={variantCopy.priceOverrideDescription[locale]}
              error={fieldErrors.price_override}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  className={`miro-input ${styles.numberInput}`}
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.price_override}
                  onChange={(e) => setField("price_override", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-cost-override"
              label={variantCopy.costOverride[locale]}
              error={fieldErrors.cost_override}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  className={`miro-input ${styles.numberInput}`}
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.cost_override}
                  onChange={(e) => setField("cost_override", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="variant-low-stock"
              label={variantCopy.lowStockThreshold[locale]}
              error={fieldErrors.low_stock_threshold}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  className={`miro-input ${styles.numberInput}`}
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={form.low_stock_threshold}
                  onChange={(e) =>
                    setField("low_stock_threshold", e.target.value)
                  }
                  disabled={saving}
                />
              )}
            </FormField>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className={styles.checkboxRow}>
              <input
                id="variant-is-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
                disabled={saving}
              />
              <label
                htmlFor="variant-is-active"
                className="text-sm font-medium"
              >
                {variantCopy.isActive[locale]}
              </label>
            </div>
            <div className={styles.checkboxRow}>
              <input
                id="variant-is-default"
                type="radio"
                name="variant-default"
                checked={form.is_default}
                onChange={() => setField("is_default", true)}
                disabled={saving}
              />
              <label
                htmlFor="variant-is-default"
                className="text-sm font-medium"
              >
                {variantCopy.isDefault[locale]}
              </label>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title={variantCopy.deleteVariantTitle[locale]}
        description={variantCopy.deleteVariantDescription[locale]}
        confirmLabel={variantCopy.deleteVariant[locale]}
        cancelLabel={editorCopy.cancel[locale]}
        tone="danger"
        busy={deleting}
        closeLabel={editorCopy.close[locale]}
      />
    </div>
  );
}
