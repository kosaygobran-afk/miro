"use client";

import { useState } from "react";
import { Eye, FileDown, Printer } from "lucide-react";
import { FormField } from "../ui";
import { SectionCard, StatusText, type CommerceRow } from "./commerce-common";
import { formatDocumentTimestamp } from "@/lib/commerce/documents/format";
import {
  DOCUMENT_PREVIEW_LABELS,
  DOCUMENT_PREVIEW_TYPES,
} from "@/lib/commerce/documents/options";
import styles from "./commerce.module.css";

type Locale = "he" | "en";

export function DocumentCreatedAt({
  value,
  locale,
}: {
  value: unknown;
  locale: Locale;
}) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    return <>—</>;
  const stamp = formatDocumentTimestamp(value, locale);
  return (
    <time dateTime={value}>
      <bdi dir="ltr">
        {stamp.date} · {stamp.time}
      </bdi>
    </time>
  );
}

export function DocumentSnapshotDetails({
  document,
  locale,
}: {
  document: CommerceRow;
  locale: Locale;
}) {
  const he = locale === "he";
  const value = (row: unknown, key: string) =>
    row && typeof row === "object"
      ? String((row as CommerceRow)[key] ?? "")
      : "";
  const rawType = String(document.document_type ?? document.type ?? "");
  const type =
    rawType === "invoice"
      ? "transaction_invoice"
      : rawType === "tax_invoice_receipt"
        ? "invoice_receipt"
        : rawType;
  const typeLabel =
    DOCUMENT_PREVIEW_LABELS[type as keyof typeof DOCUMENT_PREVIEW_LABELS]?.[
      locale
    ] ?? type;
  const number = document.display_number ?? document.number;
  const rows = [
    {
      label: he ? "מזהה מסמך" : "Document ID",
      content: <bdi dir="ltr">{String(document.id ?? "—")}</bdi>,
    },
    { label: he ? "סוג מסמך" : "Document type", content: typeLabel },
    {
      label: he ? "מספר רשמי" : "Official number",
      content: number ? (
        <bdi dir="ltr">{String(number)}</bdi>
      ) : he ? (
        "לא הוקצה"
      ) : (
        "Not assigned"
      ),
    },
    {
      label: he ? "מצב" : "State",
      content: (
        <StatusText value={document.state ?? document.status} locale={locale} />
      ),
    },
    {
      label: he ? "תאריך ושעה (שעון ישראל)" : "Date & time (Israel)",
      content: (
        <DocumentCreatedAt value={document.created_at} locale={locale} />
      ),
    },
    {
      label: he ? "שם עסק משפטי" : "Legal business name",
      content: (
        <bdi dir="auto">
          {value(document.business_snapshot, "legal_name") || "—"}
        </bdi>
      ),
    },
    {
      label: he ? "לקוח" : "Customer",
      content: (
        <bdi dir="auto">{value(document.customer_snapshot, "name") || "—"}</bdi>
      ),
    },
    {
      label: he ? "סכום כולל" : "Gross amount",
      content: (
        <bdi dir="ltr">
          {typeof document.total_agorot === "number"
            ? `ILS ${(document.total_agorot / 100).toFixed(2)}`
            : "—"}
        </bdi>
      ),
    },
  ];
  return (
    <dl className={styles.grid2}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt className={styles.subtle}>{row.label}</dt>
          <dd>{row.content}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DocumentPreviewTester({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const [type, setType] =
    useState<(typeof DOCUMENT_PREVIEW_TYPES)[number]>("receipt");
  const [language, setLanguage] = useState<Locale>(locale);
  const [layout, setLayout] = useState("a4");
  const [source, setSource] = useState("business");
  const query = new URLSearchParams({ type, language, layout, source });
  const base = `/api/management/commerce/documents/sample?${query}`;
  return (
    <SectionCard
      title={he ? "בדיקת תבניות מסמכים" : "Test document templates"}
      description={
        he
          ? "בחרו את פרטי העסק העדכניים או עסק פיקטיבי. הלקוח, הפריטים והתשלומים הם דוגמה בלבד, ללא שמירה או הקצאת מספר."
          : "Choose your current business details or a fictional business. The customer, items and payments are samples only, without a save or number reservation."
      }
    >
      <div className={styles.grid4} data-document-preview-tester>
        <FormField label={he ? "סוג מסמך לדוגמה" : "Sample document type"}>
          {(p) => (
            <select
              {...p}
              className={styles.fieldSelect}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {DOCUMENT_PREVIEW_TYPES.map((value) => (
                <option key={value} value={value}>
                  {DOCUMENT_PREVIEW_LABELS[value][locale]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label={he ? "שפת המסמך" : "Document language"}>
          {(p) => (
            <select
              {...p}
              className={styles.fieldSelect}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
            >
              <option value="he">עברית (RTL)</option>
              <option value="en">English (LTR)</option>
            </select>
          )}
        </FormField>
        <FormField label={he ? "גודל נייר" : "Paper size"}>
          {(p) => (
            <select
              {...p}
              className={styles.fieldSelect}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
            >
              <option value="a4">A4</option>
              <option value="receipt80">
                {he ? "קבלה - 80 מ״מ" : "Receipt - 80 mm"}
              </option>
            </select>
          )}
        </FormField>
        <FormField label={he ? "פרטי העסק בתצוגה" : "Business details"}>
          {(p) => (
            <select
              {...p}
              className={styles.fieldSelect}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="business">
                {he ? "פרטי העסק העדכניים" : "Current business details"}
              </option>
              <option value="sample">
                {he ? "עסק פיקטיבי לדוגמה" : "Fictional business"}
              </option>
            </select>
          )}
        </FormField>
      </div>
      <div className={styles.actionRow}>
        <a
          className="mgmt-button mgmt-button--primary"
          href={`${base}&format=html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Eye size={17} aria-hidden="true" />
          {he ? "בדיקת טיוטה (בחלון חדש)" : "Test draft preview (new tab)"}
        </a>
        <a
          className="mgmt-button mgmt-button--secondary"
          href={`${base}&format=pdf`}
        >
          <FileDown size={17} aria-hidden="true" />
          {he ? "הורדת PDF לדוגמה" : "Download sample PDF"}
        </a>
      </div>
      <p className={styles.helpText}>
        <Printer size={15} aria-hidden="true" />{" "}
        {he
          ? "בתצוגה החדשה ניתן להדפיס דרך הדפדפן. להדפסה מדויקת: PDF, קנה מידה 100%, גודל הנייר שנבחר וללא כותרות דפדפן. דוגמה בלבד - לא מסמך מס."
          : "Use the browser Print command in the preview tab. For exact output: PDF, 100% scale, the selected paper size, and no browser headers. Sample only - not a tax document."}
      </p>
      <p className={styles.helpText}>
        {he
          ? "כל פתיחה עם פרטי העסק קוראת את הפרטים האחרונים שנשמרו. מסמכים שכבר נשמרו שומרים את צילום המצב שלהם. "
          : "Each business preview reads the latest saved details. Existing saved documents retain their own snapshot. "}
        <a href={`/${locale}/admin/integrations`}>
          {he ? "עדכון פרטי העסק" : "Update business details"}
        </a>
      </p>
    </SectionCard>
  );
}

export function StoredDraftPreviewLinks({
  id,
  locale,
}: {
  id: string;
  locale: Locale;
}) {
  const he = locale === "he";
  return (
    <div
      className={styles.actionRow}
      aria-label={he ? "תצוגה והדפסת טיוטה" : "Preview and print draft"}
    >
      {(["a4", "receipt80"] as const).map((layout) => (
        <span key={layout} className={styles.actionRow}>
          <a
            className="mgmt-button mgmt-button--secondary"
            href={`/api/management/commerce/documents/${encodeURIComponent(id)}/preview?layout=${layout}&format=html`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Eye size={17} aria-hidden="true" />
            {`${he ? "תצוגה" : "Preview"} · ${layout === "a4" ? "A4" : he ? "80 מ״מ" : "80 mm"}`}
          </a>
          <a
            className="mgmt-button mgmt-button--secondary"
            href={`/api/management/commerce/documents/${encodeURIComponent(id)}/preview?layout=${layout}&format=pdf`}
          >
            <FileDown size={17} aria-hidden="true" />
            {`${he ? "הורדת PDF" : "Download PDF"} · ${layout === "a4" ? "A4" : he ? "80 מ״מ" : "80 mm"}`}
          </a>
        </span>
      ))}
    </div>
  );
}
