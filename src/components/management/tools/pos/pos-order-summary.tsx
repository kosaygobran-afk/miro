"use client";

import { formatPrice } from "./pos-utils";
import type { PosTotals } from "./pos-types";
import type { Locale } from "@/lib/i18n";

export function PosOrderSummary({
  locale,
  subtotal,
  discounts,
  total,
  paid,
  remaining,
  vat,
}: PosTotals & { locale: Locale }) {
  const he = locale === "he";
  return (
    <section
      className="border-t border-border-subtle p-4"
      aria-label={he ? "סיכום המכירה" : "Sale summary"}
    >
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">
          {he ? "סכום ביניים" : "Subtotal"}
        </dt>
        <dd dir="ltr" className="text-end tabular-nums">
          {formatPrice(subtotal, locale)}
        </dd>
        {discounts > 0 && (
          <>
            <dt className="text-muted-foreground">
              {he ? "הנחות" : "Discounts"}
            </dt>
            <dd dir="ltr" className="text-end tabular-nums">
              −{formatPrice(discounts, locale)}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">
          {he ? "מע״מ כלול" : "VAT included"}
        </dt>
        <dd dir="ltr" className="text-end tabular-nums">
          {vat === null ? "—" : formatPrice(vat, locale)}
        </dd>
        <dt className="mt-1 text-lg font-bold">
          {he ? "סה״כ לתשלום" : "Total due"}
        </dt>
        <dd
          dir="ltr"
          className="mt-1 text-end text-xl font-bold text-foreground tabular-nums"
        >
          {formatPrice(total, locale)}
        </dd>
        <dt className="border-t border-border-subtle pt-2 text-muted-foreground">
          {he ? "תשלומים שהוקצו" : "Allocated payments"}
        </dt>
        <dd
          dir="ltr"
          className="border-t border-border-subtle pt-2 text-end tabular-nums"
        >
          {formatPrice(paid, locale)}
        </dd>
        <dt className="font-semibold">
          {paid > total
            ? he
              ? "הקצאת יתר"
              : "Overallocated"
            : he
              ? "יתרה להקצאה"
              : "Balance to allocate"}
        </dt>
        <dd dir="ltr" className="text-end font-semibold tabular-nums">
          {formatPrice(paid > total ? paid - total : remaining, locale)}
        </dd>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {he
          ? "הקצאת תשלום אינה אישור חיוב. מצב המכירה יאומת בסיום."
          : "A payment allocation does not confirm a charge. Sale status is verified when completed."}
      </p>
    </section>
  );
}
