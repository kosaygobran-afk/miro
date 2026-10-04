"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  computeLine,
  formatIls,
  type CustomerAccount,
  type SaleLine,
  type SaleOrder,
} from "../../sales-types";
import { useManagementTools } from "../management-tool-provider";
import { posCopy as copy } from "./pos-copy";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/sales-channel";
import styles from "./pos-window.module.css";

interface PosWindowProps {
  locale: "he" | "en";
  userId: string;
}

export function PosWindow({ locale, userId }: PosWindowProps) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const { saveDraft, clearDraft, closeTool } = useManagementTools();

  // Form state
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Helper functions
  const newLine = (key: string): SaleLine => {
    return {
      key,
      variantId: "",
      quantity: 1,
      unitPrice: 0,
      discountPerUnit: 0,
      product: null,
      variant: null,
    };
  };

  // Items
  const lineCounter = useRef(0);
  const nextKey = () => `line-${++lineCounter.current}`;
  const [lines, setLines] = useState<SaleLine[]>(() => [newLine("line-0")]);

  // VAT rate (for estimates)
  const [vatRate, setVatRate] = useState<number | null>(null);

  // Payments
  const [payments, setPayments] = useState<
    Array<{
      id: string;
      method: (typeof PAYMENT_METHODS)[number];
      amount: number;
      installments: number;
      reference: string;
    }>
  >(() => [
    {
      id: uuidv4(),
      method: "cash",
      amount: 0,
      installments: 1,
      reference: "",
    },
  ]);

  // Review step
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [successText, setSuccessText] = useState("");

  // Idempotency key for the current draft
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(() =>
    uuidv4(),
  );

  // Load VAT rate from API (same as sales-panel)
  const loadVatRate = () => {
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
        // VAT estimate unavailable
      });
    return () => controller.abort();
  };

  // Draft persistence would be handled by provider APIs
  // We'll use callbacks from context in the actual implementation

  // Save draft when idempotencyKey is set
  useEffect(() => {
    // Save draft with idempotency key
    saveDraft("pos", {
      idempotencyKey,
      account,
      customerName,
      customerEmail,
      customerPhone,
      lines,
      payments,
    });
  }, [
    idempotencyKey,
    account,
    customerName,
    customerEmail,
    customerPhone,
    lines,
    payments,
    saveDraft,
  ]);

  // Initialize
  useEffect(() => {
    // Load VAT rate
    loadVatRate();
  }, [userId]);

  // Clear form when userId changes (handled by provider)
  useEffect(() => {
    return () => {
      clearDraft("pos");
    };
  }, [userId, clearDraft]);

  const validLines = lines.filter(
    (line) => line.variantId && line.quantity > 0,
  );

  const validateCustomer = (): boolean => {
    if (!customerName.trim() || !customerEmail.trim()) {
      setFormErrors((prev) => ({
        ...prev,
        customer: t(copy.nameEmailRequired),
      }));
      return false;
    } else if (!/^\S+@\S+\.\S+$/.test(customerEmail.trim())) {
      setFormErrors((prev) => ({ ...prev, customer: t(copy.emailInvalid) }));
      return false;
    }
    setFormErrors((prev) => ({ ...prev, customer: "" }));
    return true;
  };

  const validateItems = (): boolean => {
    if (validLines.length === 0) {
      setFormErrors((prev) => ({ ...prev, items: t(copy.itemRequired) }));
      return false;
    }
    for (const line of validLines) {
      if (line.quantity <= 0) {
        setFormErrors((prev) => ({ ...prev, items: t(copy.qtyPositive) }));
        return false;
      }
      if (line.discountPerUnit > line.unitPrice) {
        setFormErrors((prev) => ({
          ...prev,
          items: t(copy.discountExceedsPrice),
        }));
        return false;
      }
    }
    setFormErrors((prev) => ({ ...prev, items: "" }));
    return true;
  };

  const validatePayments = (): boolean => {
    const total = validLines.reduce((acc, line) => {
      const lineTotal = line.quantity * line.unitPrice;
      const discount = line.quantity * line.discountPerUnit;
      return acc + lineTotal - discount;
    }, 0);

    const paymentsTotal = payments.reduce((sum, p) => sum + p.amount, 0);

    if (Math.abs(paymentsTotal - total) > 0.01) {
      setFormErrors((prev) => ({
        ...prev,
        payments: t(copy.paymentsMustEqualTotal),
      }));
      return false;
    }

    for (const payment of payments) {
      if (payment.method === "cash" && payment.installments > 1) {
        setFormErrors((prev) => ({
          ...prev,
          payments: t(copy.cashOnlyOneInstallment),
        }));
        return false;
      }
    }

    setFormErrors((prev) => ({ ...prev, payments: "" }));
    return true;
  };

  const validate = (): boolean => {
    const customerValid = validateCustomer();
    const itemsValid = validateItems();
    const paymentsValid = validatePayments();
    return customerValid && itemsValid && paymentsValid;
  };

  const updateLine = (key: string, patch: Partial<SaleLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

    // Save draft
    saveDraft("pos", { lines, idempotencyKey });
  };

  const handleQtyChange = (key: string, quantity: number) => {
    updateLine(key, { quantity });
  };

  const handleUnitPriceChange = (key: string, unitPrice: number) => {
    updateLine(key, { unitPrice });
  };

  const handleDiscountChange = (key: string, discountPerUnit: number) => {
    updateLine(key, { discountPerUnit });
  };

  const handleRemoveLine = (key: string) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((entry) => entry.key !== key);
    });

    // Save draft
    saveDraft("pos", { lines, idempotencyKey });
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, newLine(nextKey())]);

    // Save draft
    saveDraft("pos", { lines, idempotencyKey });
  };

  const handleAddPayment = () => {
    setPayments((prev) => [
      ...prev,
      {
        id: uuidv4(),
        method: "cash",
        amount: 0,
        installments: 1,
        reference: "",
      },
    ]);

    // Save draft
    saveDraft("pos", { payments, idempotencyKey });
  };

  const handleRemovePayment = (id: string) => {
    setPayments((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((p) => p.id !== id);
    });

    // Save draft
    saveDraft("pos", { payments, idempotencyKey });
  };

  const handlePaymentMethodChange = (
    id: string,
    method: (typeof PAYMENT_METHODS)[number],
  ) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, method } : p)),
    );

    // Save draft
    saveDraft("pos", { payments, idempotencyKey });
  };

  const handlePaymentAmountChange = (id: string, amount: number) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, amount } : p)),
    );

    // Save draft
    saveDraft("pos", { payments, idempotencyKey });
  };

  const handlePaymentInstallmentsChange = (
    id: string,
    installments: number,
  ) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, installments } : p)),
    );

    // Save draft
    saveDraft("pos", { payments, idempotencyKey });
  };

  const handlePaymentReferenceChange = (id: string, reference: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, reference } : p)),
    );

    // Save draft
    saveDraft("pos", { payments, idempotencyKey });
  };

  const calculateLineTotals = (line: SaleLine) => {
    if (!line.variantId || line.quantity <= 0) {
      return { grossBefore: 0, lineDiscount: 0, gross: 0, vat: 0, net: 0 };
    }

    const vatToUse = vatRate ?? 0; // Use 0 if VAT rate unavailable for calculations
    return computeLine(line, vatToUse);
  };

  const openReview = () => {
    if (validate()) {
      setReviewOpen(true);
    }
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
          payments: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            installments: p.installments,
            reference: p.reference,
          })),
          idempotencyKey,
          source: "pos", // Indicate this is a POS sale
        }),
      });

      const data = await res.json().catch(() => ({}) as SaleOrder);

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
      let orderNumber: string | null = null;
      try {
        const listRes = await fetch("/api/management/sales?limit=50", {
          cache: "no-store",
        });
        const listData = await listRes
          .json()
          .catch(() => ({}) as { orders: SaleOrder[] });
        const found = (listData.orders ?? []).find(
          (order: SaleOrder) => order.id === data.orderId,
        );
        orderNumber = found?.order_number ?? null;
      } catch {
        orderNumber = null;
      }

      setReviewOpen(false);

      // Clear draft on success
      clearDraft("pos");

      // Generate new idempotency key for next draft
      const newKey = uuidv4();
      setIdempotencyKey(newKey);
      saveDraft("pos", { idempotencyKey: newKey }); // Save the new key

      // Reset form
      setAccount(null);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      lineCounter.current = 0;
      setLines([newLine("line-0")]);
      setPayments([
        {
          id: uuidv4(),
          method: "cash",
          amount: 0,
          installments: 1,
          reference: "",
        },
      ]);

      setSuccessText(
        orderNumber
          ? `${t(copy.saleRecorded)} · ${t(copy.orderNumberLabel)} ${orderNumber}`
          : t(copy.saleRecorded),
      );

      // Trigger refresh mechanism (same as sales-panel)
      // This would be done by refreshing a key or triggering a refetch
      // For now, we'll rely on the draft clearing to trigger updates
    } catch {
      setSaveError(t(copy.connectionError));
    } finally {
      setSaving(false);
    }
  };

  // Live totals calculations
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

  // Review totals
  const reviewLines = validLines.map((line) => ({
    line,
    totals: calculateLineTotals(line),
  }));
  const reviewTotals = reviewLines.reduce(
    (acc, entry) => ({
      net: acc.net + entry.totals.net,
      vat: acc.vat + entry.totals.vat,
      discount: acc.discount + entry.totals.lineDiscount,
      gross: acc.gross + entry.totals.gross,
    }),
    { net: 0, vat: 0, discount: 0, gross: 0 },
  );

  const handleClose = () => {
    const hasDraft =
      account !== null ||
      customerName !== "" ||
      customerEmail !== "" ||
      customerPhone !== "" ||
      validLines.length > 0 ||
      payments.some((p) => p.amount > 0);

    if (hasDraft) {
      // Show confirmation dialog
      if (window.confirm(t(copy.closeConfirmMessage))) {
        // Clear draft and close
        clearDraft("pos");
        closeTool("pos");
      }
    } else {
      // Close directly if no draft
      closeTool("pos");
    }
  };

  return (
    <div className={styles.container}>
      {/* Header with close confirmation would be handled by the window component */}

      <div className={styles.content}>
        {/* Customer Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {t(copy.customerSectionTitle)}
          </h2>
          <div className={styles.customerSearch}>
            {/* In real implementation, this would reuse the customer search from sales-panel */}
            <div className={styles.field}>
              <label
                htmlFor="pos-customer-search"
                className={styles.fieldLabel}
              >
                {t(copy.accountSearchLabel)}
              </label>
              <input
                id="pos-customer-search"
                type="search"
                placeholder={t(copy.accountSearchPlaceholder)}
                className={styles.input}
                value={account ? `${account.full_name || account.email}` : ""}
                readOnly
              />
              {account ? (
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={() => setAccount(null)}
                  aria-label={t(copy.accountClear)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </div>
            {account ? (
              <p className={styles.fieldHint}>{t(copy.accountLinkedNote)}</p>
            ) : (
              <p className={styles.fieldHint}>{t(copy.guestNote)}</p>
            )}
          </div>

          <div className={styles.fieldsGrid}>
            <div className={styles.field}>
              <label htmlFor="pos-customer-name" className={styles.fieldLabel}>
                {t(copy.fieldName)}
              </label>
              <input
                id="pos-customer-name"
                type="text"
                className={styles.input}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                aria-invalid={Boolean(formErrors.customer)}
                aria-describedby={
                  formErrors.customer ? "pos-customer-error" : undefined
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="pos-customer-email" className={styles.fieldLabel}>
                {t(copy.fieldEmail)}
              </label>
              <input
                id="pos-customer-email"
                type="email"
                className={styles.input}
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                aria-invalid={Boolean(formErrors.customer)}
                aria-describedby={
                  formErrors.customer ? "pos-customer-error" : undefined
                }
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="pos-customer-phone" className={styles.fieldLabel}>
                {t(copy.fieldPhone)}
              </label>
              <input
                id="pos-customer-phone"
                type="tel"
                className={styles.input}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                aria-invalid={Boolean(formErrors.customer)}
                aria-describedby={
                  formErrors.customer ? "pos-customer-error" : undefined
                }
              />
            </div>
          </div>

          {formErrors.customer && (
            <p
              id="pos-customer-error"
              className={styles.fieldError}
              role="alert"
            >
              {formErrors.customer}
            </p>
          )}
        </div>

        {/* Items Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t(copy.itemsSectionTitle)}</h2>
          <div className={styles.itemsContainer}>
            {lines.map((line, index) => {
              const tracked =
                (line.product?.tracking_mode ?? "none") !== "none";
              return (
                <div key={line.key} className={styles.lineItem}>
                  <div className={`${styles.field} ${styles.grow4}`}>
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
                            <span aria-hidden="true">×</span>
                          </button>
                        </span>
                        <span className={styles.fieldHint}>
                          {tracked
                            ? `${t(copy.stockAvailable)}: ${line.variant.stock_qty}`
                            : t(copy.stockUntracked)}
                        </span>
                      </>
                    ) : (
                      <div className={styles.productSearch}>
                        {/* In real implementation, this would reuse the variant search from sales-panel */}
                        <input
                          type="search"
                          placeholder={t(copy.productSearchPlaceholder)}
                          className={styles.input}
                          aria-label={t(copy.productSearchLabel)}
                        />
                        <button
                          type="button"
                          className={styles.buttonSecondary}
                          onClick={() => {
                            // Would open product picker dialog
                          }}
                          aria-label={t(copy.productSearchLabel)}
                        >
                          {/* Search icon */}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`${styles.field} ${styles.grow2}`}>
                    <label
                      htmlFor={`pos-qty-${index}`}
                      className={styles.fieldLabel}
                    >
                      {t(copy.qty)}
                    </label>
                    <input
                      id={`pos-qty-${index}`}
                      type="number"
                      min="1"
                      step="1"
                      max={tracked ? line.variant?.stock_qty : undefined}
                      className={styles.input}
                      value={line.quantity}
                      onChange={(e) =>
                        handleQtyChange(
                          line.key,
                          parseInt(e.target.value, 10) || 1,
                        )
                      }
                      disabled={saving}
                      required
                      aria-invalid={Boolean(formErrors.items)}
                      aria-describedby={
                        formErrors.items ? `pos-qty-error-${index}` : undefined
                      }
                    />
                  </div>

                  <div className={`${styles.field} ${styles.grow2}`}>
                    <label
                      htmlFor={`pos-price-${index}`}
                      className={styles.fieldLabel}
                    >
                      {t(copy.unitPrice)}
                    </label>
                    <input
                      id={`pos-price-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      className={styles.input}
                      value={line.unitPrice}
                      onChange={(e) =>
                        handleUnitPriceChange(
                          line.key,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      disabled={saving}
                      aria-invalid={Boolean(formErrors.items)}
                      aria-describedby={
                        formErrors.items
                          ? `pos-price-error-${index}`
                          : undefined
                      }
                    />

                    {/* Show hint when price is overridden */}
                    {line.product && line.variant && (
                      <p className={styles.fieldHint}>
                        {he ? "הערה: מחיר ידני" : "Note: Manual price override"}
                      </p>
                    )}
                  </div>

                  <div className={`${styles.field} ${styles.grow2}`}>
                    <label
                      htmlFor={`pos-discount-${index}`}
                      className={styles.fieldLabel}
                    >
                      {t(copy.discountPerUnit)}
                    </label>
                    <input
                      id={`pos-discount-${index}`}
                      type="number"
                      min="0"
                      max={line.unitPrice}
                      step="0.01"
                      className={styles.input}
                      value={line.discountPerUnit}
                      onChange={(e) =>
                        handleDiscountChange(
                          line.key,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      disabled={saving}
                      aria-invalid={Boolean(formErrors.items)}
                      aria-describedby={
                        formErrors.items
                          ? `pos-discount-error-${index}`
                          : undefined
                      }
                    />
                  </div>

                  <div className={`${styles.field} ${styles.grow2}`}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => handleRemoveLine(line.key)}
                      disabled={saving || lines.length <= 1}
                      aria-label={t(copy.removeItem)}
                    >
                      <span aria-hidden="true">🗑️</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {lines.length < 10 && (
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={handleAddLine}
                disabled={saving}
              >
                <span aria-hidden="true">+</span>
                {t(copy.addItem)}
              </button>
            )}

            {formErrors.items && (
              <p className={styles.fieldError} role="alert">
                {formErrors.items}
              </p>
            )}
          </div>

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
        </div>

        {/* Payments Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t(copy.paymentSectionTitle)}</h2>
          <div className={styles.paymentsContainer}>
            {payments.map((payment, index) => (
              <div key={payment.id} className={styles.paymentItem}>
                <div className={styles.paymentField}>
                  <label
                    htmlFor={`pos-payment-method-${index}`}
                    className={styles.fieldLabel}
                  >
                    {t(copy.paymentMethod)}
                  </label>
                  <select
                    id={`pos-payment-method-${index}`}
                    className={styles.select}
                    value={payment.method}
                    onChange={(e) =>
                      handlePaymentMethodChange(
                        payment.id,
                        e.target.value as (typeof PAYMENT_METHODS)[number],
                      )
                    }
                    disabled={saving}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method][locale]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.paymentField}>
                  <label
                    htmlFor={`pos-payment-amount-${index}`}
                    className={styles.fieldLabel}
                  >
                    {t(copy.amount)}
                  </label>
                  <input
                    id={`pos-payment-amount-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    className={styles.input}
                    value={payment.amount}
                    onChange={(e) =>
                      handlePaymentAmountChange(
                        payment.id,
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    disabled={saving}
                  />
                </div>

                <div className={styles.paymentField}>
                  <label
                    htmlFor={`pos-payment-installments-${index}`}
                    className={styles.fieldLabel}
                  >
                    {t(copy.installments)}
                  </label>
                  <input
                    id={`pos-payment-installments-${index}`}
                    type="number"
                    min="1"
                    max={payment.method === "cash" ? 1 : 36}
                    className={styles.input}
                    value={payment.installments}
                    onChange={(e) =>
                      handlePaymentInstallmentsChange(
                        payment.id,
                        parseInt(e.target.value, 10),
                      )
                    }
                    disabled={saving}
                  />

                  {payment.method === "cash" && payment.installments > 1 && (
                    <p className={styles.fieldError} role="alert">
                      {t(copy.cashOnlyOneInstallment)}
                    </p>
                  )}
                </div>

                <div className={styles.paymentField}>
                  <label
                    htmlFor={`pos-payment-reference-${index}`}
                    className={styles.fieldLabel}
                  >
                    {t(copy.reference)}
                  </label>
                  <input
                    id={`pos-payment-reference-${index}`}
                    type="text"
                    maxLength={120}
                    className={styles.input}
                    value={payment.reference}
                    onChange={(e) =>
                      handlePaymentReferenceChange(payment.id, e.target.value)
                    }
                    disabled={saving}
                  />
                  <span className={styles.fieldHint}>
                    {he ? "(עד 120 תווים)" : "(up to 120 chars)"}
                  </span>
                </div>

                <div className={styles.paymentField}>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={() => handleRemovePayment(payment.id)}
                    disabled={saving || payments.length <= 1}
                    aria-label={t(copy.removePayment)}
                  >
                    <span aria-hidden="true">🗑️</span>
                  </button>
                </div>
              </div>
            ))}

            {payments.length < 5 && (
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={handleAddPayment}
                disabled={saving}
              >
                <span aria-hidden="true">+</span>
                {t(copy.addPayment)}
              </button>
            )}

            {formErrors.payments && (
              <p className={styles.fieldError} role="alert">
                {formErrors.payments}
              </p>
            )}
          </div>
        </div>

        {/* Review Section */}
        {reviewOpen && (
          <div className={styles.reviewSection}>
            <h2 className={styles.sectionTitle}>{t(copy.reviewTitle)}</h2>
            <p className={styles.sectionDescription}>
              {t(copy.reviewDescription)}
            </p>

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
                  {reviewLines.map(({ line, totals }) => (
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
                      <td dir="ltr">
                        {formatIls(line.discountPerUnit, locale)}
                      </td>
                      <td dir="ltr">
                        {formatIls(totals.lineDiscount, locale)}
                      </td>
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
                <span dir="ltr">
                  -{formatIls(reviewTotals.discount, locale)}
                </span>
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

            {saveError ? <p className={styles.saveError}>{saveError}</p> : null}

            <div className={styles.reviewActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => setReviewOpen(false)}
                disabled={saving}
              >
                {t(copy.cancelLabel)}
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={recordSale}
                disabled={saving}
                aria-busy={saving || undefined}
              >
                {saving ? t(copy.recording) : t(copy.confirmRecord)}
              </button>
            </div>
          </div>
        )}

        {/* Success Message */}
        {successText && (
          <div className={styles.successMessage}>
            <p>{successText}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={openReview}
            disabled={saving || validLines.length === 0}
          >
            {t(copy.reviewButton)}
          </button>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={handleClose}
            disabled={saving}
          >
            {t(copy.close)}
          </button>
        </div>
      </div>
    </div>
  );
}
