"use client";

import { useState } from "react";
import { ClipboardCheck, ShoppingCart, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/management/ui/dialog";
import { computePosTotals, validatePaymentTotal } from "./pos-utils";
import { PosCartLine } from "./pos-cart-line";
import { PosOrderSummary } from "./pos-order-summary";
import { PosCustomerButton } from "./pos-customer-button";
import { PosPaymentPanel } from "./pos-payment-panel";
import type {
  PosCartLine as PosCartLineType,
  PosPayment,
  PosCustomer,
  PosGatewayCapabilities,
} from "./pos-types";
import type { Locale } from "@/lib/i18n";
import styles from "./pos-workspace.module.css";

interface PosCartProps {
  locale: Locale;
  lines: PosCartLineType[];
  onLineChange: (key: string, patch: Partial<PosCartLineType>) => void;
  onLineRemove: (key: string) => void;
  onClearCart: () => void;
  customer: PosCustomer | null;
  onCustomerChange: (customer: PosCustomer | null) => void;
  onOpenCustomer: () => void;
  payments: PosPayment[];
  onPaymentChange: (payments: PosPayment[]) => void;
  onRecordSale: () => Promise<void>;
  onCancelPending: () => Promise<void>;
  saving: boolean;
  locked: boolean;
  pendingIntentId: string | null;
  vatRate: number | null;
  gatewayCapabilities: PosGatewayCapabilities;
}

export function PosCart(props: PosCartProps) {
  const { locale, lines, saving, locked, payments, pendingIntentId } = props;
  const he = locale === "he";
  const [clearOpen, setClearOpen] = useState(false);
  const validLines = lines.filter(
    (line) => line.variantId && line.quantity > 0,
  );
  const totals = computePosTotals(lines, payments, props.vatRate);
  const canRecord =
    !saving &&
    (Boolean(pendingIntentId) ||
      (!locked &&
        totals.total > 0 &&
        validLines.length > 0 &&
        validatePaymentTotal(payments, totals.total)));
  return (
    <div className={styles.cart}>
      <header className={styles.cartHeader}>
        <ShoppingCart size={20} aria-hidden="true" />
        <h3>{he ? "המכירה הנוכחית" : "Current sale"}</h3>
        <span className={styles.count}>{totals.itemCount}</span>
        {validLines.length > 0 && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setClearOpen(true)}
            disabled={saving || locked}
          >
            <Trash2 size={15} className="inline" aria-hidden="true" />{" "}
            {he ? "נקה" : "Clear"}
          </button>
        )}
      </header>
      {validLines.length === 0 ? (
        <div className={styles.emptyCart}>
          <ShoppingCart size={38} strokeWidth={1.3} aria-hidden="true" />
          <p>
            {he
              ? "בחר מוצר מהקטלוג או סרוק ברקוד כדי להתחיל מכירה."
              : "Choose a product or scan a barcode to start a sale."}
          </p>
        </div>
      ) : (
        <div className={styles.cartLines}>
          {validLines.map((line) => (
            <PosCartLine
              key={line.key}
              locale={locale}
              line={line}
              onChange={props.onLineChange}
              onRemove={props.onLineRemove}
              saving={saving || locked}
            />
          ))}
        </div>
      )}
      <PosOrderSummary locale={locale} {...totals} />
      <div className={styles.cartFooter}>
        <PosCustomerButton
          locale={locale}
          customer={props.customer}
          onChange={props.onCustomerChange}
          onOpenSheet={props.onOpenCustomer}
          disabled={saving || locked}
        />
        <PosPaymentPanel
          locale={locale}
          payments={payments}
          onChange={props.onPaymentChange}
          total={totals.total}
          paid={totals.paid}
          remaining={totals.remaining}
          gatewayCapabilities={props.gatewayCapabilities}
          disabled={saving || locked}
        />
        <button
          type="button"
          onClick={() => void props.onRecordSale()}
          disabled={!canRecord}
          className={styles.primaryButton}
          aria-busy={saving}
        >
          <ClipboardCheck size={20} aria-hidden="true" />
          {saving
            ? he
              ? "בודק ושומר…"
              : "Checking & saving…"
            : pendingIntentId
              ? he
                ? "בדיקה / השלמת מכירה ממתינה"
                : "Check / finish pending sale"
              : he
                ? "השלמת המכירה"
                : "Complete sale"}
        </button>
        {pendingIntentId && (
          <button
            type="button"
            className={styles.more}
            disabled={saving}
            onClick={() => void props.onCancelPending()}
          >
            {he ? "ביטול מכירה שלא שולמה" : "Cancel unpaid sale"}
          </button>
        )}
      </div>
      <ConfirmationDialog
        open={clearOpen}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          props.onClearCart();
          setClearOpen(false);
        }}
        title={he ? "לנקות את העגלה?" : "Clear the cart?"}
        description={
          he
            ? "הפריטים והתשלומים בטיוטה יוסרו."
            : "The draft items and payment allocations will be removed."
        }
        confirmLabel={he ? "נקה עגלה" : "Clear cart"}
        cancelLabel={he ? "חזרה" : "Keep cart"}
        closeLabel={he ? "סגור" : "Close"}
        tone="danger"
      />
    </div>
  );
}
