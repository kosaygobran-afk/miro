"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Dialog, FormField, FormSection, Notice } from "../ui";
import type {
  ManagedOptionalOffer,
  OptionalOfferDraft,
  ProductOptionKind,
  ProductOptionPricingMode,
} from "@/lib/catalog/product-options";
import { optionalOfferCopy as copy, editorCopy, statusLabels } from "./copy";
import type { Locale, Product, ProductStatus, ProductVariant } from "./types";
import styles from "./optional-offers-section.module.css";

export type OptionalOfferEditorRow = {
  key: string;
  id?: string;
  target_product_id: string;
  target_variant_id: string;
  kind: ProductOptionKind;
  label_he: string;
  label_en: string;
  pricing_mode: ProductOptionPricingMode;
  discount_input: string;
  fixed_input: string;
  is_active: boolean;
  target?: ManagedOptionalOffer["target"];
};

export type OptionalOfferEditorError = {
  rowKey: string;
  field: "target" | "pricing" | "label";
  message: string;
};
export type OptionalOfferRowsChange = (
  rows:
    | OptionalOfferEditorRow[]
    | ((current: OptionalOfferEditorRow[]) => OptionalOfferEditorRow[]),
) => void;
const KINDS: ProductOptionKind[] = ["complementary", "accompanying"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchProduct = Pick<
  Product,
  "id" | "name_he" | "name_en" | "slug" | "status"
> & {
  product_variants?: Pick<
    ProductVariant,
    "id" | "sku" | "is_default" | "is_active"
  >[];
};
type PickerProduct = Pick<
  Product,
  "id" | "name_he" | "name_en" | "slug" | "status" | "product_variants"
>;

/** Preserve exact decimal inputs until the final Save; do not use floating totals. */
export function offerInputHundredths(raw: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;
  const result =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

export function optionalOfferRows(
  offers: ManagedOptionalOffer[],
): OptionalOfferEditorRow[] {
  return KINDS.flatMap((kind) =>
    offers
      .filter((offer) => offer.kind === kind)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((offer) => ({
        key: offer.id,
        id: offer.id,
        target_product_id: offer.target_product_id,
        target_variant_id: offer.target_variant_id,
        kind: offer.kind,
        label_he: offer.label_he ?? "",
        label_en: offer.label_en ?? "",
        pricing_mode: offer.pricing_mode,
        discount_input:
          offer.discount_bps === null ? "" : String(offer.discount_bps / 100),
        fixed_input:
          offer.fixed_price_agorot === null
            ? ""
            : `${Math.trunc(offer.fixed_price_agorot / 100)}.${String(offer.fixed_price_agorot % 100).padStart(2, "0")}`,
        is_active: offer.is_active,
        target: offer.target,
      })),
  );
}

export function optionalOfferRowsToDrafts(
  rows: OptionalOfferEditorRow[],
  parentId: string,
  locale: Locale,
):
  | { ok: true; offers: OptionalOfferDraft[] }
  | { ok: false; error: OptionalOfferEditorError } {
  const seen = new Set<string>();
  const positions: Record<ProductOptionKind, number> = {
    complementary: 0,
    accompanying: 0,
  };
  const offers: OptionalOfferDraft[] = [];
  for (const row of rows) {
    const fail = (
      field: OptionalOfferEditorError["field"],
      message: string,
    ) => ({ ok: false as const, error: { rowKey: row.key, field, message } });
    if (!UUID.test(row.target_product_id) || !UUID.test(row.target_variant_id))
      return fail("target", copy.chooseFirst[locale]);
    if (row.target_product_id.toLowerCase() === parentId.toLowerCase())
      return fail("target", copy.self[locale]);
    const variantId = row.target_variant_id.toLowerCase();
    if (seen.has(variantId)) return fail("target", copy.duplicate[locale]);
    seen.add(variantId);
    if (row.label_he.trim().length > 160 || row.label_en.trim().length > 160)
      return fail("label", copy.labelLong[locale]);
    const discount =
      row.pricing_mode === "percent"
        ? offerInputHundredths(row.discount_input)
        : null;
    const fixed =
      row.pricing_mode === "fixed"
        ? offerInputHundredths(row.fixed_input)
        : null;
    if (
      row.pricing_mode === "percent" &&
      (discount === null || discount < 1 || discount > 9500)
    )
      return fail("pricing", copy.invalidDiscount[locale]);
    if (
      row.pricing_mode === "fixed" &&
      (fixed === null || fixed <= 0 || fixed > 100_000_000)
    )
      return fail("pricing", copy.invalidFixed[locale]);
    offers.push({
      ...(row.id ? { id: row.id } : {}),
      target_product_id: row.target_product_id,
      target_variant_id: row.target_variant_id,
      kind: row.kind,
      label_he: row.label_he.trim() || null,
      label_en: row.label_en.trim() || null,
      pricing_mode: row.pricing_mode,
      discount_bps: discount,
      fixed_price_agorot: fixed,
      is_active: row.is_active,
      sort_order: positions[row.kind]++,
    });
  }
  return { ok: true, offers };
}

export function OptionalOffersSection({
  locale,
  productId,
  rows,
  onChange,
  disabled = false,
  error,
  reviewRequired = false,
  reviewMessage,
  onReload,
}: {
  locale: Locale;
  productId: string;
  rows: OptionalOfferEditorRow[];
  onChange: OptionalOfferRowsChange;
  disabled?: boolean;
  error?: OptionalOfferEditorError | null;
  reviewRequired?: boolean;
  reviewMessage?: string;
  onReload: () => void;
}) {
  const he = locale === "he";
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [pickerError, setPickerError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PickerProduct | null>(
    null,
  );
  const [selectedVariant, setSelectedVariant] = useState("");
  const selectionController = useRef<AbortController | null>(null);
  const rowNodes = useRef(new Map<string, HTMLElement>());
  const addButtons = useRef(new Map<ProductOptionKind, HTMLButtonElement>());

  useEffect(() => {
    if (!pickerKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(
          `/api/management/products?view=summary&q=${encodeURIComponent(query.trim())}&status=all&limit=20`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as { products?: SearchProduct[] };
        if (!controller.signal.aborted)
          setResults(
            (data.products ?? []).filter((product) => product.id !== productId),
          );
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchError(copy.loadFailed[locale]);
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pickerKey, query, retry, productId, locale]);

  useEffect(() => () => selectionController.current?.abort(), []);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() =>
      rowNodes.current.get(error.rowKey)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [error]);

  function updateRow(key: string, patch: Partial<OptionalOfferEditorRow>) {
    onChange((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }
  function closePicker() {
    selectionController.current?.abort();
    setPickerKey(null);
    setSelectedProduct(null);
    setSelectedVariant("");
    setSelectionLoading(false);
    setPickerError("");
  }
  function openPicker(key: string) {
    selectionController.current?.abort();
    setQuery("");
    setResults([]);
    setSearchError("");
    setPickerError("");
    setSelectedProduct(null);
    setSelectedVariant("");
    setSelectionLoading(false);
    setPickerKey(key);
  }
  function addRow(kind: ProductOptionKind) {
    const key = crypto.randomUUID();
    onChange((current) => [
      ...current,
      {
        key,
        target_product_id: "",
        target_variant_id: "",
        kind,
        label_he: "",
        label_en: "",
        pricing_mode: "catalog",
        discount_input: "",
        fixed_input: "",
        is_active: true,
      },
    ]);
    openPicker(key);
  }
  function moveRow(key: string, direction: -1 | 1) {
    onChange((current) =>
      KINDS.flatMap((kind) => {
        const group = current.filter((row) => row.kind === kind);
        const index = group.findIndex((row) => row.key === key);
        const next = index + direction;
        if (index >= 0 && next >= 0 && next < group.length)
          [group[index], group[next]] = [group[next], group[index]];
        return group;
      }),
    );
  }
  function removeRow(key: string, kind: ProductOptionKind) {
    const group = rows.filter((row) => row.kind === kind);
    const index = group.findIndex((row) => row.key === key);
    const nextKey = group[index + 1]?.key ?? group[index - 1]?.key;
    onChange((current) => current.filter((row) => row.key !== key));
    requestAnimationFrame(() => {
      if (nextKey) rowNodes.current.get(nextKey)?.focus();
      else addButtons.current.get(kind)?.focus();
    });
  }

  function applySelection(product: PickerProduct, variant: ProductVariant) {
    if (!pickerKey) return;
    if (product.id === productId) {
      setPickerError(copy.self[locale]);
      return;
    }
    if (
      rows.some(
        (row) => row.key !== pickerKey && row.target_variant_id === variant.id,
      )
    ) {
      setPickerError(copy.duplicate[locale]);
      return;
    }
    updateRow(pickerKey, {
      target_product_id: product.id,
      target_variant_id: variant.id,
      target: {
        name_he: product.name_he,
        name_en: product.name_en,
        slug: product.slug,
        status: product.status,
        sku: variant.sku,
      },
    });
    closePicker();
  }
  async function chooseProduct(productIdToLoad: string) {
    selectionController.current?.abort();
    const controller = new AbortController();
    selectionController.current = controller;
    setSelectionLoading(true);
    setPickerError("");
    setSelectedProduct(null);
    setSelectedVariant("");
    try {
      const response = await fetch(
        `/api/management/products/${productIdToLoad}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) throw new Error("unavailable");
      const data = (await response.json()) as { product?: PickerProduct };
      if (controller.signal.aborted) return;
      const product = data.product;
      if (!product || product.id === productId) throw new Error("unavailable");
      const variants = (product.product_variants ?? []).filter(
        (variant) => variant.is_active,
      );
      if (variants.length === 0) {
        setPickerError(copy.noVariants[locale]);
        return;
      }
      if (variants.length === 1) applySelection(product, variants[0]);
      else setSelectedProduct({ ...product, product_variants: variants });
    } catch {
      if (!controller.signal.aborted) setPickerError(copy.loadFailed[locale]);
    } finally {
      if (!controller.signal.aborted) setSelectionLoading(false);
    }
  }

  return (
    <div className={styles.stack} data-optional-offers-editor="true">
      <Notice tone="info">{copy.rule[locale]}</Notice>
      {reviewRequired ? (
        <Notice tone="warning">
          <div className={styles.review}>
            <p>{reviewMessage ?? copy.conflict[locale]}</p>
            <button
              type="button"
              className="mgmt-button mgmt-button--secondary"
              onClick={onReload}
              disabled={disabled}
            >
              {copy.reload[locale]}
            </button>
          </div>
        </Notice>
      ) : null}
      {KINDS.map((kind) => {
        const group = rows.filter((row) => row.kind === kind);
        return (
          <FormSection
            key={kind}
            title={copy[kind][locale]}
            description={
              copy[
                kind === "complementary"
                  ? "complementaryDescription"
                  : "accompanyingDescription"
              ][locale]
            }
            actions={
              <button
                type="button"
                className="mgmt-button mgmt-button--secondary"
                onClick={() => addRow(kind)}
                ref={(node) => {
                  if (node) addButtons.current.set(kind, node);
                  else addButtons.current.delete(kind);
                }}
                disabled={disabled}
              >
                <Plus size={16} aria-hidden="true" />
                {copy.add[locale]}
              </button>
            }
          >
            {group.length === 0 ? (
              <p className={styles.empty}>{copy.empty[locale]}</p>
            ) : (
              <ol className={styles.rows}>
                {group.map((row, index) => {
                  const name = row.target
                    ? he
                      ? row.target.name_he
                      : row.target.name_en
                    : copy.unnamed[locale];
                  const rowError = error?.rowKey === row.key ? error : null;
                  const fieldPrefix = `optional-offer-${row.key}`;
                  const actionName = row.target
                    ? `${name}, ${row.target.sku}`
                    : name;
                  return (
                    <li
                      key={row.key}
                      className={styles.row}
                      ref={(node) => {
                        if (node) rowNodes.current.set(row.key, node);
                        else rowNodes.current.delete(row.key);
                      }}
                      tabIndex={-1}
                      data-offer-kind={kind}
                      data-offer-row={row.key}
                    >
                      <div className={styles.rowHeading}>
                        <div className={styles.identity}>
                          <span className={styles.number} aria-hidden="true">
                            {index + 1}
                          </span>
                          <div>
                            <h3 dir="auto">{name}</h3>
                            {row.target ? (
                              <p className={styles.context}>
                                <bdi dir="ltr">{row.target.sku}</bdi>
                                <span>
                                  {statusLabels[
                                    row.target.status as ProductStatus
                                  ]?.[locale] ?? row.target.status}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => moveRow(row.key, -1)}
                            disabled={disabled || index === 0}
                            aria-label={`${copy.up[locale]}: ${actionName}`}
                          >
                            <ArrowUp size={17} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => moveRow(row.key, 1)}
                            disabled={disabled || index === group.length - 1}
                            aria-label={`${copy.down[locale]}: ${actionName}`}
                          >
                            <ArrowDown size={17} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => removeRow(row.key, kind)}
                            disabled={disabled}
                            aria-label={`${copy.remove[locale]}: ${actionName}`}
                          >
                            <Trash2 size={17} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.chooseButton}
                        onClick={() => openPicker(row.key)}
                        aria-label={`${row.target_product_id ? copy.change[locale] : copy.choose[locale]}: ${actionName}`}
                        disabled={disabled}
                        aria-invalid={rowError?.field === "target" || undefined}
                      >
                        <Package size={18} aria-hidden="true" />
                        {row.target_product_id
                          ? copy.change[locale]
                          : copy.choose[locale]}
                      </button>
                      {rowError?.field === "target" ? (
                        <p className={styles.error} role="alert">
                          {rowError.message}
                        </p>
                      ) : null}
                      <div className={styles.fields}>
                        <FormField
                          id={`${fieldPrefix}-label-he`}
                          label={copy.labelHe[locale]}
                          disabled={disabled}
                          description={copy.labelHint[locale]}
                          error={
                            rowError?.field === "label"
                              ? rowError.message
                              : undefined
                          }
                        >
                          {(control) => (
                            <input
                              {...control}
                              className="miro-input"
                              dir="rtl"
                              value={row.label_he}
                              maxLength={160}
                              onChange={(event) =>
                                updateRow(row.key, {
                                  label_he: event.target.value,
                                })
                              }
                            />
                          )}
                        </FormField>
                        <FormField
                          id={`${fieldPrefix}-label-en`}
                          label={copy.labelEn[locale]}
                          disabled={disabled}
                        >
                          {(control) => (
                            <input
                              {...control}
                              className="miro-input"
                              dir="ltr"
                              value={row.label_en}
                              maxLength={160}
                              onChange={(event) =>
                                updateRow(row.key, {
                                  label_en: event.target.value,
                                })
                              }
                            />
                          )}
                        </FormField>
                        <FormField
                          id={`${fieldPrefix}-mode`}
                          label={copy.pricing[locale]}
                          disabled={disabled}
                        >
                          {(control) => (
                            <select
                              {...control}
                              className="miro-input"
                              value={row.pricing_mode}
                              onChange={(event) =>
                                updateRow(row.key, {
                                  pricing_mode: event.target
                                    .value as ProductOptionPricingMode,
                                })
                              }
                            >
                              <option value="catalog">
                                {copy.catalog[locale]}
                              </option>
                              <option value="percent">
                                {copy.percent[locale]}
                              </option>
                              <option value="fixed">
                                {copy.fixed[locale]}
                              </option>
                            </select>
                          )}
                        </FormField>
                        {row.pricing_mode === "percent" ? (
                          <FormField
                            id={`${fieldPrefix}-discount`}
                            label={copy.discount[locale]}
                            disabled={disabled}
                            required
                            description={copy.discountHint[locale]}
                            error={
                              rowError?.field === "pricing"
                                ? rowError.message
                                : undefined
                            }
                          >
                            {(control) => (
                              <input
                                {...control}
                                className="miro-input"
                                dir="ltr"
                                inputMode="decimal"
                                value={row.discount_input}
                                maxLength={8}
                                placeholder="10.00"
                                onChange={(event) =>
                                  updateRow(row.key, {
                                    discount_input: event.target.value,
                                  })
                                }
                              />
                            )}
                          </FormField>
                        ) : row.pricing_mode === "fixed" ? (
                          <FormField
                            id={`${fieldPrefix}-fixed`}
                            label={copy.fixedAmount[locale]}
                            disabled={disabled}
                            required
                            description={copy.fixedHint[locale]}
                            error={
                              rowError?.field === "pricing"
                                ? rowError.message
                                : undefined
                            }
                          >
                            {(control) => (
                              <input
                                {...control}
                                className="miro-input"
                                dir="ltr"
                                inputMode="decimal"
                                value={row.fixed_input}
                                maxLength={18}
                                placeholder="49.90"
                                onChange={(event) =>
                                  updateRow(row.key, {
                                    fixed_input: event.target.value,
                                  })
                                }
                              />
                            )}
                          </FormField>
                        ) : null}
                      </div>
                      <label
                        className={styles.active}
                        htmlFor={`${fieldPrefix}-active`}
                      >
                        <input
                          id={`${fieldPrefix}-active`}
                          type="checkbox"
                          checked={row.is_active}
                          disabled={disabled}
                          onChange={(event) =>
                            updateRow(row.key, {
                              is_active: event.target.checked,
                            })
                          }
                        />
                        <span>{copy.active[locale]}</span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            )}
          </FormSection>
        );
      })}
      <Dialog
        open={pickerKey !== null}
        onClose={closePicker}
        title={copy.searchTitle[locale]}
        description={copy.searchDescription[locale]}
        closeLabel={editorCopy.close[locale]}
        size="lg"
        footer={
          <div className={styles.dialogActions}>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={closePicker}
            >
              {editorCopy.cancel[locale]}
            </button>
            {selectedProduct ? (
              <button
                type="button"
                className="mgmt-button mgmt-button--primary"
                disabled={!selectedVariant || selectionLoading}
                onClick={() => {
                  const variant = selectedProduct.product_variants.find(
                    (entry) => entry.id === selectedVariant,
                  );
                  if (variant) applySelection(selectedProduct, variant);
                }}
              >
                {copy.useVariant[locale]}
              </button>
            ) : null}
          </div>
        }
      >
        <div className={styles.stack}>
          <FormField
            id="optional-offers-product-search"
            label={copy.search[locale]}
          >
            {(control) => (
              <div className={styles.search}>
                <Search size={17} aria-hidden="true" />
                <input
                  {...control}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    selectionController.current?.abort();
                    setSelectedProduct(null);
                    setSelectedVariant("");
                    setPickerError("");
                    setSelectionLoading(false);
                    setQuery(event.target.value);
                  }}
                  maxLength={200}
                  autoComplete="off"
                  className="miro-input"
                />
              </div>
            )}
          </FormField>
          {pickerError ? <Notice tone="danger">{pickerError}</Notice> : null}
          {selectionLoading ? (
            <p className={styles.loading} role="status">
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
              {copy.loadingVariants[locale]}
            </p>
          ) : null}
          {selectedProduct ? (
            <div className={styles.variantPanel}>
              <h3 dir="auto">
                {he ? selectedProduct.name_he : selectedProduct.name_en}
              </h3>
              <FormField
                id="optional-offers-variant"
                label={copy.variant[locale]}
                required
              >
                {(control) => (
                  <select
                    {...control}
                    className="miro-input"
                    value={selectedVariant}
                    onChange={(event) => setSelectedVariant(event.target.value)}
                  >
                    <option value="">{copy.selectVariant[locale]}</option>
                    {selectedProduct.product_variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.sku}
                        {variant.color_he || variant.color_en
                          ? ` · ${he ? variant.color_he || variant.color_en : variant.color_en || variant.color_he}`
                          : ""}{" "}
                        · {variant.stock_qty} {copy.stock[locale]}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>
          ) : null}
          {searchError ? (
            <Notice tone="danger">
              <div className={styles.review}>
                <p>{searchError}</p>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--secondary"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  {editorCopy.retry[locale]}
                </button>
              </div>
            </Notice>
          ) : searchLoading ? (
            <p className={styles.loading} role="status">
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
              {copy.searching[locale]}
            </p>
          ) : results.length === 0 ? (
            <p className={styles.empty} role="status">
              {copy.noResults[locale]}
            </p>
          ) : (
            <ul className={styles.results}>
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className={styles.resultButton}
                    disabled={selectionLoading}
                    onClick={() => void chooseProduct(product.id)}
                  >
                    <Package size={20} aria-hidden="true" />
                    <span>
                      <strong dir="auto">
                        {he ? product.name_he : product.name_en}
                      </strong>
                      <small>
                        <bdi dir="ltr">
                          {product.product_variants?.find(
                            (variant) => variant.is_default,
                          )?.sku ??
                            product.product_variants?.[0]?.sku ??
                            product.slug}
                        </bdi>
                        <span>
                          {statusLabels[product.status]?.[locale] ??
                            product.status}
                        </span>
                      </small>
                    </span>
                    <Plus size={17} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
}
