"use client";

import { useState, useEffect, useId, useRef } from "react";
import { Search, CheckCircle, UserRound } from "lucide-react";
import { cn } from "./pos-utils";
import { Dialog } from "@/components/management/ui/dialog";
import type { PosCustomer } from "./pos-types";
import type { Locale } from "@/lib/i18n";

interface CustomerAccount {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  account_status: string;
}
interface PosCustomerSheetProps {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  customer?: PosCustomer | null;
  onChange: (customer: PosCustomer | null) => void;
}

export function PosCustomerSheet({
  locale,
  open,
  onClose,
  customer = null,
  onChange,
}: PosCustomerSheetProps) {
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const searchId = useId();
  const errorId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [details, setDetails] = useState<PosCustomer>({
    name: "",
    email: "",
    phone: "",
  });
  const [detailsError, setDetailsError] = useState("");
  const requestRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setDetails(customer ?? { name: "", email: "", phone: "" });
      setSearchQuery("");
      setAccounts([]);
      setDetailsError("");
    }, 0);
    return () => clearTimeout(timer);
  }, [open, customer]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      try {
        const response = await fetch(
          `/api/management/customers?q=${encodeURIComponent(searchQuery.trim())}&limit=20&activeOnly=true`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.customers))
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : locale === "he"
                ? "חיפוש הלקוחות נכשל"
                : "Customer search failed",
          );
        if (controller.signal.aborted || request !== requestRef.current) return;
        setAccounts(data.customers);
      } catch (error) {
        if (controller.signal.aborted || request !== requestRef.current) return;
        setAccounts([]);
        setSearchError(
          error instanceof Error ? error.message : "Customer search failed",
        );
      } finally {
        if (!controller.signal.aborted && request === requestRef.current)
          setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, searchQuery, locale]);

  const select = (account: CustomerAccount) => {
    onChange({
      id: account.id,
      accountId: account.id,
      name: account.full_name || account.email,
      email: account.email,
      phone: account.phone || "",
    });
    onClose();
  };
  const saveDetails = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !details.name.trim() ||
      (details.email.trim() && !/^\S+@\S+\.\S+$/.test(details.email.trim()))
    ) {
      setDetailsError(
        t({
          he: "יש להזין שם וכתובת אימייל תקינה אם נמסרה.",
          en: "Enter a name and a valid email address if provided.",
        }),
      );
      return;
    }
    onChange({
      ...details,
      name: details.name.trim(),
      email: details.email.trim(),
      phone: details.phone.trim(),
    });
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t({ he: "פרטי הלקוח", en: "Customer details" })}
      description={t({
        he: "בחרו חשבון או הזינו פרטים למכירה הזו. אימייל הוא אופציונלי.",
        en: "Select an account or enter details for this sale. Email is optional.",
      })}
      closeLabel={t({ he: "סגור", en: "Close" })}
      size="lg"
    >
      <div dir={locale === "he" ? "rtl" : "ltr"} className="space-y-4">
        <button
          type="button"
          onClick={() => {
            onChange(null);
            onClose();
          }}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-control bg-surface p-3 text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <UserRound size={22} aria-hidden="true" />
          <span>
            {t({ he: "המשך כלקוח מזדמן", en: "Continue as walk-in customer" })}
          </span>
        </button>
        <div>
          <label htmlFor={searchId} className="text-sm font-medium">
            {t({ he: "חיפוש לקוח קיים", en: "Find an existing customer" })}
          </label>
          <div className="relative mt-1">
            <Search
              size={18}
              className="pointer-events-none absolute start-3 top-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={searchQuery}
              maxLength={200}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t({
                he: "שם, אימייל או טלפון",
                en: "Name, email or phone",
              })}
              className="h-11 w-full rounded-xl border border-border-control bg-surface-muted ps-10 pe-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              autoComplete="off"
            />
          </div>
        </div>
        <div aria-busy={loading} className="max-h-52 space-y-2 overflow-y-auto">
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t({ he: "מחפש לקוחות…", en: "Searching customers…" })}
            </p>
          ) : searchError ? (
            <p role="alert" className="text-sm text-foreground">
              {searchError}
            </p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t({ he: "לא נמצאו לקוחות", en: "No customers found" })}
            </p>
          ) : (
            accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => select(account)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface p-3 text-start hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                  customer?.accountId === account.id && "border-primary",
                )}
              >
                <UserRound size={20} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">
                    {account.full_name || account.email}
                  </span>
                  <span
                    className="block break-all text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {account.email}
                  </span>
                  {account.phone && (
                    <span
                      className="block text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      {account.phone}
                    </span>
                  )}
                </span>
                {customer?.accountId === account.id && (
                  <CheckCircle size={20} aria-hidden="true" />
                )}
              </button>
            ))
          )}
        </div>
        <form
          onSubmit={saveDetails}
          className="space-y-3 border-t border-border-subtle pt-4"
        >
          <p className="text-sm font-semibold">
            {details.accountId
              ? t({
                  he: "פרטים למכירה — החשבון לא ישתנה",
                  en: "Sale details — account stays unchanged",
                })
              : t({
                  he: "פרטים ללקוח ללא חשבון",
                  en: "Details for a customer without an account",
                })}
          </p>
          {(
            [
              ["name", { he: "שם", en: "Name" }, "text", 200],
              [
                "email",
                { he: "אימייל (אופציונלי)", en: "Email (optional)" },
                "email",
                254,
              ],
              [
                "phone",
                { he: "טלפון (אופציונלי)", en: "Phone (optional)" },
                "tel",
                30,
              ],
            ] as const
          ).map(([field, label, type, maxLength]) => (
            <label key={field} className="block text-sm">
              {label[locale]}
              <input
                type={type}
                value={details[field]}
                maxLength={maxLength}
                required={field === "name"}
                dir={field === "name" ? undefined : "ltr"}
                onChange={(event) => {
                  setDetails((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }));
                  setDetailsError("");
                }}
                aria-describedby={detailsError ? errorId : undefined}
                className="mt-1 h-11 w-full rounded-xl border border-border-control bg-surface-muted px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
            </label>
          ))}
          {detailsError && (
            <p id={errorId} role="alert" className="text-sm">
              {detailsError}
            </p>
          )}
          <button
            type="submit"
            className="min-h-11 w-full rounded-xl bg-primary px-3 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {t({ he: "השתמש בפרטים", en: "Use these details" })}
          </button>
        </form>
      </div>
    </Dialog>
  );
}
