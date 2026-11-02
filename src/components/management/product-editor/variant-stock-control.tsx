"use client";

import { useState } from "react";
import { Dialog, FormField, Notice } from "../ui";
import type { Locale, ProductVariant } from "./types";

/** A separate ledger operation; metadata saves never overwrite stock. */
export function VariantStockControl({
  variant,
  locale,
  onSaved,
}: {
  variant: ProductVariant;
  locale: Locale;
  onSaved: () => void;
}) {
  const he = locale === "he";
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [expected, setExpected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  const refreshMessage = he
    ? "יש לרענן ולבדוק את המלאי ויומן התנועות לפני פעולה נוספת. הבקשה לא תישלח שוב אוטומטית."
    : "Refresh and check stock and movement history before another operation. The request will not be retried automatically.";

  async function save() {
    const quantity = Number(counted);
    if (
      busy ||
      refreshRequired ||
      !counted.trim() ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      !reason.trim()
    )
      return;
    if (quantity === expected) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/management/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variant.id,
          counted: quantity,
          expectedStock: expected,
          reason: reason.trim(),
        }),
      });
      if (!response.ok) {
        if (response.status === 409 || response.status >= 500) {
          setRefreshRequired(true);
          setError(refreshMessage);
        } else {
          setError(
            he
              ? "המלאי לא נשמר. בדקו כמות, הרשאות ומלאי שמור להזמנות."
              : "Stock was not saved. Check quantity, permissions and stock reserved for orders.",
          );
        }
        return;
      }
      const result = await response.json();
      if (!result.movementId) throw new Error("Unconfirmed stock movement");
      setOpen(false);
      onSaved();
    } catch {
      setRefreshRequired(true);
      setError(refreshMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="miro-button miro-button-secondary"
        onClick={() => {
          setCounted(String(variant.stock_qty));
          setExpected(variant.stock_qty);
          setReason("");
          setError("");
          setOpen(true);
        }}
        disabled={refreshRequired}
      >
        {he ? "עדכון מלאי" : "Update stock"}
      </button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        size="md"
        title={`${he ? "מלאי וריאנט" : "Variant stock"} · ${variant.sku}`}
        closeLabel={he ? "סגירה" : "Close"}
        footer={
          <>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {he ? "ביטול" : "Cancel"}
            </button>
            {refreshRequired ? (
              <button
                type="button"
                className="miro-button miro-button-primary"
                onClick={() => window.location.reload()}
              >
                {he ? "רענון ובדיקה" : "Refresh and review"}
              </button>
            ) : (
              <button
                type="button"
                className="miro-button miro-button-primary"
                disabled={
                  busy ||
                  !counted.trim() ||
                  !Number.isSafeInteger(Number(counted)) ||
                  Number(counted) < 0 ||
                  !reason.trim()
                }
                onClick={() => void save()}
                aria-busy={busy || undefined}
              >
                {busy
                  ? he
                    ? "שומר…"
                    : "Saving…"
                  : he
                    ? "שמירת ספירת מלאי"
                    : "Save stock count"}
              </button>
            )}
          </>
        }
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p>
          {he ? "מלאי נוכחי:" : "Current stock:"} {expected}
        </p>
        <FormField
          id={`stock-count-${variant.id}`}
          label={he ? "כמות שנספרה (כולל 0)" : "Counted quantity (including 0)"}
          required
        >
          {(control) => (
            <input
              {...control}
              className="miro-input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              disabled={busy || refreshRequired}
            />
          )}
        </FormField>
        <FormField
          id={`stock-reason-${variant.id}`}
          label={he ? "סיבת העדכון" : "Reason for correction"}
          required
        >
          {(control) => (
            <input
              {...control}
              className="miro-input"
              type="text"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy || refreshRequired}
            />
          )}
        </FormField>
        <p>
          {he
            ? "השינוי נשמר ביומן המלאי ומשתקף בסך המוצר ובאתר."
            : "The change is recorded in the stock ledger and reflected in product totals and the storefront."}
        </p>
      </Dialog>
    </>
  );
}
