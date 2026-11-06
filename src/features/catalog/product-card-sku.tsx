"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { OverflowLabel } from "./overflow-label";

/** The card's actual SKU; copying never navigates or opens a preview. */
export function ProductCardSku({
  sku,
  locale,
  isDuplicate,
}: {
  sku?: string | null;
  locale: "he" | "en";
  isDuplicate: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const value = sku?.trim();
  const he = locale === "he";
  const label = he ? "מק״ט" : "SKU";
  const feedback =
    status === "copied"
      ? he
        ? "המק״ט הועתק"
        : "SKU copied"
      : status === "failed"
        ? he
          ? "ההעתקה נכשלה; ניתן לסמן את הקוד ולהעתיק ידנית"
          : "Copy failed; select the code to copy it manually"
        : "";

  if (!value)
    return (
      <div className="sf-card-sku sf-card-sku--empty" dir={he ? "rtl" : "ltr"}>
        <span className="sf-card-sku-label">{label}</span>
        <span>{he ? "לא הוגדר" : "Not provided"}</span>
      </div>
    );

  return (
    <button
      type="button"
      className="sf-card-sku"
      data-product-identifier="sku"
      dir={he ? "rtl" : "ltr"}
      tabIndex={isDuplicate ? -1 : undefined}
      aria-label={`${he ? "העתקת מק״ט" : "Copy SKU"}: ${value}`}
      title={status === "failed" ? feedback : value}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
        } catch {
          setStatus("failed");
        }
      }}
    >
      <span className="sf-card-sku-label">
        {status === "failed" ? (he ? "העתקה נכשלה" : "Copy failed") : label}
        {status === "copied" ? (
          <Check size={12} aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
      </span>
      <span className="sf-card-sku-value">
        <OverflowLabel activation="hover" direction="ltr">
          {value}
        </OverflowLabel>
      </span>
      <span className="sr-only" role="status">
        {feedback}
      </span>
    </button>
  );
}
