"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useWorkspace } from "../shell/workspace-context";
import { can, type Capability } from "@/lib/permissions";
import { PageHeader } from "../ui/page-header";
import { ErrorState, Notice, Skeleton, StatusBadge } from "../ui";
import { RefreshCw } from "lucide-react";
import styles from "./commerce.module.css";

export type CommerceRow = Record<string, unknown>;
export type CommercePayload = {
  section?: string;
  rows?: unknown;
  total_count?: number;
  summary?: CommerceRow;
  revision?: number;
  readiness?: CommerceRow | null;
  runtime?: CommerceRow | null;
};

export type CommerceNotice = {
  tone: "success" | "warning" | "danger";
  text: string;
};

export function useCommerceSection(section: string) {
  const [payload, setPayload] = useState<CommercePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<CommerceNotice | null>(null);
  const [lastWrite, setLastWrite] = useState<CommerceRow | null>(null);
  const lastWriteUncertainRef = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const readSequence = useRef(0);

  const load = useCallback(
    async (filters: Record<string, string> = {}) => {
      const sequence = ++readSequence.current;
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      setLoading(true);
      setError(null);
      const query = new URLSearchParams({ limit: "100", ...filters });
      try {
        const response = await fetch(
          `/api/management/commerce/${section}?${query}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const result = (await response.json().catch(() => null)) as
          (CommercePayload & { code?: string; error?: string }) | null;
        if (!response.ok || !result || !Array.isArray(result.rows)) {
          const code = result?.code ?? result?.error ?? "commerce_unavailable";
          setPayload(null);
          setError(code);
          return false;
        }
        if (sequence !== readSequence.current) return false;
        setPayload(result);
        return true;
      } catch {
        if (!controller.signal.aborted && sequence === readSequence.current) {
          setPayload(null);
          setError("commerce_unavailable");
        }
        return false;
      } finally {
        if (sequence === readSequence.current) setLoading(false);
      }
    },
    [section],
  );

  useEffect(() => {
    // Loading is an external request; its state updates occur after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => readController.current?.abort();
  }, [load]);

  const runAction = useCallback(
    async (
      action: string,
      actionPayload: CommerceRow,
    ): Promise<CommerceRow | null> => {
      setSaving(true);
      setNotice(null);
      lastWriteUncertainRef.current = false;
      try {
        const response = await fetch(`/api/management/commerce/${section}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ action, payload: actionPayload }),
        });
        const result = (await response.json().catch(() => null)) as {
          ok?: boolean;
          action?: string;
          data?: unknown;
          code?: string;
          error?: string;
        } | null;
        if (!response.ok || result?.ok !== true) {
          const code = result?.code ?? result?.error ?? "commerce_unavailable";
          const uncertain =
            response.status >= 500 || code === "commerce_unavailable";
          lastWriteUncertainRef.current = uncertain;
          setNotice({
            tone: uncertain ? "warning" : "danger",
            text: errorCopy(code),
          });
          return null;
        }
        const actionData = isCommerceRow(result.data) ? result.data : {};
        setLastWrite(actionData);
        setNotice({ tone: "success", text: successCopy(action) });
        await load();
        return actionData;
      } catch {
        lastWriteUncertainRef.current = true;
        setNotice({ tone: "warning", text: errorCopy("write_unknown") });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [load, section],
  );

  const rows = Array.isArray(payload?.rows)
    ? payload.rows.filter(isCommerceRow)
    : [];

  return {
    payload,
    rows,
    loading,
    saving,
    error,
    notice,
    setNotice,
    load,
    runAction,
    lastWrite,
    lastWriteUncertainRef,
  };
}

function isCommerceRow(value: unknown): value is CommerceRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCopy(code: string) {
  const he = {
    revision_conflict:
      "המידע השתנה. רעננו את הרשומה ובדקו אותה לפני ניסיון נוסף.",
    commerce_migration_required: "רכיב המסחר עדיין אינו זמין בסביבה זו.",
    forbidden: "אין הרשאה לבצע פעולה זו.",
    duplicate_operation: "הפעולה כבר נרשמה. רעננו כדי לבדוק את מצבה.",
    write_unknown:
      "לא ניתן לאשר אם השמירה הושלמה. בדקו את הרשומה לפני ניסיון נוסף.",
    commerce_unavailable:
      "השירות לא החזיר תוצאה ודאית. בדקו את הרשומה לפני ניסיון נוסף.",
  };
  const en = {
    revision_conflict:
      "This record changed. Reload and review it before trying again.",
    commerce_migration_required:
      "Commerce is not available in this environment yet.",
    forbidden: "You are not allowed to perform this action.",
    duplicate_operation:
      "This operation was already recorded. Reload to check its state.",
    write_unknown:
      "The save result is unknown. Check the record before trying again.",
    commerce_unavailable:
      "The service did not return a definite result. Check the record before trying again.",
  };
  const locale = document.documentElement.lang.startsWith("he") ? "he" : "en";
  return (
    (locale === "he" ? he : en)[code as keyof typeof en] ??
    (locale === "he"
      ? "הפעולה נכשלה. רעננו ובדקו את הרשומה."
      : "The operation failed. Reload and review the record.")
  );
}

function successCopy(action: string) {
  const hebrew: Record<string, string> = {
    expense_save: "ההוצאה נשמרה כטיוטה.",
    expense_submit: "ההוצאה הועברה לאישור.",
    expense_approve: "החלטת האישור נשמרה.",
    expense_pay: "תשלום ההוצאה נרשם.",
    expense_void: "ההוצאה בוטלה.",
    cash_open: "המשמרת נפתחה.",
    cash_movement: "תנועת המזומן נרשמה.",
    cash_close: "המשמרת נסגרה.",
    recurring_save: "לוח החיוב נשמר.",
    recurring_pause: "לוח החיוב הושהה.",
    recurring_resume: "לוח החיוב חודש.",
    recurring_cancel: "לוח החיוב בוטל.",
    document_draft: "טיוטת המסמך נוצרה.",
    document_reserve: "המספר הוקצה למסמך.",
    document_correct: "מסמך התיקון נוצר.",
    settings_save: "הפרטים העסקיים נשמרו.",
  };
  const english: Record<string, string> = {
    expense_save: "Expense draft saved.",
    expense_submit: "Expense submitted for approval.",
    expense_approve: "Approval decision saved.",
    expense_pay: "Expense payment recorded.",
    expense_void: "Expense voided.",
    cash_open: "Cash session opened.",
    cash_movement: "Cash movement recorded.",
    cash_close: "Cash session closed.",
    recurring_save: "Recurring schedule saved.",
    recurring_pause: "Recurring schedule paused.",
    recurring_resume: "Recurring schedule resumed.",
    recurring_cancel: "Recurring schedule cancelled.",
    document_draft: "Document draft created.",
    document_reserve: "Document number reserved.",
    document_correct: "Correction document created.",
    settings_save: "Business identity saved.",
  };
  const locale = document.documentElement.lang.startsWith("he") ? "he" : "en";
  return (
    (locale === "he" ? hebrew : english)[action] ??
    (locale === "he" ? "הפעולה הושלמה." : "Action completed.")
  );
}

export function useCommerceAccess() {
  const workspace = useWorkspace();
  const role = workspace?.role ?? "worker";
  return {
    role,
    locale: workspace?.locale ?? "he",
    allowed: (capability: Capability) => can(role, capability),
  };
}

const routeLinks = [
  ["expenses", { he: "הוצאות", en: "Expenses" }],
  ["documents", { he: "מסמכים", en: "Documents" }],
  ["integrations", { he: "זהות וחיבורים", en: "Identity & integrations" }],
  ["cash", { he: "משמרות מזומן", en: "Cash shifts" }],
  ["recurring", { he: "חיובים מחזוריים", en: "Recurring" }],
  ["commerce-reports", { he: "דוחות מסחר", en: "Commerce reports" }],
] as const;

export function CommerceNav({ locale }: { locale: "he" | "en" }) {
  return (
    <nav
      className={styles.sectionNav}
      aria-label={locale === "he" ? "אזורי מסחר" : "Commerce areas"}
    >
      {routeLinks.map(([path, labels]) => (
        <Link
          key={path}
          href={`/${locale}/admin/${path}`}
          className={styles.sectionLink}
        >
          {labels[locale]}
        </Link>
      ))}
    </nav>
  );
}

export function CommercePage({
  locale,
  title,
  subtitle,
  actions,
  children,
}: {
  locale: "he" | "en";
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.page} dir={locale === "he" ? "rtl" : "ltr"}>
      <PageHeader
        variant="plain"
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <CommerceNav locale={locale} />
      {children}
    </section>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function RecordTable({
  columns,
  rows,
  locale,
  empty,
  onSelect,
}: {
  columns: {
    key: string;
    label: string;
    render?: (row: CommerceRow) => ReactNode;
  }[];
  rows: CommerceRow[];
  locale: "he" | "en";
  empty: string;
  onSelect?: (row: CommerceRow) => void;
}) {
  const text = (value: unknown) =>
    value == null || value === "" ? "—" : String(value);
  return (
    <div className="mgmt-table">
      <div
        className="mgmt-table__scroll"
        role="region"
        tabIndex={0}
        aria-label={locale === "he" ? "רשומות" : "Records"}
      >
        <table className="mgmt-table__table" style={{ minWidth: "40rem" }}>
          <thead className="mgmt-table__head">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
              {onSelect ? (
                <th scope="col">{locale === "he" ? "פעולה" : "Action"}</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="mgmt-table__body">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (onSelect ? 1 : 0)}
                  className="mgmt-table__empty"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={String(row.id ?? row.document_id ?? index)}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render
                        ? column.render(row)
                        : text(row[column.key])}
                    </td>
                  ))}
                  {onSelect ? (
                    <td>
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--secondary"
                        onClick={() => onSelect(row)}
                      >
                        {locale === "he" ? "בחירה" : "Select"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusText({
  value,
  locale,
}: {
  value: unknown;
  locale: "he" | "en";
}) {
  const status = String(value ?? "unknown");
  const known: Record<
    string,
    {
      he: string;
      en: string;
      tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
    }
  > = {
    draft: { he: "טיוטה", en: "Draft", tone: "neutral" },
    submitted: { he: "ממתין לאישור", en: "Submitted", tone: "warning" },
    approved: { he: "אושר", en: "Approved", tone: "success" },
    paid: { he: "שולם", en: "Paid", tone: "success" },
    partially_paid: { he: "שולם חלקית", en: "Partially paid", tone: "warning" },
    rejected: { he: "נדחה", en: "Rejected", tone: "danger" },
    void: { he: "בוטל", en: "Voided", tone: "neutral" },
    voided: { he: "בוטל", en: "Voided", tone: "neutral" },
    open: { he: "פתוחה", en: "Open", tone: "success" },
    closed: { he: "סגורה", en: "Closed", tone: "neutral" },
    active: { he: "פעיל", en: "Active", tone: "success" },
    paused: { he: "מושהה", en: "Paused", tone: "warning" },
    cancelled: { he: "בוטל", en: "Cancelled", tone: "neutral" },
    pending: { he: "ממתין", en: "Pending", tone: "warning" },
    requested: { he: "התבקש", en: "Requested", tone: "warning" },
    succeeded: { he: "הושלם", en: "Succeeded", tone: "success" },
    failed: { he: "נכשל", en: "Failed", tone: "danger" },
    declined: { he: "נדחה", en: "Declined", tone: "danger" },
    refunded: { he: "הוחזר", en: "Refunded", tone: "info" },
    captured: { he: "נרשם כנקלט", en: "Captured", tone: "success" },
    unknown: { he: "לא ידוע", en: "Unknown", tone: "danger" },
    exception: { he: "דורש בדיקה", en: "Needs review", tone: "danger" },
    paid_manual: {
      he: "תשלום ידני נרשם",
      en: "Manual tender recorded",
      tone: "info",
    },
    not_configured: { he: "לא מוגדר", en: "Not configured", tone: "warning" },
  };
  const copy = known[status] ?? {
    he: status.replaceAll("_", " "),
    en: status.replaceAll("_", " "),
    tone: "neutral" as const,
  };
  return <StatusBadge tone={copy.tone}>{copy[locale]}</StatusBadge>;
}

export function SectionState({
  loading,
  error,
  onRetry,
  children,
  locale,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
  locale: "he" | "en";
}) {
  if (loading)
    return (
      <div className={styles.loading}>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (error)
    return (
      <ErrorState
        title={
          locale === "he"
            ? "לא ניתן לטעון את אזור המסחר"
            : "Commerce area could not load"
        }
        description={errorCopy(error)}
        retryLabel={locale === "he" ? "טעינה מחדש" : "Reload"}
        onRetry={onRetry}
      />
    );
  return <>{children}</>;
}

export function SectionFeedback({
  notice,
  setNotice,
  locale,
}: {
  notice: CommerceNotice | null;
  setNotice: (notice: CommerceNotice | null) => void;
  locale: "he" | "en";
}) {
  if (!notice) return null;
  return (
    <Notice
      tone={notice.tone}
      onDismiss={() => setNotice(null)}
      dismissLabel={locale === "he" ? "סגירת הודעה" : "Dismiss message"}
    >
      {notice.text}
    </Notice>
  );
}

export function RefreshAction({
  locale,
  loading,
  onRefresh,
}: {
  locale: "he" | "en";
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      className="mgmt-button mgmt-button--secondary"
      onClick={onRefresh}
      disabled={loading}
    >
      <RefreshCw size={15} aria-hidden="true" />
      {locale === "he" ? "רענון" : "Refresh"}
    </button>
  );
}

export function moneyLabel(
  value: unknown,
  locale: "he" | "en",
  kind: "agorot" | "major" = "agorot",
) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const amount = kind === "agorot" ? number / 100 : number;
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function dateLabel(value: unknown, locale: "he" | "en") {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-IL", {
    dateStyle: "medium",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

export function operationKey() {
  return crypto.randomUUID().replaceAll("-", "_");
}

export function csvDownload(
  filename: string,
  rows: CommerceRow[],
  columns: { key: string; label: string }[],
) {
  const safeCell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const body = [
    columns.map((column) => safeCell(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => safeCell(row[column.key])).join(","),
    ),
  ].join("\r\n");
  const blob = new Blob(["\ufeff", body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ActionButton({
  label,
  onClick,
  disabled = false,
  kind = "secondary",
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`mgmt-button mgmt-button--${kind}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );
}
