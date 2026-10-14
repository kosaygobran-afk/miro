"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Save, Send, Ban, Check, X, CreditCard } from "lucide-react";
import { toAgorot } from "@/lib/commerce/money";
import { ConfirmationDialog, FormField, FormSection } from "../ui";
import {
  ActionButton,
  CommercePage,
  CommerceRow,
  RefreshAction,
  RecordTable,
  SectionCard,
  SectionFeedback,
  SectionState,
  StatusText,
  dateLabel,
  moneyLabel,
  operationKey,
  useCommerceAccess,
  useCommerceSection,
} from "./commerce-common";
import styles from "./commerce.module.css";

type ExpenseDraft = {
  id?: string;
  revision?: number;
  supplierName: string;
  supplierNumber: string;
  reference: string;
  documentDate: string;
  expenseDate: string;
  category: string;
  description: string;
  notes: string;
  deductibility: "pending" | "allowed" | "disallowed" | "partial";
  itemDescription: string;
  net: string;
  vat: string;
};

const blankExpense = (): ExpenseDraft => ({
  supplierName: "",
  supplierNumber: "",
  reference: "",
  documentDate: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  category: "",
  description: "",
  notes: "",
  deductibility: "pending",
  itemDescription: "",
  net: "",
  vat: "",
});

function rowText(row: CommerceRow, key: string, nested?: string) {
  const value = row[key];
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (nested && typeof value === "object" && value !== null) {
    const nestedValue = (value as CommerceRow)[nested];
    if (typeof nestedValue === "string" || typeof nestedValue === "number")
      return String(nestedValue);
  }
  return "";
}

function rowAmount(row: CommerceRow) {
  for (const key of [
    "gross_agorot",
    "total_gross_agorot",
    "amount_agorot",
    "gross_total_agorot",
  ]) {
    if (typeof row[key] === "number") return row[key] as number;
  }
  return 0;
}

export function ExpensesWorkspace({ locale }: { locale: "he" | "en" }) {
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
    lastWriteUncertainRef,
  } = useCommerceSection("expenses");
  const [draft, setDraft] = useState<ExpenseDraft>(blankExpense);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [selected, setSelected] = useState<CommerceRow | null>(null);
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payAmount, setPayAmount] = useState("");
  const [paymentEffect, setPaymentEffect] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<
    "void" | "approve" | "reject" | "pay" | null
  >(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [createWriteUnknown, setCreateWriteUnknown] = useState(false);
  const canManage = access.allowed("manageExpenses");
  const canApprove = access.allowed("approveExpenses");
  const localeCopy = useMemo(
    () => ({
      title: he ? "ניהול הוצאות" : "Expense management",
      subtitle: he
        ? "טיוטות, אסמכתאות, אישורים ותשלומים של הוצאות עסקיות."
        : "Draft, document, approve and record business expenses.",
    }),
    [he],
  );

  const grossAgorot = (() => {
    try {
      return toAgorot(draft.net) + toAgorot(draft.vat);
    } catch {
      return null;
    }
  })();
  const currentStatus = selected
    ? rowText(selected, "status") || rowText(selected, "state")
    : "";
  const selectedId = selected
    ? rowText(selected, "id") || rowText(selected, "expense_id")
    : (draft.id ?? "");
  const selectedRevision =
    selected && typeof selected.revision === "number" ? selected.revision : 0;
  const canEditSelected =
    canManage && (!selectedId || currentStatus === "draft");

  const reset = () => {
    setSelected(null);
    setDraft(blankExpense());
    setFormError("");
  };
  const edit = (row: CommerceRow) => {
    const doc =
      typeof row.document === "object" && row.document !== null
        ? (row.document as CommerceRow)
        : row;
    const supplier =
      typeof row.supplier === "object" && row.supplier !== null
        ? (row.supplier as CommerceRow)
        : typeof row.supplier_snapshot === "object" &&
            row.supplier_snapshot !== null
          ? (row.supplier_snapshot as CommerceRow)
          : {};
    const items = Array.isArray(row.items) ? row.items : [];
    const item =
      items[0] && typeof items[0] === "object" ? (items[0] as CommerceRow) : {};
    const dateOnly = (v: unknown) =>
      typeof v === "string" ? v.slice(0, 10) : "";
    setSelected(row);
    const gross = rowAmount(row);
    const paid =
      typeof row.paid_agorot === "number"
        ? row.paid_agorot
        : typeof row.paid_total_agorot === "number"
          ? row.paid_total_agorot
          : 0;
    setPayAmount(
      Math.max(gross - paid, 0) > 0
        ? (Math.max(gross - paid, 0) / 100).toFixed(2)
        : "",
    );
    setDraft({
      id: rowText(row, "id", "expense_id"),
      revision: typeof row.revision === "number" ? row.revision : 0,
      supplierName: rowText(supplier, "name") || rowText(row, "supplier_name"),
      supplierNumber: rowText(supplier, "business_number"),
      reference:
        rowText(doc, "reference") || rowText(row, "source_document_reference"),
      documentDate: dateOnly(doc.document_date),
      expenseDate: dateOnly(doc.expense_date),
      category: rowText(doc, "category"),
      description: rowText(doc, "description"),
      notes: rowText(doc, "notes"),
      deductibility: ["pending", "allowed", "disallowed", "partial"].includes(
        String(doc.deductibility),
      )
        ? (doc.deductibility as ExpenseDraft["deductibility"])
        : "pending",
      itemDescription: rowText(item, "description"),
      net:
        typeof item.net_agorot === "number"
          ? (item.net_agorot / 100).toFixed(2)
          : "",
      vat:
        typeof item.vat_agorot === "number"
          ? (item.vat_agorot / 100).toFixed(2)
          : "",
    });
    setFormError("");
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    const filters: Record<string, string> = {};
    if (filterSearch.trim()) filters.search = filterSearch.trim();
    if (filterStatus) filters.status = filterStatus;
    if (filterSupplier.trim()) filters.supplier = filterSupplier.trim();
    if (filterCategory.trim()) filters.category = filterCategory.trim();
    if (filterFrom)
      filters.from = new Date(`${filterFrom}T00:00:00.000Z`).toISOString();
    if (filterTo)
      filters.to = new Date(`${filterTo}T23:59:59.999Z`).toISOString();
    void load(filters);
  };

  const saveDraft = async () => {
    if (createWriteUnknown && !draft.id) {
      setFormError(
        he
          ? "תוצאת יצירת הוצאה קודמת אינה ידועה. רעננו ובדקו את הרשומות לפני יצירה נוספת."
          : "A prior expense creation is unresolved. Refresh and check records before creating another.",
      );
      return;
    }
    setFormError("");
    try {
      if (
        !draft.supplierName.trim() ||
        !draft.expenseDate ||
        !draft.category.trim() ||
        !draft.itemDescription.trim()
      ) {
        setFormError(
          he
            ? "יש למלא ספק, תאריך הוצאה, קטגוריה ותיאור פריט."
            : "Supplier, expense date, category and item description are required.",
        );
        return;
      }
      if (
        grossAgorot === null ||
        grossAgorot < 0 ||
        grossAgorot > 999_999_999_999
      )
        throw new RangeError();
      const payload: CommerceRow = {
        ...(draft.id
          ? {
              id: draft.id,
              expected_revision: draft.revision ?? selectedRevision,
            }
          : {}),
        supplier: {
          name: draft.supplierName.trim(),
          ...(draft.supplierNumber.trim()
            ? { business_number: draft.supplierNumber.trim() }
            : {}),
        },
        document: {
          ...(draft.reference.trim()
            ? { reference: draft.reference.trim() }
            : {}),
          document_date: draft.documentDate || draft.expenseDate,
          expense_date: draft.expenseDate,
          category: draft.category.trim(),
          ...(draft.description.trim()
            ? { description: draft.description.trim() }
            : {}),
          currency: "ILS",
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
          deductibility: draft.deductibility,
        },
        items: [
          {
            description: draft.itemDescription.trim(),
            quantity: 1,
            net_agorot: toAgorot(draft.net),
            vat_agorot: toAgorot(draft.vat),
            gross_agorot: grossAgorot,
          },
        ],
        attachments: [],
      };
      const saved = await runAction("expense_save", payload);
      if (saved) {
        const savedRow = (
          typeof saved.expense === "object" && saved.expense !== null
            ? saved.expense
            : saved
        ) as CommerceRow;
        const savedId = rowText(savedRow, "id") || draft.id;
        const savedRevision =
          typeof savedRow.revision === "number"
            ? savedRow.revision
            : typeof saved.revision === "number"
              ? saved.revision
              : undefined;
        if (savedId) {
          setDraft({
            ...draft,
            id: savedId,
            ...(savedRevision === undefined ? {} : { revision: savedRevision }),
          });
          setSelected({
            ...savedRow,
            id: savedId,
            ...(savedRevision === undefined ? {} : { revision: savedRevision }),
          });
        } else {
          setNotice({
            tone: "warning",
            text: he
              ? "השרת שמר את הטיוטה. בחרו אותה מהרשימה כדי להמשיך ולצרף אסמכתאות."
              : "The server saved the draft. Select it from the list to continue and attach files.",
          });
        }
        setFormError("");
      } else if (!draft.id && lastWriteUncertainRef.current) {
        setCreateWriteUnknown(true);
      }
    } catch {
      setFormError(
        he
          ? "יש להזין סכומים תקינים עם עד שתי ספרות אחרי הנקודה."
          : "Enter valid amounts with at most two decimal places.",
      );
    }
  };

  const submit = async (
    action:
      "expense_submit" | "expense_approve" | "expense_pay" | "expense_void",
    decision?: "approve" | "reject",
  ) => {
    if (!selectedId || !selected) return;
    const gross = rowAmount(selected);
    const paid =
      typeof selected.paid_agorot === "number"
        ? selected.paid_agorot
        : typeof selected.paid_total_agorot === "number"
          ? selected.paid_total_agorot
          : 0;
    let amountDue = gross;
    if (action === "expense_pay") {
      try {
        amountDue = toAgorot(payAmount);
      } catch {
        amountDue = 0;
      }
    }
    if (
      action === "expense_pay" &&
      (amountDue <= 0 || amountDue > gross - paid)
    ) {
      setNotice({
        tone: "danger",
        text: he
          ? "הסכום חייב להיות חיובי ולא לעלות על היתרה שאישר השרת."
          : "Amount must be positive and no greater than the remaining balance returned by the server.",
      });
      return;
    }
    let payload: CommerceRow;
    if (action === "expense_submit" || action === "expense_void")
      payload = {
        expense_id: selectedId,
        expected_revision: selectedRevision,
        ...(action === "expense_void"
          ? {
              reason: he
                ? "ביטול דרך ממשק ניהול ההוצאות"
                : "Voided from expense management",
            }
          : {}),
      };
    else if (action === "expense_approve")
      payload = {
        expense_id: selectedId,
        expected_revision: selectedRevision,
        decision,
        ...(decision === "reject"
          ? {
              note: he
                ? "נדחה דרך ממשק ניהול ההוצאות"
                : "Rejected from expense management",
            }
          : {}),
      };
    else {
      const fingerprint = `${selectedId}:${amountDue}:${payMethod}`;
      const effect =
        paymentEffect?.fingerprint === fingerprint
          ? paymentEffect
          : { fingerprint, key: operationKey() };
      setPaymentEffect(effect);
      payload = {
        expense_id: selectedId,
        amount_agorot: amountDue,
        method: payMethod,
        effect_key: effect.key,
      };
    }
    const result = await runAction(action, payload);
    setConfirm(null);
    if (result) {
      if (action === "expense_pay") setPaymentEffect(null);
      const savedRow = (
        typeof result.expense === "object" && result.expense !== null
          ? result.expense
          : result
      ) as CommerceRow;
      if (rowText(savedRow, "id") || rowText(savedRow, "expense_id"))
        setSelected(savedRow);
      else {
        setSelected(null);
        setDraft(blankExpense());
      }
    }
  };

  const uploadFile = async (file: File) => {
    if (!selectedId) {
      setNotice({
        tone: "warning",
        text: he
          ? "שמרו תחילה את ההוצאה כטיוטה, ואז צרפו מסמך."
          : "Save the expense draft first, then attach the document.",
      });
      return;
    }
    setFileBusy(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/management/commerce/expenses/${selectedId}/attachments`,
        { method: "POST", body, cache: "no-store" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        setNotice({
          tone: "danger",
          text: he
            ? "הקובץ לא צורף. בדקו את הטיוטה ואת החיבורים."
            : "The file was not attached. Check the draft and service status.",
        });
      } else {
        if (typeof result.data === "object" && result.data !== null) {
          const attachment = result.data as CommerceRow;
          setSelected((current) =>
            current
              ? {
                  ...current,
                  attachments: [
                    ...(Array.isArray(current.attachments)
                      ? current.attachments
                      : []),
                    attachment,
                  ],
                }
              : current,
          );
        }
        setNotice({
          tone: "success",
          text: he
            ? "הקובץ הפרטי צורף להוצאה."
            : "Private file attached to the expense.",
        });
        await load();
      }
    } catch {
      setNotice({
        tone: "warning",
        text: he
          ? "תוצאת העלאת הקובץ אינה ידועה. בדקו את הקבצים בהוצאה לפני ניסיון נוסף."
          : "Upload result is unknown. Check the expense attachments before retrying.",
      });
    } finally {
      setFileBusy(false);
    }
  };

  const columns = [
    {
      key: "id",
      label: he ? "מזהה" : "Record",
      render: (row: CommerceRow) =>
        rowText(row, "reference") || rowText(row, "id").slice(0, 8) || "—",
    },
    {
      key: "supplier",
      label: he ? "ספק" : "Supplier",
      render: (row: CommerceRow) =>
        rowText(row, "supplier", "name") ||
        rowText(row, "supplier_name") ||
        "—",
    },
    {
      key: "expense_date",
      label: he ? "תאריך הוצאה" : "Expense date",
      render: (row: CommerceRow) =>
        dateLabel(
          row.document && typeof row.document === "object"
            ? (row.document as CommerceRow).expense_date
            : row.expense_date,
          locale,
        ),
    },
    {
      key: "category",
      label: he ? "קטגוריה" : "Category",
      render: (row: CommerceRow) =>
        rowText(row, "document", "category") || rowText(row, "category") || "—",
    },
    {
      key: "amount",
      label: he ? "סכום ברוטו" : "Gross amount",
      render: (row: CommerceRow) => (
        <bdi dir="ltr">{moneyLabel(rowAmount(row), locale)}</bdi>
      ),
    },
    {
      key: "status",
      label: he ? "מצב" : "Status",
      render: (row: CommerceRow) => (
        <StatusText value={row.status ?? row.state} locale={locale} />
      ),
    },
  ];

  return (
    <CommercePage
      locale={locale}
      title={localeCopy.title}
      subtitle={localeCopy.subtitle}
      actions={
        <RefreshAction
          locale={locale}
          loading={loading}
          onRefresh={() => {
            void load().then((ok) => {
              if (ok) setCreateWriteUnknown(false);
            });
          }}
        />
      }
    >
      <SectionFeedback notice={notice} setNotice={setNotice} locale={locale} />
      <SectionState
        loading={loading}
        error={error}
        onRetry={() => {
          void load().then((ok) => {
            if (ok) setCreateWriteUnknown(false);
          });
        }}
        locale={locale}
      >
        <div className={styles.stack}>
          <SectionCard title={he ? "סינון הוצאות" : "Filter expenses"}>
            <form className={styles.toolbar} onSubmit={search}>
              <FormField
                label={he ? "חיפוש" : "Search"}
                className={styles.toolbarField}
              >
                {(props) => (
                  <input
                    {...props}
                    className={styles.fieldInput}
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label={he ? "מצב" : "Status"}
                className={styles.toolbarField}
              >
                {(props) => (
                  <select
                    {...props}
                    className={styles.fieldSelect}
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="">
                      {he ? "כל המצבים" : "All statuses"}
                    </option>
                    {[
                      "draft",
                      "submitted",
                      "approved",
                      "paid",
                      "voided",
                      "rejected",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField
                label={he ? "ספק" : "Supplier"}
                className={styles.toolbarField}
              >
                {(props) => (
                  <input
                    {...props}
                    className={styles.fieldInput}
                    value={filterSupplier}
                    onChange={(e) => setFilterSupplier(e.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label={he ? "קטגוריה" : "Category"}
                className={styles.toolbarField}
              >
                {(props) => (
                  <input
                    {...props}
                    className={styles.fieldInput}
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label={he ? "מתאריך" : "From"}
                className={styles.toolbarField}
              >
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    className={styles.fieldInput}
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                  />
                )}
              </FormField>
              <FormField
                label={he ? "עד תאריך" : "To"}
                className={styles.toolbarField}
              >
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    className={styles.fieldInput}
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                  />
                )}
              </FormField>
              <button
                type="submit"
                className="mgmt-button mgmt-button--primary"
                disabled={loading}
              >
                {he ? "החלת סינון" : "Apply filters"}
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title={he ? "רשומות הוצאות" : "Expense records"}
            description={
              he
                ? `מוצגות ${rows.length} מתוך ${payload?.total_count ?? rows.length} רשומות זמינות.`
                : `Showing ${rows.length} of ${payload?.total_count ?? rows.length} available records.`
            }
            actions={
              canManage ? (
                <ActionButton
                  label={he ? "הוצאה חדשה" : "New expense"}
                  kind="primary"
                  icon={<Plus size={16} aria-hidden="true" />}
                  onClick={reset}
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
                  ? "לא נמצאו הוצאות בטווח ובמסננים הנוכחיים."
                  : "No expenses match the current filters."
              }
              onSelect={edit}
            />
          </SectionCard>

          {canManage ? (
            <SectionCard
              title={
                draft.id
                  ? he
                    ? "עריכת טיוטת הוצאה"
                    : "Edit expense draft"
                  : he
                    ? "טיוטת הוצאה חדשה"
                    : "New expense draft"
              }
              description={
                he
                  ? "הסכומים מוזנים באגורות ומוגשים לאימות שרת. מספר אסמכתה נשאר ריק כשאין מסמך ספק; בלי אסמכתה קשה יותר לזהות כפילות, לכן בדקו ספק, תאריך וסכום."
                  : "Amounts are submitted for server validation. Leave the reference blank if the supplier has none; duplicates are harder to identify without it, so check supplier, date and amount."
              }
            >
              {formError ? (
                <p role="alert" className={styles.helpText}>
                  {formError}
                </p>
              ) : null}
              {selectedId && !canEditSelected ? (
                <p className={styles.helpText}>
                  {he
                    ? "הרשומה אינה טיוטה ולכן מוצגת לקריאה בלבד. פעולות מתאימות למצב מופיעות למטה."
                    : "This record is not a draft and is read-only. Available state transitions appear below."}
                </p>
              ) : null}
              <div className={styles.stack}>
                <fieldset
                  disabled={!canEditSelected || saving}
                  className={styles.fieldset}
                >
                  <FormSection
                    title={he ? "פרטי ספק ומסמך" : "Supplier and document"}
                  >
                    <div className={styles.grid3}>
                      <FormField
                        label={he ? "שם ספק" : "Supplier name"}
                        required
                      >
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            value={draft.supplierName}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                supplierName: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField
                        label={
                          he
                            ? "מספר עוסק / ח.פ. (אם קיים)"
                            : "Business number (if available)"
                        }
                      >
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            dir="ltr"
                            value={draft.supplierNumber}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                supplierNumber: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField
                        label={
                          he
                            ? "אסמכתת ספק (אם קיימת)"
                            : "Supplier reference (if any)"
                        }
                        description={
                          he
                            ? "אין להמציא מספר אסמכתה."
                            : "Do not invent a document reference."
                        }
                      >
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            value={draft.reference}
                            onChange={(e) =>
                              setDraft({ ...draft, reference: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={he ? "תאריך מסמך" : "Document date"}>
                        {(props) => (
                          <input
                            {...props}
                            type="date"
                            className={styles.fieldInput}
                            value={draft.documentDate}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                documentDate: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField
                        label={he ? "תאריך הוצאה" : "Expense date"}
                        required
                      >
                        {(props) => (
                          <input
                            {...props}
                            type="date"
                            className={styles.fieldInput}
                            value={draft.expenseDate}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                expenseDate: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField
                        label={he ? "קטגוריה חשבונאית" : "Accounting category"}
                        required
                      >
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            value={draft.category}
                            onChange={(e) =>
                              setDraft({ ...draft, category: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={he ? "ניכוי מס" : "Deductibility"}>
                        {(props) => (
                          <select
                            {...props}
                            className={styles.fieldSelect}
                            value={draft.deductibility}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                deductibility: e.target
                                  .value as ExpenseDraft["deductibility"],
                              })
                            }
                          >
                            <option value="pending">
                              {he
                                ? "ממתין להחלטת רו״ח"
                                : "Pending accountant review"}
                            </option>
                            <option value="allowed">
                              {he ? "מותר" : "Allowed"}
                            </option>
                            <option value="partial">
                              {he ? "חלקי" : "Partial"}
                            </option>
                            <option value="disallowed">
                              {he ? "לא מותר" : "Disallowed"}
                            </option>
                          </select>
                        )}
                      </FormField>
                      <FormField label={he ? "הערות" : "Notes"}>
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            value={draft.notes}
                            onChange={(e) =>
                              setDraft({ ...draft, notes: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                    </div>
                  </FormSection>
                  <FormSection
                    title={he ? "פריטי הוצאה" : "Expense items"}
                    description={
                      he
                        ? "מספרים מוזנים בשקלים; הסכום הכולל מחושב מסכומי הנטו והמע״מ ללא עיגול ביניים."
                        : "Enter shekel amounts; gross is derived from net plus VAT using agorot."
                    }
                  >
                    <div className={styles.grid4}>
                      <FormField
                        label={he ? "תיאור פריט" : "Item description"}
                        required
                      >
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            value={draft.itemDescription}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                itemDescription: e.target.value,
                              })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={he ? "נטו (₪)" : "Net (ILS)"} required>
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            inputMode="decimal"
                            dir="ltr"
                            value={draft.net}
                            onChange={(e) =>
                              setDraft({ ...draft, net: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField label={he ? "מע״מ (₪)" : "VAT (ILS)"} required>
                        {(props) => (
                          <input
                            {...props}
                            className={styles.fieldInput}
                            inputMode="decimal"
                            dir="ltr"
                            value={draft.vat}
                            onChange={(e) =>
                              setDraft({ ...draft, vat: e.target.value })
                            }
                          />
                        )}
                      </FormField>
                      <FormField
                        label={he ? "ברוטו (מחושב)" : "Gross (calculated)"}
                      >
                        {(props) => (
                          <output
                            id={props.id}
                            className={styles.fieldInput}
                            dir="ltr"
                          >
                            {grossAgorot === null
                              ? "—"
                              : moneyLabel(grossAgorot, locale)}
                          </output>
                        )}
                      </FormField>
                    </div>
                  </FormSection>
                  <FormSection
                    title={he ? "אסמכתאות פרטיות" : "Private attachments"}
                    description={
                      he
                        ? "PDF או תמונת JPEG/PNG בלבד, עד 5MB. הקובץ נשמר במאגר פרטי וזמין רק לאחר בדיקת הרשאה."
                        : "PDF or JPEG/PNG image, up to 5 MB. Files stay private and are available only after authorization."
                    }
                  >
                    <div className={styles.stack}>
                      {selectedId ? (
                        <AttachmentList
                          locale={locale}
                          expenseId={selectedId}
                          rows={
                            Array.isArray(selected?.attachments)
                              ? selected.attachments.filter(
                                  (v): v is CommerceRow =>
                                    typeof v === "object" && v !== null,
                                )
                              : []
                          }
                        />
                      ) : (
                        <p className={styles.subtle}>
                          {he
                            ? "שמרו את הטיוטה כדי לצרף קובץ."
                            : "Save the draft before attaching a file."}
                        </p>
                      )}
                      <FormField label={he ? "בחירת קובץ" : "Choose file"}>
                        {(props) => (
                          <input
                            {...props}
                            type="file"
                            className={styles.fieldInput}
                            accept="application/pdf,image/jpeg,image/png"
                            disabled={!canEditSelected || fileBusy || saving}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadFile(file);
                              e.currentTarget.value = "";
                            }}
                          />
                        )}
                      </FormField>
                      {fileBusy ? (
                        <span role="status" className={styles.subtle}>
                          {he ? "מעלה קובץ…" : "Uploading file…"}
                        </span>
                      ) : null}
                    </div>
                  </FormSection>
                </fieldset>
                <div className={styles.actionRow}>
                  <ActionButton
                    label={he ? "שמירת טיוטה" : "Save draft"}
                    onClick={() => void saveDraft()}
                    disabled={
                      !canEditSelected ||
                      saving ||
                      (createWriteUnknown && !draft.id)
                    }
                    kind="primary"
                    icon={<Save size={16} aria-hidden="true" />}
                  />
                  {draft.id && currentStatus === "draft" ? (
                    <ActionButton
                      label={he ? "שליחה לאישור" : "Submit for approval"}
                      onClick={() => void submit("expense_submit")}
                      disabled={saving}
                      icon={<Send size={16} aria-hidden="true" />}
                    />
                  ) : null}
                  {canApprove && draft.id && currentStatus === "submitted" ? (
                    <>
                      <ActionButton
                        label={he ? "אישור" : "Approve"}
                        onClick={() => setConfirm("approve")}
                        disabled={saving}
                        kind="primary"
                        icon={<Check size={16} aria-hidden="true" />}
                      />
                      <ActionButton
                        label={he ? "דחייה" : "Reject"}
                        onClick={() => setConfirm("reject")}
                        disabled={saving}
                        kind="danger"
                        icon={<X size={16} aria-hidden="true" />}
                      />
                    </>
                  ) : null}
                  {draft.id &&
                  ["approved", "partially_paid"].includes(currentStatus) ? (
                    <ActionButton
                      label={he ? "רישום תשלום" : "Record payment"}
                      onClick={() => setConfirm("pay")}
                      disabled={saving}
                      icon={<CreditCard size={16} aria-hidden="true" />}
                    />
                  ) : null}
                  {draft.id &&
                  ![
                    "paid",
                    "partially_paid",
                    "voided",
                    "rejected",
                    "void",
                  ].includes(currentStatus) ? (
                    <ActionButton
                      label={he ? "ביטול הוצאה" : "Void expense"}
                      onClick={() => setConfirm("void")}
                      disabled={saving}
                      kind="danger"
                      icon={<Ban size={16} aria-hidden="true" />}
                    />
                  ) : null}
                  {draft.id ? (
                    <ActionButton
                      label={he ? "הוצאה חדשה" : "New draft"}
                      onClick={reset}
                      disabled={saving}
                      icon={<Plus size={16} aria-hidden="true" />}
                    />
                  ) : null}
                </div>
                {confirm === "pay" ? (
                  <div className={styles.grid2}>
                    <FormField
                      label={he ? "סכום תשלום (₪)" : "Payment amount (ILS)"}
                      required
                    >
                      {(props) => (
                        <input
                          {...props}
                          className={styles.fieldInput}
                          inputMode="decimal"
                          dir="ltr"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                        />
                      )}
                    </FormField>
                    <FormField
                      label={
                        he ? "שיטת תשלום שנרשמה" : "Recorded payment method"
                      }
                    >
                      {(props) => (
                        <select
                          {...props}
                          className={styles.fieldSelect}
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value)}
                        >
                          <option value="bank_transfer">
                            {he ? "העברה בנקאית" : "Bank transfer"}
                          </option>
                          <option value="cash">{he ? "מזומן" : "Cash"}</option>
                          <option value="check">
                            {he ? "המחאה" : "Check"}
                          </option>
                          <option value="other">{he ? "אחר" : "Other"}</option>
                        </select>
                      )}
                    </FormField>
                    <p className={styles.helpText}>
                      {he
                        ? "רישום זה מתעד תשלום שבוצע מחוץ למערכת; הוא אינו מחייב כרטיס ואינו מאמת גבייה מספק תשלומים. אפשר לרשום תשלומים חלקיים עד ליתרה."
                        : "This records an offline payment; it does not charge a card or verify provider collection. Partial payments are allowed up to the remaining balance."}
                    </p>
                    <ActionButton
                      label={
                        he ? "אישור רישום התשלום" : "Confirm recorded payment"
                      }
                      onClick={() => void submit("expense_pay")}
                      disabled={saving}
                      kind="primary"
                    />
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
          {payload?.summary && Object.keys(payload.summary).length ? (
            <p className={styles.subtle}>
              {he
                ? "הסיכום מבוסס על הרשומות שהוחזרו ועל מסננים נוכחיים."
                : "Summary reflects the returned records and current filters."}
            </p>
          ) : null}
        </div>
      </SectionState>
      <ConfirmationDialog
        open={!!confirm && confirm !== "pay"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "void") void submit("expense_void");
          if (confirm === "approve") void submit("expense_approve", "approve");
          if (confirm === "reject") void submit("expense_approve", "reject");
        }}
        title={
          confirm === "void"
            ? he
              ? "ביטול הוצאה"
              : "Void expense"
            : confirm === "reject"
              ? he
                ? "דחיית הוצאה"
                : "Reject expense"
              : he
                ? "אישור הוצאה"
                : "Approve expense"
        }
        description={
          confirm === "void"
            ? he
              ? "הביטול יירשם ביומן ולא ימחק את ההוצאה."
              : "Voiding is audited; the expense record remains."
            : he
              ? "הפעולה תישמר עם גרסת הרשומה הנוכחית."
              : "The action is recorded against the current revision."
        }
        confirmLabel={
          confirm === "reject"
            ? he
              ? "דחייה"
              : "Reject"
            : confirm === "void"
              ? he
                ? "ביטול הוצאה"
                : "Void expense"
              : he
                ? "אישור"
                : "Approve"
        }
        cancelLabel={he ? "חזרה" : "Cancel"}
        tone={confirm === "void" || confirm === "reject" ? "danger" : "default"}
        busy={saving}
        closeLabel={he ? "סגירת חלון" : "Close dialog"}
      />
    </CommercePage>
  );
}

function AttachmentList({
  locale,
  expenseId,
  rows,
}: {
  locale: "he" | "en";
  expenseId: string;
  rows: CommerceRow[];
}) {
  const he = locale === "he";
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const download = async (attachmentId: string) => {
    setPending(attachmentId);
    setError("");
    try {
      const response = await fetch(
        `/api/management/commerce/expenses/${expenseId}/attachments?attachment_id=${encodeURIComponent(attachmentId)}`,
        { cache: "no-store" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || typeof result?.url !== "string") throw new Error();
      window.location.assign(result.url);
    } catch {
      setError(
        he
          ? "לא ניתן להוריד את הקובץ כרגע."
          : "The file could not be downloaded right now.",
      );
    } finally {
      setPending(null);
    }
  };
  return (
    <>
      {rows.length ? (
        <ul className={styles.fileList}>
          {rows.map((row) => (
            <li className={styles.fileRow} key={String(row.id)}>
              <span dir="auto">{rowText(row, "original_name")}</span>
              <button
                type="button"
                className="mgmt-button mgmt-button--secondary"
                onClick={() => void download(rowText(row, "id"))}
                disabled={pending === rowText(row, "id")}
              >
                {he ? "הורדה מאובטחת" : "Secure download"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.subtle}>
          {he ? "אין אסמכתאות מצורפות." : "No attachments."}
        </p>
      )}
      {error ? (
        <p className={styles.subtle} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
