"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  FormSection,
  Notice,
  PageHeader,
} from "@/components/management/ui";
import { salesCopy as copy } from "./sales-copy";
import { SalesHistoryView } from "./sales-history-view";
import {
  computeLine,
  formatIls,
  type CatalogProduct,
  type CatalogVariant,
  type CustomerAccount,
  type SaleLine,
  type SaleOrder,
} from "./sales-types";
import styles from "./sales.module.css";
import { ReportChoices } from "./ui/reporting-workspace";

const MAX_LINES = 10;

function newLine(key: string): SaleLine {
  return {
    key,
    variantId: "",
    quantity: 1,
    unitPrice: 0,
    discountPerUnit: 0,
    product: null,
    variant: null,
  };
}

/* ---------- Searchable customer account picker ---------- */

function CustomerSearch({
  locale,
  selected,
  onSelect,
  onClear,
}: {
  locale: "he" | "en";
  selected: CustomerAccount | null;
  onSelect: (account: CustomerAccount) => void;
  onClear: () => void;
}) {
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CustomerAccount[]>([]);
  const [fetching, setFetching] = useState(false);
  const cacheRef = useRef(new Map<string, CustomerAccount[]>());

  useEffect(() => {
    if (selected) return;
    const handle = setTimeout(() => {
      const term = input.trim();
      const cached = cacheRef.current.get(term);
      if (cached) {
        setOptions(cached);
        return;
      }
      setFetching(true);
      fetch(
        `/api/management/customers?q=${encodeURIComponent(term)}&limit=10&activeOnly=true`,
        { cache: "no-store" },
      )
        .then((res) => (res.ok ? res.json() : { customers: [] }))
        .then((data) => {
          const list = Array.isArray(data.customers)
            ? (data.customers as CustomerAccount[])
            : [];
          cacheRef.current.set(term, list);
          setOptions(list);
          setFetching(false);
        })
        .catch(() => setFetching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [input, selected]);

  if (selected) {
    return (
      <span className={styles.selectionPill}>
        <span dir="auto">
          {selected.full_name || selected.email}
          {selected.full_name ? ` · ${selected.email}` : ""}
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label={t(copy.accountClear)}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <div
      className={styles.combo}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <input
        id="sale-customer-search"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="sale-customer-options"
        aria-label={t(copy.accountSearchLabel)}
        autoComplete="off"
        className={`${styles.input} ${styles.comboInput}`}
        value={input}
        placeholder={t(copy.accountSearchPlaceholder)}
        onChange={(event) => {
          setInput(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <ul
          className={styles.comboList}
          role="listbox"
          id="sale-customer-options"
          aria-label={t(copy.accountSearchLabel)}
        >
          {fetching ? (
            <li className={styles.comboStatus}>{t(copy.accountLoading)}</li>
          ) : options.length === 0 ? (
            <li className={styles.comboStatus}>{t(copy.accountNoResults)}</li>
          ) : (
            options.map((account) => (
              <li key={account.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={styles.comboOption}
                  onClick={() => {
                    onSelect(account);
                    setInput("");
                    setOpen(false);
                  }}
                >
                  <span dir="auto">
                    {account.full_name
                      ? `${account.full_name} — ${account.email}`
                      : account.email}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- Searchable product/variant picker (per line) ---------- */

function VariantSearch({
  locale,
  inputId,
  disabled,
  onPick,
}: {
  locale: "he" | "en";
  inputId: string;
  disabled: boolean;
  onPick: (product: CatalogProduct, variant: CatalogVariant) => void;
}) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<
    { product: CatalogProduct; variant: CatalogVariant }[]
  >([]);
  const [fetching, setFetching] = useState(false);
  const cacheRef = useRef(
    new Map<string, { product: CatalogProduct; variant: CatalogVariant }[]>(),
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      const term = input.trim();
      const cached = cacheRef.current.get(term);
      if (cached) {
        setOptions(cached);
        return;
      }
      setFetching(true);
      fetch(`/api/management/products?q=${encodeURIComponent(term)}&limit=20`, {
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : { products: [] }))
        .then((data) => {
          const needle = term.toLowerCase();
          const products = Array.isArray(data.products)
            ? (data.products as CatalogProduct[])
            : [];
          const flattened = products
            .filter((product) => product.status === "active")
            .flatMap((product) =>
              (product.product_variants ?? [])
                .filter((variant) => variant.is_active)
                .filter((variant) => {
                  if (!needle) return true;
                  const haystack = `${product.name_he} ${product.name_en} ${
                    variant.sku
                  } ${variant.barcode ?? ""}`.toLowerCase();
                  return haystack.includes(needle);
                })
                .map((variant) => ({ product, variant })),
            )
            .slice(0, 20);
          cacheRef.current.set(term, flattened);
          setOptions(flattened);
          setFetching(false);
        })
        .catch(() => setFetching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [input]);

  return (
    <div
      className={styles.combo}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${inputId}-options`}
        autoComplete="off"
        disabled={disabled}
        className={`${styles.input} ${styles.comboInput}`}
        value={input}
        placeholder={t(copy.productSearchPlaceholder)}
        onChange={(event) => {
          setInput(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && !disabled ? (
        <ul
          className={styles.comboList}
          role="listbox"
          id={`${inputId}-options`}
          aria-label={t(copy.productSearchLabel)}
        >
          {fetching ? (
            <li className={styles.comboStatus}>{t(copy.productLoading)}</li>
          ) : options.length === 0 ? (
            <li className={styles.comboStatus}>{t(copy.productNoResults)}</li>
          ) : (
            options.map(({ product, variant }) => {
              const name = he ? product.name_he : product.name_en;
              const color = he ? variant.color_he : variant.color_en;
              return (
                <li key={variant.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className={styles.comboOption}
                    onClick={() => {
                      onPick(product, variant);
                      setInput("");
                      setOpen(false);
                    }}
                  >
                    <span dir="auto">
                      {name}
                      {color ? ` · ${color}` : ""}
                    </span>{" "}
                    <span className={styles.mono} dir="ltr">
                      {variant.sku}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- Sales panel ---------- */

export function SalesPanel({
  locale,
  initialView = "history",
}: {
  locale: "he" | "en";
  initialView?: "history" | "record";
}) {
  const [view, setView] = useState<"history" | "record">(initialView);
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];

  // Customer
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Items
  const lineCounter = useRef(0);
  const nextKey = () => `line-${++lineCounter.current}`;
  const [lines, setLines] = useState<SaleLine[]>(() => [newLine("line-0")]);

  // Current VAT rate (for the review estimate; the DB remains authoritative)
  const [vatRate, setVatRate] = useState<number | null>(null);

  // Review + submit
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [successText, setSuccessText] = useState("");
  const [historyReloadKey, setHistoryReloadKey] = useState(0);

  // Load the current VAT rate once (both roles on this page have viewFinance).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/management/tax", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { taxRates: [] }))
      .then((data) => {
        if (controller.signal.aborted) return;
        const rows = Array.isArray(data.taxRates) ? data.taxRates : [];
        const current = rows.find(
          (row: { status?: string; is_active?: boolean }) =>
            row.status === "current" && row.is_active !== false,
        );
        if (current && typeof current.rate === "number") {
          setVatRate(current.rate);
        }
      })
      .catch(() => {
        // VAT estimate unavailable — the review shows a note instead.
      });
    return () => controller.abort();
  }, []);

  // Confirm before leaving with an unsaved sale draft.
  const dirty =
    customerName !== "" ||
    customerEmail !== "" ||
    customerPhone !== "" ||
    account !== null ||
    lines.some((line) => line.variantId !== "");
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const resetForm = () => {
    setAccount(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    lineCounter.current = 0;
    setLines([newLine("line-0")]);
    setFormErrors({});
    setSaveError("");
  };

  const handleAccountSelect = (selected: CustomerAccount) => {
    setAccount(selected);
    if (selected.full_name) setCustomerName(selected.full_name);
    if (selected.email) setCustomerEmail(selected.email);
    if (selected.phone) setCustomerPhone(selected.phone);
  };

  const updateLine = (key: string, patch: Partial<SaleLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const handleVariantPick = (
    key: string,
    product: CatalogProduct,
    variant: CatalogVariant,
  ) => {
    const price =
      variant.price_override ?? product.sale_price ?? product.price ?? 0;
    updateLine(key, {
      variantId: variant.id,
      product,
      variant,
      unitPrice: price,
    });
  };

  const validLines = lines.filter(
    (line) => line.variantId && line.quantity > 0,
  );

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!customerName.trim() || !customerEmail.trim()) {
      errors.customer = t(copy.nameEmailRequired);
    } else if (!/^\S+@\S+\.\S+$/.test(customerEmail.trim())) {
      errors.customer = t(copy.emailInvalid);
    }
    if (validLines.length === 0) {
      errors.items = t(copy.itemRequired);
    }
    for (const line of validLines) {
      if (line.quantity <= 0) errors.items = t(copy.qtyPositive);
      if (line.discountPerUnit > line.unitPrice) {
        errors.items = t(copy.discountExceedsPrice);
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openReview = () => {
    setSaveError("");
    if (validate()) setReviewOpen(true);
  };

  const recordSale = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/management/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: customerName.trim(),
            email: customerEmail.trim(),
            phone: customerPhone.trim() || null,
            userId: account?.id ?? null,
          },
          items: validLines.map(
            ({ variantId, quantity, unitPrice, discountPerUnit }) => ({
              variantId,
              quantity,
              unitPrice,
              discountPerUnit: discountPerUnit || 0,
            }),
          ),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data?.code;
        setSaveError(
          code === "insufficient_stock"
            ? t(copy.insufficientStock)
            : code === "invalid_product"
              ? t(copy.invalidProduct)
              : typeof data?.error === "string" && data.error
                ? data.error
                : t(copy.recordFailed),
        );
        return;
      }

      // The POST returns { orderId }; resolve the human-facing order_number
      // (MIRO-YYMMDD-NNNNN) from a fresh bounded sales listing.
      let orderNumber: string | null = null;
      try {
        const listRes = await fetch("/api/management/sales?limit=50", {
          cache: "no-store",
        });
        const listData = await listRes.json().catch(() => ({}));
        const found = ((listData.orders ?? []) as SaleOrder[]).find(
          (order) => order.id === data.orderId,
        );
        orderNumber = found?.order_number ?? null;
      } catch {
        orderNumber = null;
      }

      setReviewOpen(false);
      resetForm();
      setSuccessText(
        orderNumber
          ? `${t(copy.saleRecorded)} · ${t(copy.orderNumberLabel)} ${orderNumber}`
          : t(copy.saleRecorded),
      );
      setHistoryReloadKey((key) => key + 1);
    } catch {
      setSaveError(t(copy.connectionError));
    } finally {
      setSaving(false);
    }
  };

  // Live totals (VAT-inclusive; mirrors record_sale when the rate is known)
  const live = lines.reduce(
    (acc, line) => {
      acc.grossBefore += line.unitPrice * line.quantity;
      acc.discounts += line.discountPerUnit * line.quantity;
      acc.items += line.variantId ? line.quantity : 0;
      return acc;
    },
    { grossBefore: 0, discounts: 0, items: 0 },
  );
  const liveTotal = Math.max(live.grossBefore - live.discounts, 0);

  const review = validLines.map((line) => ({
    line,
    totals: computeLine(line, vatRate ?? 0),
  }));
  const reviewTotals = review.reduce(
    (acc, entry) => ({
      net: acc.net + entry.totals.net,
      vat: acc.vat + entry.totals.vat,
      discount: acc.discount + entry.totals.lineDiscount,
      gross: acc.gross + entry.totals.gross,
    }),
    { net: 0, vat: 0, discount: 0, gross: 0 },
  );

  return (
    <section className="mgmt-page-stack">
      <PageHeader title={t(copy.pageTitle)} subtitle={t(copy.pageSubtitle)} />

      <ReportChoices
        label={he ? "תצוגת מכירות" : "Sales workspace view"}
        value={view}
        onChange={setView}
        options={[
          {
            value: "history",
            label: he ? "היסטוריית מכירות" : "Sales history",
          },
          { value: "record", label: he ? "רישום מכירה" : "Record a sale" },
        ]}
      />
      <div className="mgmt-sale-view" hidden={view !== "record"}>
        <FormSection
          icon={<Plus size={19} aria-hidden="true" />}
          title={t(copy.recordSectionTitle)}
          description={t(copy.recordSectionDescription)}
        >
          {successText ? (
            <div className={styles.noticeWrap}>
              <Notice
                tone="success"
                onDismiss={() => setSuccessText("")}
                dismissLabel={t(copy.noticeDismiss)}
              >
                {successText}
              </Notice>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              openReview();
            }}
          >
            {/* Customer */}
            <fieldset>
              <legend className={styles.fieldLabel}>
                {t(copy.customerSectionTitle)}
              </legend>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  {account ? (
                    <span className={styles.fieldHint}>
                      {t(copy.accountSearchLabel)}
                    </span>
                  ) : (
                    <label
                      className={styles.fieldHint}
                      htmlFor="sale-customer-search"
                    >
                      {t(copy.accountSearchLabel)}
                    </label>
                  )}
                  <CustomerSearch
                    locale={locale}
                    selected={account}
                    onSelect={handleAccountSelect}
                    onClear={() => setAccount(null)}
                  />
                  <span className={styles.fieldHint}>
                    {account ? t(copy.accountLinkedNote) : t(copy.guestNote)}
                  </span>
                </div>
                <div className={styles.field}>
                  <label
                    className={styles.fieldLabel}
                    htmlFor="sale-customer-name"
                  >
                    {t(copy.fieldName)}
                  </label>
                  <input
                    id="sale-customer-name"
                    type="text"
                    className={styles.input}
                    value={customerName}
                    disabled={saving}
                    required
                    aria-invalid={Boolean(formErrors.customer) || undefined}
                    aria-describedby={
                      formErrors.customer ? "sale-customer-error" : undefined
                    }
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label
                    className={styles.fieldLabel}
                    htmlFor="sale-customer-email"
                  >
                    {t(copy.fieldEmail)}
                  </label>
                  <input
                    id="sale-customer-email"
                    type="email"
                    dir="ltr"
                    className={styles.input}
                    value={customerEmail}
                    disabled={saving}
                    required
                    aria-invalid={Boolean(formErrors.customer) || undefined}
                    aria-describedby={
                      formErrors.customer ? "sale-customer-error" : undefined
                    }
                    onChange={(event) => setCustomerEmail(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label
                    className={styles.fieldLabel}
                    htmlFor="sale-customer-phone"
                  >
                    {t(copy.fieldPhone)}
                  </label>
                  <input
                    id="sale-customer-phone"
                    type="tel"
                    dir="ltr"
                    className={styles.input}
                    value={customerPhone}
                    disabled={saving}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                  />
                </div>
              </div>
              {formErrors.customer ? (
                <p
                  id="sale-customer-error"
                  className={styles.fieldError}
                  role="alert"
                >
                  {formErrors.customer}
                </p>
              ) : null}
            </fieldset>

            {/* Items */}
            <fieldset className={styles.noticeWrap}>
              <legend className={styles.fieldLabel}>
                {t(copy.itemsSectionTitle)}
              </legend>

              {lines.map((line, index) => {
                const tracked =
                  (line.product?.tracking_mode ?? "none") !== "none";
                return (
                  <div key={line.key} className={styles.lineItem}>
                    <div className={`${styles.field} ${styles.grow4}`}>
                      {line.variant && line.product ? (
                        <span className={styles.fieldHint}>
                          {t(copy.productSearchLabel)}
                        </span>
                      ) : (
                        <label
                          className={styles.fieldHint}
                          htmlFor={`sale-variant-${index}`}
                        >
                          {t(copy.productSearchLabel)}
                        </label>
                      )}
                      {line.variant && line.product ? (
                        <>
                          <span className={styles.selectionPill}>
                            <span dir="auto">
                              {he ? line.product.name_he : line.product.name_en}
                              {line.variant.color_he || line.variant.color_en
                                ? ` · ${he ? line.variant.color_he : line.variant.color_en}`
                                : ""}
                            </span>
                            <span className={styles.mono} dir="ltr">
                              {line.variant.sku}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(line.key, {
                                  variantId: "",
                                  product: null,
                                  variant: null,
                                  unitPrice: 0,
                                })
                              }
                              disabled={saving}
                              aria-label={t(copy.productClear)}
                            >
                              <X size={13} aria-hidden="true" />
                            </button>
                          </span>
                          <span className={styles.fieldHint}>
                            {tracked
                              ? `${t(copy.stockAvailable)}: ${line.variant.stock_qty}`
                              : t(copy.stockUntracked)}
                          </span>
                        </>
                      ) : (
                        <VariantSearch
                          locale={locale}
                          inputId={`sale-variant-${index}`}
                          disabled={saving}
                          onPick={(product, variant) =>
                            handleVariantPick(line.key, product, variant)
                          }
                        />
                      )}
                    </div>

                    <div className={`${styles.field} ${styles.grow2}`}>
                      <label
                        className={styles.fieldHint}
                        htmlFor={`sale-qty-${index}`}
                      >
                        {t(copy.qty)}
                      </label>
                      <input
                        id={`sale-qty-${index}`}
                        type="number"
                        min="1"
                        step="1"
                        // Untracked stock (tracking_mode "none") gets no
                        // stock-based max; the server remains authoritative.
                        max={tracked ? line.variant?.stock_qty : undefined}
                        className={styles.input}
                        value={line.quantity}
                        disabled={saving}
                        required
                        onChange={(event) =>
                          updateLine(line.key, {
                            quantity: parseInt(event.target.value, 10) || 1,
                          })
                        }
                      />
                    </div>

                    <div className={`${styles.field} ${styles.grow2}`}>
                      <label
                        className={styles.fieldHint}
                        htmlFor={`sale-price-${index}`}
                      >
                        {t(copy.unitPrice)}
                      </label>
                      <input
                        id={`sale-price-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        className={styles.input}
                        value={line.unitPrice}
                        disabled={saving}
                        onChange={(event) =>
                          updateLine(line.key, {
                            unitPrice: parseFloat(event.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div className={`${styles.field} ${styles.grow2}`}>
                      <label
                        className={styles.fieldHint}
                        htmlFor={`sale-discount-${index}`}
                      >
                        {t(copy.discountPerUnit)}
                      </label>
                      <input
                        id={`sale-discount-${index}`}
                        type="number"
                        min="0"
                        max={line.unitPrice}
                        step="0.01"
                        dir="ltr"
                        className={styles.input}
                        value={line.discountPerUnit}
                        disabled={saving}
                        onChange={(event) =>
                          updateLine(line.key, {
                            discountPerUnit:
                              parseFloat(event.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div className={`${styles.field} ${styles.grow2}`}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() =>
                          setLines((prev) =>
                            prev.length <= 1
                              ? prev
                              : prev.filter((entry) => entry.key !== line.key),
                          )
                        }
                        disabled={saving || lines.length <= 1}
                        aria-label={t(copy.removeItem)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {lines.length < MAX_LINES ? (
                <button
                  type="button"
                  className="mgmt-button mgmt-button--ghost"
                  onClick={() =>
                    setLines((prev) => [...prev, newLine(nextKey())])
                  }
                  disabled={saving}
                >
                  <Plus size={15} aria-hidden="true" />
                  {t(copy.addItem)}
                </button>
              ) : null}

              {formErrors.items ? (
                <p className={styles.fieldError} role="alert">
                  {formErrors.items}
                </p>
              ) : null}
            </fieldset>

            {/* Live totals */}
            <div className={styles.summaryStrip}>
              <div>
                <p className={styles.summaryLabel}>{t(copy.liveGross)}</p>
                <p className={styles.summaryValue} dir="ltr">
                  {formatIls(live.grossBefore, locale)}
                </p>
              </div>
              <div>
                <p className={styles.summaryLabel}>{t(copy.liveDiscounts)}</p>
                <p className={styles.summaryValue} dir="ltr">
                  -{formatIls(live.discounts, locale)}
                </p>
              </div>
              <div>
                <p className={styles.summaryLabel}>{t(copy.liveItems)}</p>
                <p className={styles.summaryValue}>{live.items}</p>
              </div>
              <div>
                <p className={styles.summaryLabel}>{t(copy.liveTotal)}</p>
                <p className={styles.summaryValue} dir="ltr">
                  {formatIls(liveTotal, locale)}
                </p>
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className="mgmt-button mgmt-button--primary"
                disabled={saving}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {t(copy.reviewButton)}
              </button>
            </div>
          </form>
        </FormSection>

        {/* Pre-submit review */}
        <Dialog
          open={reviewOpen}
          onClose={() => {
            if (!saving) setReviewOpen(false);
          }}
          title={t(copy.reviewTitle)}
          description={t(copy.reviewDescription)}
          size="lg"
          closeLabel={t(copy.cancelLabel)}
          footer={
            <div className="mgmt-dialog__actions">
              <button
                type="button"
                className="mgmt-button mgmt-button--ghost"
                onClick={() => setReviewOpen(false)}
                disabled={saving}
              >
                {t(copy.cancelLabel)}
              </button>
              <button
                type="button"
                className="mgmt-button mgmt-button--primary"
                onClick={() => void recordSale()}
                disabled={saving}
                aria-busy={saving || undefined}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {saving ? t(copy.recording) : t(copy.confirmRecord)}
              </button>
            </div>
          }
        >
          <div className={styles.reviewCustomer}>
            <strong dir="auto">{customerName}</strong>
            <span dir="ltr">{customerEmail}</span>
            {customerPhone ? <span dir="ltr">{customerPhone}</span> : null}
            <span className={styles.reviewAccountBadge}>
              {account
                ? t(copy.reviewAccountLinked)
                : t(copy.reviewAccountGuest)}
            </span>
          </div>

          <div className={styles.reviewTableWrap}>
            <table className={styles.reviewTable}>
              <caption className={styles.fieldHint}>
                {t(copy.reviewItemsTitle)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t(copy.colProduct)}</th>
                  <th scope="col">{t(copy.colSku)}</th>
                  <th scope="col">{t(copy.colQty)}</th>
                  <th scope="col">{t(copy.colUnitPrice)}</th>
                  <th scope="col">{t(copy.colDiscountUnit)}</th>
                  <th scope="col">{t(copy.colLineDiscount)}</th>
                  <th scope="col">{t(copy.colGross)}</th>
                  <th scope="col">{t(copy.colVat)}</th>
                  <th scope="col">{t(copy.colNet)}</th>
                </tr>
              </thead>
              <tbody>
                {review.map(({ line, totals }) => (
                  <tr key={line.key}>
                    <td dir="auto">
                      {line.product
                        ? he
                          ? line.product.name_he
                          : line.product.name_en
                        : "—"}
                      {line.variant &&
                      (line.variant.color_he || line.variant.color_en)
                        ? ` · ${he ? line.variant.color_he : line.variant.color_en}`
                        : ""}
                    </td>
                    <td>
                      <span className={styles.mono} dir="ltr">
                        {line.variant?.sku ?? "—"}
                      </span>
                    </td>
                    <td>{line.quantity}</td>
                    <td dir="ltr">{formatIls(line.unitPrice, locale)}</td>
                    <td dir="ltr">{formatIls(line.discountPerUnit, locale)}</td>
                    <td dir="ltr">{formatIls(totals.lineDiscount, locale)}</td>
                    <td dir="ltr">{formatIls(totals.gross, locale)}</td>
                    <td dir="ltr">
                      {vatRate === null ? "—" : formatIls(totals.vat, locale)}
                    </td>
                    <td dir="ltr">
                      {vatRate === null ? "—" : formatIls(totals.net, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.reviewTotals}>
            <div className={styles.reviewTotalsRow}>
              <span>{t(copy.reviewSubtotalNet)}</span>
              <span dir="ltr">
                {vatRate === null ? "—" : formatIls(reviewTotals.net, locale)}
              </span>
            </div>
            <div className={styles.reviewTotalsRow}>
              <span>{t(copy.reviewDiscount)}</span>
              <span dir="ltr">-{formatIls(reviewTotals.discount, locale)}</span>
            </div>
            <div className={styles.reviewTotalsRow}>
              <span>{t(copy.reviewVat)}</span>
              <span dir="ltr">
                {vatRate === null ? "—" : formatIls(reviewTotals.vat, locale)}
              </span>
            </div>
            <div className={styles.reviewTotalsRow} data-strong>
              <span>{t(copy.reviewTotal)}</span>
              <span dir="ltr">{formatIls(reviewTotals.gross, locale)}</span>
            </div>
          </div>

          <p className={styles.fieldHint}>
            {vatRate === null
              ? t(copy.vatRateUnavailable)
              : `${t(copy.vatRateNotePrefix)} ${vatRate}% · ${t(copy.vatEstimateNote)}`}
          </p>

          {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
        </Dialog>
      </div>
      <div className="mgmt-sale-view" hidden={view !== "history"}>
        <SalesHistoryView locale={locale} reloadKey={historyReloadKey} />
      </div>
    </section>
  );
}
