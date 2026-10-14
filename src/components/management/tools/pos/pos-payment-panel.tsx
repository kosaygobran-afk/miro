"use client";

import { useId } from "react";
import {
  Banknote,
  CreditCard,
  Smartphone,
  Landmark,
  Check,
  Plus,
  Trash2,
  Coins,
} from "lucide-react";
import { cn, formatPrice, generateIdempotencyKey } from "./pos-utils";
import { toAgorot, sumAgorot } from "@/lib/commerce/money";
import type { PosPayment, PosGatewayCapabilities } from "./pos-types";
import type { Locale } from "@/lib/i18n";

const PAYMENT_METHODS = [
  { id: "cash", icon: Banknote, label: { he: "מזומן", en: "Cash" } },
  {
    id: "credit_card",
    icon: CreditCard,
    label: { he: "כרטיס אשראי", en: "Card" },
  },
  { id: "bit", icon: Smartphone, label: { he: "ביט", en: "bit" } },
  {
    id: "bank_transfer",
    icon: Landmark,
    label: { he: "העברה בנקאית", en: "Bank transfer" },
  },
  { id: "check", icon: Check, label: { he: "המחאה", en: "Check" } },
  { id: "other", icon: Coins, label: { he: "אחר", en: "Other" } },
] as const;

interface PosPaymentPanelProps {
  locale: Locale;
  payments: PosPayment[];
  onChange: (payments: PosPayment[]) => void;
  total: number;
  paid: number;
  remaining: number;
  disabled?: boolean;
  gatewayCapabilities?: PosGatewayCapabilities;
}

export function PosPaymentPanel({
  locale,
  payments,
  onChange,
  total,
  paid,
  remaining,
  disabled,
  gatewayCapabilities,
}: PosPaymentPanelProps) {
  const headingId = useId();
  const helpId = useId();
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const providerAvailable = (method: PosPayment["method"]) =>
    method === "credit_card"
      ? gatewayCapabilities?.hostedCard === true
      : method === "bit" && gatewayCapabilities?.bit === true;
  const update = (id: string, patch: Partial<PosPayment>) =>
    onChange(
      payments.map((payment) =>
        payment.id === id ? { ...payment, ...patch } : payment,
      ),
    );
  const add = (method: PosPayment["method"]) => {
    if (disabled || payments.length >= 6) return;
    const payment: PosPayment = {
      id: generateIdempotencyKey(),
      method,
      collectionKind: "manual_recorded",
      amount: Math.max(0, remaining),
      installments: 1,
      reference: "",
    };
    if (payments.length === 1 && payments[0].amount === 0) onChange([payment]);
    else onChange([...payments, payment]);
  };
  const fill = (payment: PosPayment) => {
    try {
      update(payment.id, {
        amount:
          sumAgorot([toAgorot(payment.amount), toAgorot(remaining)]) / 100,
      });
    } catch {
      /* invalid draft remains visible for correction */
    }
  };
  const changeMoney = (
    payment: PosPayment,
    field: "amount" | "cashReceived",
    value: string,
  ) => {
    if (!/^\d*(?:\.\d{0,2})?$/.test(value)) return;
    const amount = Number(value || 0);
    try {
      toAgorot(amount);
      update(payment.id, { [field]: amount });
    } catch {
      /* Unsupported amounts never enter shared cart state. */
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        {t({ he: "תשלום", en: "Payment" })}
      </h3>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-3">
        <span className="text-sm text-muted-foreground">
          {t({ he: "סה״כ לתשלום", en: "Total due" })}
        </span>
        <b className="text-end font-mono tabular-nums" dir="ltr">
          {formatPrice(total, locale)}
        </b>
        <span className="text-sm text-muted-foreground">
          {t({ he: "סכום שהוקצה", en: "Allocated amount" })}
        </span>
        <span className="text-end font-mono tabular-nums" dir="ltr">
          {formatPrice(paid, locale)}
        </span>
        <span className="text-sm text-muted-foreground">
          {paid > total
            ? t({ he: "הקצאת יתר", en: "Overallocated" })
            : t({ he: "נותר להקצאה", en: "Still to allocate" })}
        </span>
        <b className="text-end font-mono tabular-nums" dir="ltr">
          {formatPrice(paid > total ? paid - total : remaining, locale)}
        </b>
      </div>
      <p id={helpId} className="text-xs text-muted-foreground">
        {t({
          he: "בחירת אמצעי תשלום אינה גובה כסף. רישום חיצוני מיועד לכסף שכבר התקבל; גבייה דרך ספק מאומתת בנפרד.",
          en: "Selecting a method does not collect funds. Record external funds only after receipt; provider collection is verified separately.",
        })}
      </p>
      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label={t({ he: "הוספת אמצעי תשלום", en: "Add payment method" })}
        aria-describedby={helpId}
      >
        {PAYMENT_METHODS.map(({ id, icon: Icon, label }) => {
          const selected = payments.some((payment) => payment.method === id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => add(id)}
              disabled={disabled || selected || payments.length >= 6}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border-control bg-surface text-foreground hover:bg-surface-hover",
              )}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label[locale]}</span>
            </button>
          );
        })}
      </div>
      <div className="space-y-3">
        {payments.map((payment, index) => {
          const info = PAYMENT_METHODS.find(
            (method) => method.id === payment.method,
          );
          const received = payment.cashReceived ?? payment.amount;
          const change =
            Math.max(
              0,
              Math.round(received * 100) - Math.round(payment.amount * 100),
            ) / 100;
          return (
            <fieldset
              key={payment.id}
              disabled={disabled}
              className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-surface p-3"
            >
              <legend className="px-1 text-sm font-semibold">
                {index + 1}. {info?.label[locale] ?? payment.method}
              </legend>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {payment.collectionKind === "provider_collected"
                    ? t({ he: "גבייה דרך ספק", en: "Provider collection" })
                    : t({
                        he: "רישום תשלום שהתקבל",
                        en: "Record funds received",
                      })}
                </span>
                {payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        payments.filter((entry) => entry.id !== payment.id),
                      )
                    }
                    className="rounded-lg p-2 text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    aria-label={`${t({ he: "הסר תשלום", en: "Remove payment" })} ${index + 1}`}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              {(payment.method === "credit_card" ||
                payment.method === "bit") && (
                <label className="block text-xs text-muted-foreground">
                  {t({ he: "אופן הגבייה", en: "Collection" })}
                  <select
                    value={payment.collectionKind}
                    onChange={(event) =>
                      update(payment.id, {
                        collectionKind: event.target
                          .value as PosPayment["collectionKind"],
                        installments: 1,
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-border-control bg-surface-muted px-2 text-sm text-foreground"
                  >
                    <option value="manual_recorded">
                      {t({
                        he: "רישום חיצוני — התקבל כבר",
                        en: "External record — already received",
                      })}
                    </option>
                    <option
                      value="provider_collected"
                      disabled={!providerAvailable(payment.method)}
                    >
                      {providerAvailable(payment.method)
                        ? t({
                            he: "גבייה מאובטחת דרך ספק",
                            en: "Secure provider collection",
                          })
                        : t({
                            he: "גבייה דרך ספק אינה זמינה",
                            en: "Provider collection unavailable",
                          })}
                    </option>
                  </select>
                </label>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {t({ he: "סכום לרישום", en: "Amount to record" })}
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={payment.amount}
                    onChange={(event) =>
                      changeMoney(payment, "amount", event.target.value)
                    }
                    dir="ltr"
                    className="mt-1 h-11 w-full rounded-lg border border-border-control bg-surface-muted px-3 font-mono text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  />
                </label>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => fill(payment)}
                    className="min-h-11 rounded-lg border border-border-control px-3 text-sm font-medium text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  >
                    {t({ he: "מלא יתרה", en: "Fill remaining" })}
                  </button>
                )}
              </div>
              {payment.method === "cash" && (
                <div className="space-y-2">
                  <label className="block text-xs text-muted-foreground">
                    {t({
                      he: "מזומן שהתקבל (לחישוב עודף)",
                      en: "Cash received (for change)",
                    })}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={payment.amount}
                      step="0.01"
                      value={received}
                      onChange={(event) =>
                        changeMoney(payment, "cashReceived", event.target.value)
                      }
                      dir="ltr"
                      className="mt-1 h-11 w-full rounded-lg border border-border-control bg-surface-muted px-3 font-mono text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    />
                  </label>
                  <p className="flex justify-between gap-2 text-sm">
                    <span>{t({ he: "עודף", en: "Change" })}</span>
                    <b dir="ltr">{formatPrice(change, locale)}</b>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t({
                      he: "מזומן דורש משמרת קופה פתוחה. יש לקבל את הכסף בפועל לפני אישור המכירה.",
                      en: "Cash requires an open cash shift. Receive the funds before confirming the sale.",
                    })}
                  </p>
                </div>
              )}
              {payment.collectionKind === "manual_recorded" && (
                <label className="block text-xs text-muted-foreground">
                  {t({ he: "אסמכתה (אופציונלי)", en: "Reference (optional)" })}
                  <input
                    type="text"
                    value={payment.reference}
                    maxLength={120}
                    onChange={(event) =>
                      update(payment.id, { reference: event.target.value })
                    }
                    placeholder={t({
                      he: "מספר עסקה או אסמכתה",
                      en: "Transaction or receipt reference",
                    })}
                    className="mt-1 h-11 w-full rounded-lg border border-border-control bg-surface-muted px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  />
                  <span className="mt-1 block">
                    {t({
                      he: "אין להזין מספר כרטיס מלא או קוד אבטחה.",
                      en: "Do not enter a full card number or security code.",
                    })}
                  </span>
                </label>
              )}
            </fieldset>
          );
        })}
      </div>
      {payments.length < 6 && (
        <button
          type="button"
          onClick={() => add("cash")}
          disabled={disabled}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-control text-sm text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
        >
          <Plus size={18} aria-hidden="true" />
          {t({ he: "פיצול לתשלום נוסף", en: "Split with another payment" })}
        </button>
      )}
    </section>
  );
}
