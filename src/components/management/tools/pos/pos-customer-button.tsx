"use client";

import { cn } from "./pos-utils";
import { UserRound, UserPlus, Search } from "lucide-react";
import type { PosCustomer } from "./pos-types";
import type { Locale } from "@/lib/i18n";

interface PosCustomerButtonProps {
  locale: Locale;
  customer: PosCustomer | null;
  onChange: (customer: PosCustomer | null) => void;
  onOpenSheet: () => void;
  disabled?: boolean;
}

export function PosCustomerButton({
  locale,
  customer,
  onChange,
  onOpenSheet,
  disabled,
}: PosCustomerButtonProps) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];

  if (customer) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-3 rounded-xl border border-border-subtle bg-surface",
        )}
      >
        <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "font-medium truncate",
              he ? "text-right" : "text-left",
            )}
          >
            {customer.name}
          </p>
          <p
            className={cn(
              "text-xs text-muted-foreground truncate ltr",
              he ? "text-right" : "text-left",
            )}
          >
            {customer.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            "text-muted-foreground hover:text-red-400 hover:bg-red-500/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            "disabled:opacity-30",
          )}
          aria-label={t({ he: "הסר לקוח", en: "Remove customer" })}
        >
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenSheet}
      disabled={disabled}
      className={cn(
        "w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border-control",
        "bg-surface hover:border-primary/50 hover:bg-primary/5",
        "transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
      aria-label={t({ he: "בחר לקוח", en: "Select customer" })}
    >
      <UserPlus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-medium text-muted-foreground">
        {t({
          he: "לקוח מזדמן — לחץ לבחירת לקוח",
          en: "Walk-in customer — click to select customer",
        })}
      </span>
      <Search className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
    </button>
  );
}
