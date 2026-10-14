"use client";

import { useEffect, useRef, useState } from "react";
import { FormField } from "../ui";
import { toAgorot } from "@/lib/commerce/money";
import {
  ActionButton,
  CommercePage,
  CommerceRow,
  RecordTable,
  RefreshAction,
  SectionCard,
  SectionFeedback,
  SectionState,
  StatusText,
  operationKey,
  useCommerceAccess,
  useCommerceSection,
} from "./commerce-common";
import styles from "./commerce.module.css";
import { AnimatedMetricValue } from "@/components/motion/animated-number";

type Locale = "he" | "en";
const text = (row: CommerceRow | null | undefined, key: string) => {
  const value = row?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "—";
};
const currencyAmount = (agorot: unknown, currency: unknown, locale: Locale) => {
  if (typeof agorot !== "number" || !Number.isSafeInteger(agorot)) return "—";
  try {
    return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
      style: "currency",
      currency: typeof currency === "string" ? currency : "ILS",
    }).format(agorot / 100);
  } catch {
    return `₪ ${(agorot / 100).toFixed(2)}`;
  }
};
const reportLabel = (key: string, locale: Locale) => {
  const labels: Record<string, { he: string; en: string }> = {
    from: { he: "מתאריך", en: "Period from" },
    to: { he: "עד תאריך", en: "Period to" },
    period_from: { he: "מתאריך", en: "Period from" },
    period_to: { he: "עד תאריך", en: "Period to" },
    timezone: { he: "אזור זמן", en: "Timezone" },
    date_basis: { he: "בסיס תאריך", en: "Date basis" },
    orders_count: { he: "מספר הזמנות", en: "Orders count" },
    orders_total_agorot: {
      he: "סך הזמנות ברוטו (₪)",
      en: "Orders gross total (ILS)",
    },
    expenses_count: { he: "מספר הוצאות", en: "Expenses count" },
    expenses_gross_agorot: {
      he: "סך הוצאות ברוטו (₪)",
      en: "Expenses gross total (ILS)",
    },
    provider_captured_agorot: {
      he: "גבייה מאומתת דרך ספק (₪)",
      en: "Provider captured (ILS)",
    },
    sandbox_captured_agorot: {
      he: "גבייה בסביבת בדיקה — לא כסף אמיתי (₪)",
      en: "Sandbox captured — test funds, not real money (ILS)",
    },
    manual_recorded_agorot: {
      he: "תשלומים חיצוניים שנרשמו (₪)",
      en: "Manual recorded tenders (ILS)",
    },
    refunds_succeeded_agorot: {
      he: "החזרים שאומתו (₪)",
      en: "Verified refunds (ILS)",
    },
    settlement_gross_agorot: {
      he: "ברוטו בסליקה (₪)",
      en: "Settlement gross (ILS)",
    },
    settlement_fee_agorot: {
      he: "עמלות סליקה (₪)",
      en: "Settlement fees (ILS)",
    },
    settlement_net_agorot: { he: "נטו בסליקה (₪)", en: "Settlement net (ILS)" },
    exceptions_count: { he: "חריגים לבדיקה", en: "Exceptions to review" },
    outbox_pending_count: {
      he: "השפעות ממתינות",
      en: "Pending outbox effects",
    },
    scope: { he: "היקף נתונים", en: "Data scope" },
    operations_scope: { he: "היקף תפעולי", en: "Operations scope" },
    collection_date_basis: {
      he: "בסיס תאריך גבייה",
      en: "Collection date basis",
    },
    refund_date_basis: { he: "בסיס תאריך החזר", en: "Refund date basis" },
    settlement_date_basis: {
      he: "בסיס תאריך סליקה",
      en: "Settlement date basis",
    },
  };
  return labels[key]?.[locale] ?? key.replaceAll("_", " ");
};

const reportValue = (key: string, value: unknown, locale: Locale) => {
  const bases: Record<string, { he: string; en: string }> = {
    attempt_created_at: {
      he: "תאריך יצירת ניסיון התשלום",
      en: "Payment attempt creation date",
    },
    last_verified_update_at: {
      he: "מועד עדכון החזר מאומת אחרון",
      en: "Last verified refund update",
    },
    settled_at: { he: "תאריך הסליקה", en: "Settlement date" },
  };
  if (typeof value === "string" && bases[value]) return bases[value][locale];
  if (key === "operations_scope") {
    return locale === "he"
      ? "גבייה מאומתת בסביבת production; sandbox ותשלומים ידניים מוצגים בנפרד. תאריכי הגבייה, ההחזרים והסליקה משתמשים בבסיסים המוצגים. מונה המשימות הממתינות הוא מצב נוכחי. לא כולל chargebacks, דיווחים לרשויות או תנועות בנק שלא נרשמו."
      : "Production-verified collections; sandbox and manually recorded payments are reported separately. Collection, refund and settlement dates use the bases shown. Pending jobs are a current backlog count. Excludes chargebacks, regulatory filings and unrecorded bank movements.";
  }
  return String(value ?? "—");
};
const paymentMethodLabel = (value: string, locale: Locale) => {
  const labels: Record<string, { he: string; en: string }> = {
    cash: { he: "מזומן", en: "Cash" },
    credit_card: { he: "כרטיס אשראי", en: "Credit card" },
    bit: { he: "Bit", en: "Bit" },
    bank_transfer: { he: "העברה בנקאית", en: "Bank transfer" },
    check: { he: "המחאה", en: "Check" },
    other: { he: "אחר", en: "Other" },
  };
  return labels[value]?.[locale] ?? value;
};
const collectionKindLabel = (value: string, locale: Locale) => {
  const labels: Record<string, { he: string; en: string }> = {
    provider_collected: { he: "נגבה דרך ספק", en: "Provider collected" },
    manual_recorded: {
      he: "תשלום חיצוני שנרשם",
      en: "External payment recorded",
    },
    manual: { he: "תשלום חיצוני שנרשם", en: "External payment recorded" },
  };
  return (
    labels[value]?.[locale] ??
    (value === "—" ? value : value.replaceAll("_", " "))
  );
};
const documentTypeLabel = (value: string, locale: Locale) => {
  const labels: Record<string, { he: string; en: string }> = {
    quote: { he: "הצעת מחיר", en: "Quote" },
    proforma: { he: "חשבון עסקה", en: "Pro forma" },
    receipt: { he: "קבלה", en: "Receipt" },
    invoice: { he: "חשבונית", en: "Invoice" },
    transaction_invoice: { he: "חשבונית עסקה", en: "Transaction invoice" },
    tax_invoice: { he: "חשבונית מס", en: "Tax invoice" },
    invoice_receipt: { he: "חשבונית מס קבלה", en: "Tax invoice receipt" },
    tax_invoice_receipt: { he: "חשבונית מס קבלה", en: "Tax invoice receipt" },
    credit_note: { he: "הודעת זיכוי", en: "Credit note" },
    correction: { he: "מסמך תיקון", en: "Correction" },
  };
  return labels[value]?.[locale] ?? value;
};

export function IntegrationsWorkspace({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const access = useCommerceAccess();
  const { rows, payload, loading, error, notice, load } =
    useCommerceSection("integrations");
  const settings = useCommerceSection("settings");
  const [revision, setRevision] = useState(0);
  const [identity, setIdentity] = useState<Record<string, unknown>>({});
  const set = (key: string, value: unknown) =>
    setIdentity((old) => ({ ...old, [key]: value }));
  const current = settings.rows[0] ?? {};
  const savedIdentity = (
    current.identity && typeof current.identity === "object"
      ? current.identity
      : current
  ) as CommerceRow;
  const field = (key: string) => identity[key] ?? savedIdentity[key] ?? "";
  const canEdit = access.allowed("manageSettings");
  const fields = [
    "legal_name",
    "trade_name",
    "registration_number",
    "vat_number",
    "phone",
    "email",
  ];
  const submit = async () => {
    const address = {
      street: "",
      city: "",
      postal_code: "",
      country: "IL",
      ...(savedIdentity.address && typeof savedIdentity.address === "object"
        ? (savedIdentity.address as CommerceRow)
        : {}),
      ...(identity.address && typeof identity.address === "object"
        ? (identity.address as CommerceRow)
        : {}),
    };
    const normalizedPatch: CommerceRow = { ...identity, address };
    const result = await settings.runAction("settings_save", {
      expected_revision:
        revision ||
        Number(current.revision) ||
        Number(settings.payload?.revision) ||
        0,
      patch: normalizedPatch,
    });
    if (result) {
      setIdentity({});
      setRevision(Number(result.revision) || Number(current.revision) + 1);
      await Promise.all([load(), settings.load()]);
    }
  };
  const readiness =
    payload?.runtime ??
    payload?.readiness ??
    settings.payload?.readiness ??
    current.readiness;
  return (
    <CommercePage
      locale={locale}
      title={he ? "זהות עסקית ושילובים" : "Business identity & integrations"}
      subtitle={
        he
          ? "פרטי העסק נשמרים עם גרסה. סטטוסי ספקים מוצגים בלי לחשוף סודות או פרטי התחברות."
          : "Business identity is versioned. Provider status is shown without exposing credentials."
      }
      actions={
        <RefreshAction
          locale={locale}
          loading={loading || settings.loading}
          onRefresh={() => void Promise.all([load(), settings.load()])}
        />
      }
    >
      <SectionFeedback
        notice={settings.notice ?? notice}
        setNotice={settings.setNotice}
        locale={locale}
      />
      <SectionState
        loading={loading || settings.loading}
        error={error ?? settings.error}
        onRetry={() => void Promise.all([load(), settings.load()])}
        locale={locale}
      >
        <div className={styles.stack}>
          <SectionCard
            title={he ? "זהות העסק במסמכים" : "Business identity for documents"}
            description={
              he
                ? "מנהל יכול לצפות. עריכה דורשת הרשאת מנכ״ל; דגלי מוכנות רשמיים נקבעים בצד השרת בלבד."
                : "Admins can view. Editing requires CEO authorization; official readiness flags are server-controlled."
            }
          >
            {canEdit ? (
              <div className={styles.grid3}>
                {fields.map((key) => (
                  <FormField key={key} label={key.replaceAll("_", " ")}>
                    {(p) => (
                      <input
                        {...p}
                        className={styles.fieldInput}
                        dir={key.includes("number") ? "ltr" : undefined}
                        value={String(field(key) ?? "")}
                        onChange={(e) => set(key, e.target.value || null)}
                      />
                    )}
                  </FormField>
                ))}
                <FormField label={he ? "סוג ישות" : "Entity kind"}>
                  {(p) => (
                    <select
                      {...p}
                      className={styles.fieldSelect}
                      value={String(field("entity_kind") || "")}
                      onChange={(e) =>
                        set("entity_kind", e.target.value || null)
                      }
                    >
                      <option value="">
                        {he ? "לא הוגדר" : "Unspecified"}
                      </option>
                      <option value="exempt">עוסק פטור / exempt</option>
                      <option value="registered">
                        עוסק מורשה / registered
                      </option>
                      <option value="company">חברה / company</option>
                    </select>
                  )}
                </FormField>
                {["street", "city", "postal_code"].map((key) => (
                  <FormField key={key} label={key.replaceAll("_", " ")}>
                    {(p) => (
                      <input
                        {...p}
                        className={styles.fieldInput}
                        value={String(
                          (field("address") as CommerceRow | undefined)?.[
                            key
                          ] ?? "",
                        )}
                        onChange={(e) =>
                          set("address", {
                            ...((identity.address as CommerceRow | undefined) ??
                              (savedIdentity.address as
                                CommerceRow | undefined) ??
                              {}),
                            [key]: e.target.value,
                            country: "IL",
                          })
                        }
                      />
                    )}
                  </FormField>
                ))}
                <FormField label={he ? "שפת מסמכים" : "Document language"}>
                  {(p) => (
                    <select
                      {...p}
                      className={styles.fieldSelect}
                      value={String(field("document_language") || "he")}
                      onChange={(e) => set("document_language", e.target.value)}
                    >
                      <option value="he">עברית</option>
                      <option value="en">English</option>
                    </select>
                  )}
                </FormField>
                <FormField
                  label={he ? "המחירים כוללים מע״מ" : "Prices include VAT"}
                >
                  {(p) => (
                    <select
                      {...p}
                      className={styles.fieldSelect}
                      value={String(field("prices_include_vat") ?? false)}
                      onChange={(e) =>
                        set("prices_include_vat", e.target.value === "true")
                      }
                    >
                      <option value="false">{he ? "לא" : "No"}</option>
                      <option value="true">{he ? "כן" : "Yes"}</option>
                    </select>
                  )}
                </FormField>
              </div>
            ) : (
              <dl className={styles.grid2}>
                {[
                  ...fields,
                  "entity_kind",
                  "address",
                  "document_language",
                  "prices_include_vat",
                ].map((k) => (
                  <div key={k}>
                    <dt className={styles.subtle}>{k.replaceAll("_", " ")}</dt>
                    <dd>
                      {typeof savedIdentity[k] === "object"
                        ? JSON.stringify(savedIdentity[k])
                        : String(savedIdentity[k] ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {canEdit ? (
              <ActionButton
                label={he ? "שמירת זהות עסקית" : "Save business identity"}
                kind="primary"
                disabled={settings.saving || Object.keys(identity).length === 0}
                onClick={() => void submit()}
              />
            ) : null}
          </SectionCard>
          <SectionCard
            title={he ? "מוכנות ומצב מערכת" : "Readiness and service status"}
            description={
              he
                ? "מוכנות תשלומים והנפקה תלויה באישורי ספק ועסק. אין להזין כאן סודות."
                : "Payment and issuance readiness depends on provider and business approval. Do not enter secrets here."
            }
          >
            {readiness && typeof readiness === "object" ? (
              <pre className={styles.helpText}>
                {Object.entries(readiness as CommerceRow)
                  .map(
                    ([k, v]) =>
                      `${k.replaceAll("_", " ")}: ${typeof v === "boolean" ? (v ? (he ? "כן" : "Yes") : he ? "לא" : "No") : String(v ?? "—")}`,
                  )
                  .join("\n")}
              </pre>
            ) : (
              <p className={styles.subtle}>
                {he
                  ? "סטטוס מוכנות לא סופק על ידי השרת."
                  : "The server did not provide readiness details."}
              </p>
            )}
            {rows.filter((r) => !r.identity).length ? (
              <RecordTable
                columns={[
                  {
                    key: "name",
                    label: he ? "יכולת" : "Capability",
                    render: (r) => text(r, "name"),
                  },
                  {
                    key: "status",
                    label: he ? "מצב" : "Status",
                    render: (r) => (
                      <StatusText value={r.status ?? r.state} locale={locale} />
                    ),
                  },
                  {
                    key: "updated_at",
                    label: he ? "עודכן" : "Updated",
                    render: (r) => text(r, "updated_at"),
                  },
                ]}
                rows={rows.filter((r) => !r.identity)}
                locale={locale}
                empty={
                  he
                    ? "אין יכולות ספק נוספות"
                    : "No provider capabilities returned"
                }
              />
            ) : null}
            <p className={styles.helpText}>
              {he
                ? "אישורי מסוף ופרטי סביבה מוגדרים מחוץ לממשק. פנו למנהל הטכני כדי לסובב סודות; אין להעתיק אותם לתמיכה או למסך זה."
                : "Terminal credentials and environment secrets are configured outside this interface. Ask the technical owner to rotate them; never paste secrets into this screen or support messages."}
            </p>
          </SectionCard>
        </div>
      </SectionState>
    </CommercePage>
  );
}

export function CommerceReadWorkspace({
  locale,
  section,
  variant,
}: {
  locale: Locale;
  section: "documents" | "report";
  variant: "documents" | "reports";
}) {
  const he = locale === "he";
  const access = useCommerceAccess();
  const {
    rows,
    payload,
    loading,
    saving,
    error,
    notice,
    setNotice,
    load,
    runAction,
  } = useCommerceSection(section);
  const identityData = useCommerceSection(
    variant === "documents" ? "settings" : "payments",
  );
  const [selection, setSelection] = useState<CommerceRow | null>(null);
  const [type, setType] = useState("receipt");
  const [refId, setRefId] = useState("");
  const [orders, setOrders] = useState<CommerceRow[]>([]);
  const [intents, setIntents] = useState<CommerceRow[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportTab, setReportTab] = useState<"summary" | "payments">("summary");
  const selectedDocumentId = selection ? text(selection, "id") : "";
  useEffect(() => {
    if (variant !== "documents") return;
    const controller = new AbortController();
    // This state mirrors the pending read; the result is handled asynchronously below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSourceLoading(true);
    Promise.all([
      fetch("/api/management/sales?limit=100", {
        cache: "no-store",
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/management/commerce/intents?limit=100", {
        cache: "no-store",
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([sales, intentResult]) => {
        if (controller.signal.aborted) return;
        if (
          !sales ||
          !intentResult ||
          !Array.isArray(sales.orders) ||
          !Array.isArray(intentResult.rows)
        ) {
          setSourceError(true);
          setOrders([]);
          setIntents([]);
          return;
        }
        setSourceError(false);
        setOrders(
          Array.isArray(sales?.orders)
            ? sales.orders.filter(
                (r: unknown): r is CommerceRow =>
                  typeof r === "object" && r !== null,
              )
            : [],
        );
        setIntents(
          Array.isArray(intentResult?.rows)
            ? intentResult.rows.filter(
                (r: unknown): r is CommerceRow =>
                  typeof r === "object" && r !== null,
              )
            : [],
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSourceError(true);
          setOrders([]);
          setIntents([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourceLoading(false);
      });
    return () => controller.abort();
  }, [variant]);
  const columns = [
    {
      key: "number",
      label: he ? "מספר" : "Number",
      render: (r: CommerceRow) => text(r, "number") || text(r, "id"),
    },
    {
      key: "type",
      label: he ? "סוג" : "Type",
      render: (r: CommerceRow) =>
        documentTypeLabel(
          text(r, "type") !== "—" ? text(r, "type") : text(r, "document_type"),
          locale,
        ),
    },
    {
      key: "created_at",
      label: he ? "נוצר" : "Created",
      render: (r: CommerceRow) => text(r, "created_at"),
    },
    {
      key: "amount",
      label: he ? "סכום" : "Amount",
      render: (r: CommerceRow) =>
        typeof r.amount_agorot === "number" ||
        typeof r.total_agorot === "number"
          ? `₪ ${(((r.amount_agorot ?? r.total_agorot) as number) / 100).toFixed(2)}`
          : typeof r.orders_total_agorot === "number" ||
              typeof r.expenses_gross_agorot === "number"
            ? `${he ? "מכירות" : "Sales"} ₪${(((r.orders_total_agorot ?? 0) as number) / 100).toFixed(2)} · ${he ? "הוצאות" : "Expenses"} ₪${(((r.expenses_gross_agorot ?? 0) as number) / 100).toFixed(2)}`
            : "—",
    },
    {
      key: "status",
      label: he ? "מצב" : "Status",
      render: (r: CommerceRow) => (
        <StatusText value={r.status ?? r.state} locale={locale} />
      ),
    },
  ];
  const title =
    variant === "documents"
      ? he
        ? "מסמכים ומספרים"
        : "Documents & numbering"
      : he
        ? "דוחות מסחר"
        : "Commerce reports";
  const exportCsv = () => {
    const safe = (v: unknown) => {
      let value = String(v ?? "");
      if (/^[\u0000-\u0020]*[=+\-@]/.test(value)) value = `'${value}`;
      return `"${value.replaceAll('"', '""')}"`;
    };
    const reportSummary = variant === "reports" ? payload?.summary : undefined;
    const csv =
      reportSummary && Object.keys(reportSummary).length
        ? [
            Object.keys(reportSummary)
              .map((key) => safe(reportLabel(key, locale)))
              .join(","),
            Object.values(reportSummary)
              .map((value, index) => {
                const key = Object.keys(reportSummary)[index];
                return safe(
                  typeof value === "number" && key.endsWith("_agorot")
                    ? (value / 100).toFixed(2)
                    : reportValue(key, value, locale),
                );
              })
              .join(","),
          ].join("\r\n")
        : [
            columns.map((c) => safe(c.label)).join(","),
            ...rows.map((r) =>
              columns
                .map((c) => {
                  const key =
                    c.key === "amount"
                      ? typeof r.amount_agorot === "number"
                        ? "amount_agorot"
                        : typeof r.total_agorot === "number"
                          ? "total_agorot"
                          : "amount"
                      : c.key;
                  const value =
                    key === "amount"
                      ? (r.orders_total_agorot ?? r.expenses_gross_agorot)
                      : r[key];
                  return safe(
                    value === null ||
                      value === undefined ||
                      typeof value === "object"
                      ? ""
                      : typeof value === "number" && key.endsWith("_agorot")
                        ? (value / 100).toFixed(2)
                        : value,
                  );
                })
                .join(","),
            ),
          ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `miro-${variant}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <CommercePage
      locale={locale}
      title={title}
      subtitle={
        variant === "documents"
          ? he
            ? "מסמכי מקור נשמרים כצילום מצב בלתי ניתן לעריכה; הקצאת מספר רשמי תתאפשר רק כשהשרת מדווח על מוכנות."
            : "Source documents are immutable snapshots. Official number reservation is gated by server readiness."
          : he
            ? "הנתונים נשארים בהיקף שהוחזר: מכירות, תשלומים והוצאות. אין להציג זאת כרווח נקי או כהתאמה בנקאית."
            : "Data remains within the returned sales, payments and expenses scope. This is not net profit or bank reconciliation."
      }
      actions={
        <RefreshAction
          locale={locale}
          loading={loading}
          onRefresh={() =>
            void load({
              ...(from
                ? { from: new Date(`${from}T00:00:00Z`).toISOString() }
                : {}),
              ...(to ? { to: new Date(`${to}T23:59:59Z`).toISOString() } : {}),
            })
          }
        />
      }
    >
      <SectionFeedback notice={notice} setNotice={setNotice} locale={locale} />
      {variant === "reports" ? (
        <div
          className={styles.actionRow}
          role="tablist"
          aria-label={he ? "תצוגת דוח" : "Report view"}
        >
          <button
            type="button"
            role="tab"
            aria-selected={reportTab === "summary"}
            className="mgmt-button mgmt-button--secondary"
            onClick={() => setReportTab("summary")}
          >
            {he ? "סיכום" : "Summary"}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reportTab === "payments"}
            className="mgmt-button mgmt-button--secondary"
            onClick={() => setReportTab("payments")}
          >
            {he ? "תשלומים והחזרים" : "Payments & refunds"}
          </button>
        </div>
      ) : null}
      <SectionState
        loading={loading || (variant === "documents" && identityData.loading)}
        error={error ?? (variant === "documents" ? identityData.error : null)}
        onRetry={() =>
          void Promise.all([
            load(),
            variant === "documents"
              ? identityData.load()
              : Promise.resolve(true),
          ])
        }
        locale={locale}
      >
        {variant === "reports" && reportTab === "payments" ? (
          <PaymentsHistory locale={locale} />
        ) : (
          <div className={styles.stack}>
            {variant === "reports" ? (
              <SectionCard title={he ? "טווח הדוח" : "Report range"}>
                <div className={styles.grid3}>
                  <FormField label={he ? "מתאריך" : "From"}>
                    {(p) => (
                      <input
                        {...p}
                        type="date"
                        className={styles.fieldInput}
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label={he ? "עד תאריך" : "To"}>
                    {(p) => (
                      <input
                        {...p}
                        type="date"
                        className={styles.fieldInput}
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    )}
                  </FormField>
                  <ActionButton
                    label={he ? "עדכון" : "Refresh report"}
                    disabled={loading}
                    onClick={() =>
                      void load({
                        ...(from
                          ? {
                              from: new Date(`${from}T00:00:00Z`).toISOString(),
                            }
                          : {}),
                        ...(to
                          ? { to: new Date(`${to}T23:59:59Z`).toISOString() }
                          : {}),
                      })
                    }
                  />
                </div>
                {sourceError ? (
                  <p className={styles.helpText} role="alert">
                    {he
                      ? "לא ניתן לטעון הזמנות וכוונות. נסו לרענן את הדף לפני יצירת טיוטה."
                      : "Orders and intents could not be loaded. Refresh before creating a draft."}
                  </p>
                ) : null}
                <pre className={styles.helpText}>
                  {payload?.summary
                    ? Object.entries(payload.summary).map(([k, v], index) => (
                        <span key={k}>
                          {index > 0 ? "\n" : ""}
                          {reportLabel(k, locale)}:{" "}
                          {typeof v === "number" &&
                          (k.endsWith("_count") || k.endsWith("_agorot")) ? (
                            <AnimatedMetricValue
                              value={
                                k.endsWith("_agorot")
                                  ? currencyAmount(v, "ILS", locale)
                                  : reportValue(k, v, locale)
                              }
                            />
                          ) : (
                            reportValue(k, v, locale)
                          )}
                        </span>
                      ))
                    : he
                      ? "השרת לא החזיר סיכום."
                      : "No summary returned by the server."}
                </pre>
                {variant === "reports" ? (
                  <p className={styles.helpText}>
                    {he
                      ? "היקף: הזמנות ומכירות, גבייה מאומתת ב-production, sandbox ותשלומים ידניים בנפרד, החזרים מאומתים וסליקות. מספר המשימות הממתינות הוא backlog נוכחי ולא טווח התאריכים. התאריכים מבוססים על יצירת ניסיון תשלום, עדכון החזר מאומת ותאריך סליקה, לפי השורה. לא כולל chargebacks, דיווח לרשויות או תנועות בנק שלא נרשמו; אין להציג כרווח נקי או כהתאמה בנקאית."
                      : "Scope: orders and sales, production-verified collections, sandbox and manual tenders separately, verified refunds, and settlements. Pending jobs are a current backlog count, not a period total. Dates use payment-attempt creation, verified refund update, and settlement date as labeled. Excludes chargebacks, regulatory filings, and unrecorded bank movements; this is not net profit or bank reconciliation."}
                  </p>
                ) : null}
                {UUID.test(selectedDocumentId) ? (
                  <div className={styles.actionRow}>
                    {(["a4", "receipt80"] as const).map((layout) => (
                      <span key={layout} className={styles.actionRow}>
                        <a
                          className="mgmt-button mgmt-button--secondary"
                          href={`/api/management/commerce/documents/${encodeURIComponent(selectedDocumentId)}/preview?layout=${layout}&format=html`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {he
                            ? `תצוגה · ${layout === "a4" ? "A4" : "80 מ״מ"}`
                            : `Preview · ${layout === "a4" ? "A4" : "80 mm"}`}
                        </a>
                        <a
                          className="mgmt-button mgmt-button--secondary"
                          href={`/api/management/commerce/documents/${encodeURIComponent(selectedDocumentId)}/preview?layout=${layout}&format=pdf`}
                        >
                          {he
                            ? `הורדת PDF · ${layout === "a4" ? "A4" : "80 מ״מ"}`
                            : `Download PDF · ${layout === "a4" ? "A4" : "80 mm"}`}
                        </a>
                      </span>
                    ))}
                  </div>
                ) : null}
                <ActionButton
                  label={he ? "הורדת CSV" : "Download CSV"}
                  onClick={exportCsv}
                />
              </SectionCard>
            ) : (
              <SectionCard
                title={he ? "מסמכים" : "Documents"}
                description={
                  he
                    ? "מספרים לא מוקצים במסך הזה. טיוטה נוצרת רק מהזמנה או כוונת מכירה קיימת."
                    : "This screen does not assign numbers. Drafts can only be created from an existing order or sales intent."
                }
              >
                <div className={styles.grid3}>
                  <FormField label={he ? "סוג מסמך" : "Document type"}>
                    {(p) => (
                      <select
                        {...p}
                        className={styles.fieldSelect}
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                      >
                        {[
                          ["quote", he ? "הצעת מחיר" : "Quote"],
                          [
                            "transaction_invoice",
                            he ? "חשבונית עסקה" : "Transaction invoice",
                          ],
                          ["tax_invoice", he ? "חשבונית מס" : "Tax invoice"],
                          ["receipt", he ? "קבלה" : "Receipt"],
                          [
                            "tax_invoice_receipt",
                            he ? "חשבונית מס קבלה" : "Tax invoice receipt",
                          ],
                        ].map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                  <FormField
                    label={
                      type === "quote"
                        ? he
                          ? "כוונת מכירה קיימת"
                          : "Existing sales intent"
                        : he
                          ? "הזמנה קיימת"
                          : "Existing order"
                    }
                    required
                  >
                    {(p) => (
                      <select
                        {...p}
                        className={styles.fieldSelect}
                        value={refId}
                        onChange={(e) => setRefId(e.target.value)}
                        disabled={sourceLoading}
                      >
                        <option value="">
                          {sourceLoading
                            ? he
                              ? "טוען…"
                              : "Loading…"
                            : he
                              ? "בחירה מהרשימה"
                              : "Choose a record"}
                        </option>
                        {(type === "quote" ? intents : orders).map((row) => {
                          const id = text(row, "id");
                          const orderNumber = text(row, "order_number");
                          const number =
                            orderNumber !== "—" ? orderNumber : id.slice(0, 8);
                          const snapshot =
                            row.customer_snapshot &&
                            typeof row.customer_snapshot === "object"
                              ? (row.customer_snapshot as CommerceRow)
                              : {};
                          const customerName = text(row, "customer_name");
                          const name =
                            customerName !== "—"
                              ? customerName
                              : text(snapshot, "name") !== "—"
                                ? text(snapshot, "name")
                                : text(row, "name");
                          const total =
                            typeof row.total_agorot === "number"
                              ? ` · ₪${((row.total_agorot as number) / 100).toFixed(2)}`
                              : typeof row.total === "number"
                                ? ` · ₪${row.total.toFixed(2)}`
                                : "";
                          return (
                            <option
                              key={id}
                              value={id}
                            >{`${number} · ${name}${total}`}</option>
                          );
                        })}
                      </select>
                    )}
                  </FormField>
                  <ActionButton
                    label={he ? "יצירת טיוטת מסמך" : "Create document draft"}
                    kind="primary"
                    disabled={
                      saving ||
                      sourceLoading ||
                      !access.allowed("issueDocuments") ||
                      !refId
                    }
                    onClick={() => {
                      const isUuid =
                        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                          refId,
                        );
                      if (!isUuid) return;
                      void runAction("document_draft", {
                        [type === "quote" ? "intent_id" : "order_id"]: refId,
                        type,
                        expected_business_revision:
                          Number(identityData.rows[0]?.revision) ||
                          Number(identityData.payload?.revision) ||
                          Number(payload?.readiness?.business_revision) ||
                          Number(payload?.revision) ||
                          0,
                      });
                    }}
                  />
                </div>
                <p className={styles.helpText}>
                  {he
                    ? "מסמכים רשמיים דורשים זהות עסקית ומוכנות לפי השרת. בדקו את הפרטים לפני הקצאת מספר."
                    : "Official documents require business identity and server readiness. Review details before number reservation."}
                </p>
              </SectionCard>
            )}
            <SectionCard
              title={
                variant === "documents"
                  ? he
                    ? "מסמכים שהוחזרו"
                    : "Returned documents"
                  : he
                    ? "נתוני הדוח"
                    : "Report data"
              }
              actions={
                variant === "reports" ? (
                  <ActionButton
                    label={he ? "CSV" : "CSV"}
                    onClick={exportCsv}
                  />
                ) : null
              }
            >
              <RecordTable
                columns={columns}
                rows={rows}
                locale={locale}
                empty={
                  he
                    ? "אין רשומות בטווח שנבחר."
                    : "No records in the selected range."
                }
                onSelect={setSelection}
              />
            </SectionCard>
            {variant === "documents" && selection ? (
              <SectionCard
                title={
                  he ? "פרטי מסמך (צילום מצב)" : "Document details (snapshot)"
                }
              >
                <pre className={styles.helpText}>
                  {Object.entries(selection)
                    .filter(([k]) => !/(url|secret|token|storage_key)/i.test(k))
                    .map(
                      ([k, v]) =>
                        `${k.replaceAll("_", " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}`,
                    )
                    .join("\n")}
                </pre>
                {selection.readiness === true &&
                access.allowed("issueDocuments") ? (
                  <ActionButton
                    label={he ? "הקצאת מספר" : "Reserve number"}
                    kind="primary"
                    disabled={saving}
                    onClick={() =>
                      void runAction("document_reserve", {
                        document_id: text(selection, "id"),
                        expected_revision: Number(selection.revision) || 0,
                      })
                    }
                  />
                ) : (
                  <p className={styles.subtle}>
                    {he
                      ? "השרת לא אישר מוכנות להקצאה רשמית."
                      : "The server has not confirmed readiness for official reservation."}
                  </p>
                )}
              </SectionCard>
            ) : null}
          </div>
        )}
      </SectionState>
    </CommercePage>
  );
}

function PaymentsHistory({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const access = useCommerceAccess();
  const { rows, loading, error, load } = useCommerceSection("payments");
  const [selected, setSelected] = useState<CommerceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [effect, setEffect] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconcilingRefundId, setReconcilingRefundId] = useState<string | null>(
    null,
  );
  const reconcilingRefundRef = useRef<string | null>(null);
  const [refundOutcomeUnknown, setRefundOutcomeUnknown] = useState(false);
  const refreshPayments = async () => {
    const ok = await load();
    if (ok) {
      if (refundOutcomeUnknown) setSelected(null);
      setRefundOutcomeUnknown(false);
    }
  };
  const columns = [
    {
      key: "id",
      label: he ? "תשלום" : "Payment",
      render: (r: CommerceRow) => text(r, "id").slice(0, 8),
    },
    {
      key: "intent_id",
      label: he ? "כוונה" : "Intent",
      render: (r: CommerceRow) => text(r, "intent_id").slice(0, 8),
    },
    {
      key: "method",
      label: he ? "שיטה" : "Method",
      render: (r: CommerceRow) => paymentMethodLabel(text(r, "method"), locale),
    },
    {
      key: "amount_agorot",
      label: he ? "סכום" : "Amount",
      render: (r: CommerceRow) =>
        currencyAmount(r.amount_agorot, r.currency, locale),
    },
    {
      key: "state",
      label: he ? "מצב" : "State",
      render: (r: CommerceRow) => (
        <StatusText value={r.state ?? r.status} locale={locale} />
      ),
    },
    {
      key: "collection_kind",
      label: he ? "מקור גבייה" : "Collection",
      render: (r: CommerceRow) =>
        collectionKindLabel(text(r, "collection_kind"), locale),
    },
    {
      key: "refunds",
      label: he ? "החזרים" : "Refunds",
      render: (r: CommerceRow) =>
        Array.isArray(r.refunds) ? String(r.refunds.length) : "0",
    },
  ];
  const refund = async () => {
    if (!selected || busy) return;
    let cents = 0;
    try {
      cents = toAgorot(amount.replace(/,/g, ""));
    } catch {
      cents = 0;
    }
    if (!Number.isSafeInteger(cents) || cents <= 0 || !reason.trim()) {
      setNotice(
        he ? "הזינו סכום וסיבה תקינים." : "Enter a valid amount and reason.",
      );
      return;
    }
    const fingerprint = `${text(selected, "id")}:${cents}:${reason.trim()}`;
    const current =
      effect?.fingerprint === fingerprint
        ? effect
        : { fingerprint, key: operationKey() };
    setEffect(current);
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/management/commerce/refunds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          attempt_id: text(selected, "id"),
          amount_agorot: cents,
          reason: reason.trim(),
          idempotency_key: current.key,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (
          response.status >= 500 ||
          result?.code === "write_unknown" ||
          result?.error === "commerce_unavailable"
        )
          setRefundOutcomeUnknown(true);
        setNotice(
          typeof result?.error === "string"
            ? result.error
            : he
              ? "לא ניתן לרשום החזר."
              : "Refund request failed.",
        );
        return;
      }
      if (result?.state === "succeeded" || result?.ok === true) {
        setNotice(
          he ? "ההחזר אומת בצד השרת." : "Refund was verified by the server.",
        );
        setEffect(null);
        setSelected(null);
        await load();
      } else {
        setRefundOutcomeUnknown(true);
        setNotice(
          he
            ? "ההחזר אינו סופי. בדקו היסטוריה והתאמה לפני פעולה נוספת."
            : "Refund is unresolved. Reconcile history before taking further action.",
        );
      }
    } catch {
      setRefundOutcomeUnknown(true);
      setNotice(
        he
          ? "תוצאת ההחזר אינה ידועה. בדקו היסטוריה לפני ניסיון נוסף."
          : "Refund outcome is unknown. Check history before retrying.",
      );
    } finally {
      setBusy(false);
    }
  };
  const checkRefundStatus = async (refundId: string) => {
    if (
      access.role !== "ceo" ||
      !refundId ||
      busy ||
      reconcilingRefundRef.current
    )
      return;
    reconcilingRefundRef.current = refundId;
    setReconcilingRefundId(refundId);
    setNotice("");
    try {
      const response = await fetch("/api/management/commerce/refunds", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ refund_id: refundId }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.state === "succeeded") {
        setNotice(
          he
            ? "מצב ההחזר אומת מול הספק; היסטוריית התשלומים רועננה."
            : "Refund status was verified with the provider; payment history was refreshed.",
        );
        setRefundOutcomeUnknown(false);
        await load();
        setSelected(null);
        return;
      }
      setRefundOutcomeUnknown(true);
      setNotice(
        he
          ? "הספק לא סיפק אישור סופי. ההחזר נשאר לבדיקה; אין לשלוח בקשת החזר נוספת. אפשר לבדוק שוב מאוחר יותר."
          : "The provider did not return final confirmation. The refund remains unresolved; do not submit another refund request. You can check again later.",
      );
    } catch {
      setRefundOutcomeUnknown(true);
      setNotice(
        he
          ? "לא ניתן היה לאמת את מצב ההחזר. אין לשלוח בקשה נוספת; בדקו שוב מאוחר יותר."
          : "Refund status could not be verified. Do not submit another request; check again later.",
      );
    } finally {
      reconcilingRefundRef.current = null;
      setReconcilingRefundId(null);
    }
  };
  return (
    <SectionState
      loading={loading}
      error={error}
      onRetry={() => void refreshPayments()}
      locale={locale}
    >
      {notice ? (
        <p role="status" className={styles.helpText} aria-live="polite">
          {notice}
        </p>
      ) : null}
      <div className={styles.stack}>
        <SectionCard
          title={
            he ? "היסטוריית תשלומים והחזרים" : "Payment and refund history"
          }
          actions={
            <RefreshAction
              locale={locale}
              loading={loading}
              onRefresh={() => void refreshPayments()}
            />
          }
        >
          <RecordTable
            columns={columns}
            rows={rows}
            locale={locale}
            empty={
              he
                ? "אין תשלומים בטווח שנבחר."
                : "No payments in the selected range."
            }
            onSelect={setSelected}
          />
        </SectionCard>
        {selected
          ? (() => {
              const refunds = Array.isArray(selected.refunds)
                ? selected.refunds.filter(
                    (refund): refund is CommerceRow =>
                      typeof refund === "object" && refund !== null,
                  )
                : [];
              const refundColumns = [
                {
                  key: "id",
                  label: he ? "מזהה החזר" : "Refund",
                  render: (r: CommerceRow) => text(r, "id").slice(0, 8) || "—",
                },
                {
                  key: "amount_agorot",
                  label: he ? "סכום" : "Amount",
                  render: (r: CommerceRow) =>
                    currencyAmount(r.amount_agorot, r.currency, locale),
                },
                {
                  key: "state",
                  label: he ? "מצב" : "State",
                  render: (r: CommerceRow) => (
                    <StatusText value={r.state} locale={locale} />
                  ),
                },
                {
                  key: "reason",
                  label: he ? "סיבה" : "Reason",
                  render: (r: CommerceRow) => (
                    <span dir="auto">{text(r, "reason")}</span>
                  ),
                },
                {
                  key: "provider_refund_uid",
                  label: he ? "אסמכתת ספק" : "Provider reference",
                  render: (r: CommerceRow) => {
                    const value = text(r, "provider_refund_uid");
                    return value === "—" ? value : `…${value.slice(-6)}`;
                  },
                },
                {
                  key: "created_at",
                  label: he ? "נוצר" : "Created",
                  render: (r: CommerceRow) => {
                    const value = text(r, "created_at");
                    const date = new Date(value);
                    return Number.isFinite(date.getTime())
                      ? date.toLocaleString(he ? "he-IL" : "en-IL")
                      : "—";
                  },
                },
                ...(access.role === "ceo"
                  ? [
                      {
                        key: "status_check",
                        label: he ? "בדיקת מצב" : "Status check",
                        render: (r: CommerceRow) => {
                          const state = String(r.state ?? "").toLowerCase();
                          if (
                            !["requested", "pending", "unknown"].includes(state)
                          )
                            return "—";
                          const id = text(r, "id");
                          const checking = reconcilingRefundId === id;
                          return (
                            <ActionButton
                              label={
                                checking
                                  ? he
                                    ? "בודק…"
                                    : "Checking…"
                                  : he
                                    ? "בדיקת מצב ההחזר"
                                    : "Check refund status"
                              }
                              disabled={busy || reconcilingRefundId !== null}
                              onClick={() => void checkRefundStatus(id)}
                            />
                          );
                        },
                      },
                    ]
                  : []),
              ];
              return (
                <SectionCard
                  title={
                    he ? "החזרים לתשלום שנבחר" : "Refunds for selected payment"
                  }
                  description={
                    he
                      ? "מצב ההחזר וסכומו כפי שהוחזרו מהשרת."
                      : "Refund state and amount as returned by the server."
                  }
                >
                  <RecordTable
                    columns={refundColumns}
                    rows={refunds}
                    locale={locale}
                    empty={
                      he
                        ? "לא נרשמו החזרים לתשלום זה."
                        : "No refunds are recorded for this payment."
                    }
                  />
                </SectionCard>
              );
            })()
          : null}
        {selected && access.allowed("refundPayments") ? (
          <SectionCard
            title={he ? "בקשת החזר" : "Request refund"}
            description={
              he
                ? "החזר זמין רק לתשלום ספק מתאים. מצב לא ידוע דורש התאמה לפני פעולה חוזרת."
                : "Refunds require an eligible provider payment. Unknown outcomes must be reconciled before retry."
            }
          >
            <div className={styles.grid2}>
              <FormField
                label={he ? "סכום להחזר (₪)" : "Refund amount (ILS)"}
                required
              >
                {(p) => (
                  <input
                    {...p}
                    className={styles.fieldInput}
                    inputMode="decimal"
                    dir="ltr"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label={he ? "סיבת ההחזר" : "Refund reason"} required>
                {(p) => (
                  <input
                    {...p}
                    className={styles.fieldInput}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <ActionButton
              label={he ? "שליחת בקשת החזר" : "Submit refund request"}
              kind="danger"
              disabled={busy || refundOutcomeUnknown}
              onClick={() => {
                if (
                  window.confirm(
                    he
                      ? "לשלוח את בקשת ההחזר לספק?"
                      : "Submit this refund request to the provider?",
                  )
                )
                  void refund();
              }}
            />
            {notice ? (
              <p role="status" className={styles.helpText}>
                {notice}
              </p>
            ) : null}
            {refundOutcomeUnknown ? (
              <p role="alert" className={styles.helpText}>
                {he
                  ? "תוצאת ההחזר אינה ידועה. רעננו את היסטוריית התשלומים ובדקו מול הספק לפני בקשה נוספת."
                  : "The refund outcome is unknown. Refresh payment history and reconcile with the provider before another request."}
              </p>
            ) : null}
          </SectionCard>
        ) : null}
      </div>
    </SectionState>
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
