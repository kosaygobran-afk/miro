"use client";

import { cn } from "./pos-utils";
import { CheckCircle, X } from "lucide-react";
import { formatPrice } from "./pos-utils";
import type { Locale } from "@/lib/i18n";

interface PosSuccessViewProps {
  message: string;
  onDismiss: () => void;
  orderNumber?: string;
  total?: number;
  locale?: Locale;
}

export function PosSuccessView({
  message,
  onDismiss,
  orderNumber,
  total,
  locale = "he",
}: PosSuccessViewProps) {
  const t = (map: Record<"he" | "en", string>) => map[locale];

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 left-4 md:right-4 md:left-auto md:bottom-4 md:top-auto",
        "z-50 animate-slide-up",
        "max-w-md",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-start gap-3 p-4 rounded-2xl border border-border-subtle",
          "bg-surface shadow-xl",
          "text-foreground",
        )}
      >
        <div
          className={cn(
            "flex-shrink-0 p-2 rounded-xl",
            "bg-surface-muted text-foreground",
          )}
        >
          <CheckCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground">
            {t({ he: "המכירה נרשמה בהצלחה", en: "Sale recorded successfully" })}
          </p>
          <p className="mt-1 text-sm text-foreground">{message}</p>
          {orderNumber && (
            <p className="mt-1 text-sm font-mono tabular-nums text-muted-foreground ltr">
              {t({ he: "מספר הזמנה:", en: "Order:" })} {orderNumber}
            </p>
          )}
          {total !== undefined && (
            <p className="mt-1 text-sm font-mono tabular-nums text-foreground ltr">
              {t({ he: "סכום:", en: "Total:" })} {formatPrice(total, locale)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            "flex-shrink-0 min-h-11 min-w-11 p-1.5 rounded-lg transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-surface",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          )}
          aria-label={t({ he: "סגור", en: "Dismiss" })}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
