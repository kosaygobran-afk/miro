"use client";

import { PosPaymentPanel } from "./pos-payment-panel";
import { Dialog } from "@/components/management/ui/dialog";
import { computePosTotals, validatePaymentTotal } from "./pos-utils";
import type { PosPayment, PosGatewayCapabilities } from "./pos-types";
import type { Locale } from "@/lib/i18n";

interface PosPaymentSheetProps {
  locale: Locale;
  payments: PosPayment[];
  onChange: (payments: PosPayment[]) => void;
  total: number;
  onComplete: () => Promise<void>;
  open: boolean;
  onClose: () => void;
  saving?: boolean;
  gatewayCapabilities?: PosGatewayCapabilities;
  error?: string;
  locked?: boolean;
  pendingIntentId?: string | null;
}
export function PosPaymentSheet({
  locale,
  payments,
  onChange,
  total,
  onComplete,
  open,
  onClose,
  saving,
  gatewayCapabilities,
  error,
  locked,
  pendingIntentId,
}: PosPaymentSheetProps) {
  const t = (map: Record<"he" | "en", string>) => map[locale];
  let paid = 0;
  try {
    paid = computePosTotals([], payments, null).paid;
  } catch {
    /* bad restored money fails completion validation */
  }
  const remaining =
    Math.max(0, Math.round(total * 100) - Math.round(paid * 100)) / 100;
  const canComplete =
    Boolean(pendingIntentId) ||
    (total > 0 && validatePaymentTotal(payments, total));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t({ he: "בדיקה ותשלום", en: "Review and payment" })}
      description={t({
        he: "בדקו את הסכומים ואופן הגבייה לפני אישור.",
        en: "Review amounts and collection before confirming.",
      })}
      closeLabel={t({ he: "סגור", en: "Close" })}
      size="lg"
      footer={
        <button
          type="button"
          onClick={() => void onComplete()}
          disabled={saving || !canComplete}
          aria-busy={saving || undefined}
          className="mgmt-button mgmt-button--primary w-full"
        >
          {saving
            ? t({ he: "בודק ורושם…", en: "Checking and recording…" })
            : pendingIntentId
              ? t({
                  he: "בדוק והשלם מכירה ממתינה",
                  en: "Check / finish pending sale",
                })
              : t({ he: "אשר מכירה", en: "Confirm sale" })}
        </button>
      }
    >
      <div dir={locale === "he" ? "rtl" : "ltr"}>
        <PosPaymentPanel
          locale={locale}
          payments={payments}
          onChange={onChange}
          total={total}
          paid={paid}
          remaining={remaining}
          disabled={saving || locked}
          gatewayCapabilities={gatewayCapabilities}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-foreground">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
