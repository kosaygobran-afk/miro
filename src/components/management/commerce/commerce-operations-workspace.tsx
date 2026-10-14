"use client";

import { useMemo, useState } from "react";
import { FormField, FormSection } from "../ui";
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
  moneyLabel,
  operationKey,
  useCommerceAccess,
  useCommerceSection,
} from "./commerce-common";
import styles from "./commerce.module.css";

type Locale = "he" | "en";
const read = (row: CommerceRow, key: string) =>
  typeof row[key] === "string" || typeof row[key] === "number"
    ? String(row[key])
    : "";
const localDateTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const amount = (row: CommerceRow) =>
  [
    "amount_agorot",
    "gross_agorot",
    "total_agorot",
    "opening_float_agorot",
    "counted_cash_agorot",
    "signed_amount_agorot",
  ]
    .map((key) => row[key])
    .find((v) => typeof v === "number") as number | undefined;

export function CashWorkspace({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const { rows, loading, saving, error, notice, setNotice, load, runAction } =
    useCommerceSection("cash");
  const access = useCommerceAccess();
  const [opening, setOpening] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<CommerceRow | null>(null);
  const [kind, setKind] = useState<"cash_in" | "cash_out" | "correction">(
    "cash_in",
  );
  const [correctionDirection, setCorrectionDirection] = useState<
    "increase" | "decrease"
  >("increase");
  const [movementAmount, setMovementAmount] = useState("");
  const [reason, setReason] = useState("");
  const [counted, setCounted] = useState("");
  const [message, setMessage] = useState("");
  const [movementEffect, setMovementEffect] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const title = he ? "ניהול קופה" : "Cash management";
  const active =
    rows.find((r) => r.status === "open" || r.state === "open") ?? null;
  const currency = (v: string) => toAgorot(v.replace(/,/g, ""));
  const submit = async (action: string, payload: CommerceRow) => {
    setMessage("");
    const result = await runAction(action, payload);
    if (result) {
      if (action === "cash_movement") setMovementEffect(null);
      setSelected(result);
      setMessage(
        he ? "הפעולה נשמרה בשרת." : "The server confirmed the action.",
      );
      await load();
    }
  };
  const columns = useMemo(
    () => [
      {
        key: "id",
        label: he ? "משמרת" : "Shift",
        render: (r: CommerceRow) => read(r, "id").slice(0, 8) || "—",
      },
      {
        key: "opened_at",
        label: he ? "נפתחה" : "Opened",
        render: (r: CommerceRow) =>
          read(r, "opened_at")
            ? new Date(read(r, "opened_at")).toLocaleString(
                he ? "he-IL" : "en-IL",
              )
            : "—",
      },
      {
        key: "opening_float_agorot",
        label: he ? "יתרת פתיחה" : "Opening float",
        render: (r: CommerceRow) =>
          amount(r) === undefined ? "—" : moneyLabel(amount(r)!, locale),
      },
      {
        key: "status",
        label: he ? "מצב" : "Status",
        render: (r: CommerceRow) => (
          <StatusText value={r.status ?? r.state} locale={locale} />
        ),
      },
    ],
    [he, locale],
  );
  return (
    <CommercePage
      locale={locale}
      title={title}
      subtitle={
        he
          ? "פתיחה, תנועות מזומן וסגירה עם ספירה בפועל. מכירות והחזרים מתועדים ממקורם בלבד."
          : "Open a shift, record cash in/out and close with an actual count. Sales and refunds are recorded by their source."
      }
      actions={
        <RefreshAction
          locale={locale}
          loading={loading}
          onRefresh={() => void load()}
        />
      }
    >
      <SectionFeedback notice={notice} setNotice={setNotice} locale={locale} />
      {message ? (
        <p role="status" className={styles.helpText}>
          {message}
        </p>
      ) : null}
      <SectionState
        loading={loading}
        error={error}
        onRetry={() => void load()}
        locale={locale}
      >
        <div className={styles.stack}>
          <SectionCard title={he ? "משמרות קופה" : "Cash shifts"}>
            <RecordTable
              columns={columns}
              rows={rows}
              locale={locale}
              empty={he ? "אין משמרות קופה." : "No cash shifts."}
              onSelect={setSelected}
            />
          </SectionCard>
          {access.allowed("manageCash") ? (
            <>
              {!active ? (
                <SectionCard title={he ? "פתיחת משמרת" : "Open a shift"}>
                  <div className={styles.grid2}>
                    <FormField
                      label={he ? "יתרת פתיחה (₪)" : "Opening float (ILS)"}
                      required
                    >
                      {(p) => (
                        <input
                          {...p}
                          className={styles.fieldInput}
                          inputMode="decimal"
                          dir="ltr"
                          value={opening}
                          onChange={(e) => setOpening(e.target.value)}
                        />
                      )}
                    </FormField>
                    <FormField label={he ? "הערה" : "Note"}>
                      {(p) => (
                        <input
                          {...p}
                          className={styles.fieldInput}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      )}
                    </FormField>
                  </div>
                  <ActionButton
                    label={he ? "פתיחת קופה" : "Open cash shift"}
                    kind="primary"
                    disabled={saving || !opening}
                    onClick={() => {
                      try {
                        const n = currency(opening);
                        if (!Number.isSafeInteger(n) || n < 0)
                          throw new Error();
                        void submit("cash_open", {
                          opening_float_agorot: n,
                          ...(note.trim() ? { note: note.trim() } : {}),
                        });
                      } catch {
                        setMessage(
                          he ? "הזינו סכום תקין." : "Enter a valid amount.",
                        );
                      }
                    }}
                  />
                </SectionCard>
              ) : (
                <>
                  <SectionCard
                    title={he ? "תנועת מזומן ידנית" : "Manual cash movement"}
                    description={
                      he
                        ? "מכירה במזומן והחזר מזומן נרשמים מתוך הפעולה המקורית. כאן ניתן לתעד רק כניסה, יציאה או תיקון עם סיבה."
                        : "Cash sales and refunds are recorded from their source. This form records only cash in, out, or a correction with a reason."
                    }
                  >
                    <FormSection title={he ? "פרטי תנועה" : "Movement details"}>
                      <div className={styles.grid3}>
                        <FormField label={he ? "סוג תנועה" : "Movement type"}>
                          {(p) => (
                            <select
                              {...p}
                              className={styles.fieldSelect}
                              value={kind}
                              onChange={(e) =>
                                setKind(e.target.value as typeof kind)
                              }
                            >
                              <option value="cash_in">
                                {he ? "כניסת מזומן" : "Cash in"}
                              </option>
                              <option value="cash_out">
                                {he ? "יציאת מזומן" : "Cash out"}
                              </option>
                              <option value="correction">
                                {he ? "תיקון ספירה" : "Count correction"}
                              </option>
                            </select>
                          )}
                        </FormField>
                        {kind === "correction" ? (
                          <FormField
                            label={he ? "כיוון התיקון" : "Correction direction"}
                          >
                            {(p) => (
                              <select
                                {...p}
                                className={styles.fieldSelect}
                                value={correctionDirection}
                                onChange={(e) =>
                                  setCorrectionDirection(
                                    e.target
                                      .value as typeof correctionDirection,
                                  )
                                }
                              >
                                <option value="increase">
                                  {he ? "הגדלת יתרה" : "Increase balance"}
                                </option>
                                <option value="decrease">
                                  {he ? "הפחתת יתרה" : "Decrease balance"}
                                </option>
                              </select>
                            )}
                          </FormField>
                        ) : null}
                        <FormField
                          label={he ? "סכום (₪)" : "Amount (ILS)"}
                          required
                        >
                          {(p) => (
                            <input
                              {...p}
                              className={styles.fieldInput}
                              inputMode="decimal"
                              dir="ltr"
                              value={movementAmount}
                              onChange={(e) =>
                                setMovementAmount(e.target.value)
                              }
                            />
                          )}
                        </FormField>
                        <FormField label={he ? "סיבה" : "Reason"} required>
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
                    </FormSection>
                    <ActionButton
                      label={he ? "רישום תנועה" : "Record movement"}
                      disabled={saving || !movementAmount || !reason.trim()}
                      onClick={() => {
                        try {
                          const n = currency(movementAmount);
                          if (!Number.isSafeInteger(n) || n <= 0)
                            throw new Error();
                          const fingerprint = `${read(active, "id")}:${kind}:${kind === "correction" ? correctionDirection : ""}:${n}:${reason.trim()}`;
                          const effect =
                            movementEffect?.fingerprint === fingerprint
                              ? movementEffect
                              : { fingerprint, key: operationKey() };
                          setMovementEffect(effect);
                          void submit("cash_movement", {
                            session_id: read(active, "id"),
                            kind,
                            ...(kind === "correction"
                              ? {
                                  signed_amount_agorot:
                                    correctionDirection === "increase" ? n : -n,
                                }
                              : { amount_agorot: n }),
                            reason: reason.trim(),
                            effect_key: effect.key,
                          });
                        } catch {
                          setMessage(
                            he ? "בדקו את הסכום." : "Check the amount.",
                          );
                        }
                      }}
                    />
                  </SectionCard>
                  <SectionCard title={he ? "סגירת משמרת" : "Close shift"}>
                    <div className={styles.grid2}>
                      <FormField
                        label={he ? "מזומן שנספר (₪)" : "Counted cash (ILS)"}
                        required
                      >
                        {(p) => (
                          <input
                            {...p}
                            className={styles.fieldInput}
                            inputMode="decimal"
                            dir="ltr"
                            value={counted}
                            onChange={(e) => setCounted(e.target.value)}
                          />
                        )}
                      </FormField>
                      <FormField label={he ? "הערת סגירה" : "Closing note"}>
                        {(p) => (
                          <input
                            {...p}
                            className={styles.fieldInput}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                          />
                        )}
                      </FormField>
                    </div>
                    <p className={styles.helpText}>
                      {he
                        ? "הפרש הספירה יחושב ויישמר בשרת. אין לבצע תיקון אוטומטי."
                        : "The server calculates and records the variance. No automatic adjustment will be made."}
                    </p>
                    <ActionButton
                      label={he ? "סגירת קופה" : "Close shift"}
                      kind="danger"
                      disabled={saving || !counted}
                      onClick={() => {
                        try {
                          const n = currency(counted);
                          if (!Number.isSafeInteger(n) || n < 0)
                            throw new Error();
                          void submit("cash_close", {
                            session_id: read(active, "id"),
                            expected_revision: Number(active.revision) || 0,
                            counted_cash_agorot: n,
                            ...(note.trim() ? { note: note.trim() } : {}),
                          });
                        } catch {
                          setMessage(
                            he ? "הזינו ספירה תקינה." : "Enter a valid count.",
                          );
                        }
                      }}
                    />
                  </SectionCard>
                </>
              )}
            </>
          ) : null}
          {selected ? (
            <SectionCard
              title={he ? "תנועות המשמרת שנבחרה" : "Selected shift movements"}
            >
              <pre className={styles.helpText}>
                {Array.isArray(selected.movements)
                  ? selected.movements
                      .map((m) => {
                        const row = m as CommerceRow;
                        return `${read(row, "kind")} · ${amount(row) === undefined ? "—" : moneyLabel(amount(row)!, locale)} · ${read(row, "reason")}`;
                      })
                      .join("\n")
                  : he
                    ? "פרטי התנועות יוצגו כאשר השרת יחזיר אותן."
                    : "Movement details appear when returned by the service."}
              </pre>
            </SectionCard>
          ) : null}
        </div>
      </SectionState>
    </CommercePage>
  );
}

export function RecurringWorkspace({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const access = useCommerceAccess();
  const {
    rows,
    loading,
    saving,
    error,
    notice,
    setNotice,
    load,
    runAction,
    lastWriteUncertainRef,
  } = useCommerceSection("recurring");
  const [form, setForm] = useState({
    name: "",
    customer_id: "",
    amount: "",
    interval: "1",
    next: "",
    consent: "",
  });
  const [feedback, setFeedback] = useState("");
  const [createWriteUnknown, setCreateWriteUnknown] = useState(false);
  const edit = (row: CommerceRow) =>
    setForm({
      name: read(row, "name"),
      customer_id: read(row, "customer_id"),
      amount: amount(row) === undefined ? "" : (amount(row)! / 100).toFixed(2),
      interval: String(row.interval_count ?? row.interval_months ?? 1),
      next: localDateTime(read(row, "next_charge_at")),
      consent: read(row, "consent_reference"),
    });
  const action = async (name: string, payload: CommerceRow) => {
    const data = await runAction(name, payload);
    if (data) {
      setFeedback(
        he ? "השרת אישר את הפעולה." : "The server confirmed the action.",
      );
      await load();
    } else if (name === "recurring_save" && lastWriteUncertainRef.current) {
      setCreateWriteUnknown(true);
    }
  };
  const columns = [
    {
      key: "name",
      label: he ? "שם" : "Name",
      render: (r: CommerceRow) => read(r, "name"),
    },
    {
      key: "amount",
      label: he ? "סכום" : "Amount",
      render: (r: CommerceRow) =>
        amount(r) === undefined ? "—" : moneyLabel(amount(r)!, locale),
    },
    {
      key: "interval_count",
      label: he ? "מחזור בחודשים" : "Interval (months)",
      render: (r: CommerceRow) =>
        `${String(r.interval_count ?? r.interval_months ?? "—")} ${String(r.interval_unit ?? "month")}`,
    },
    {
      key: "status",
      label: he ? "מצב" : "Status",
      render: (r: CommerceRow) => (
        <StatusText value={r.status ?? r.state} locale={locale} />
      ),
    },
  ];
  return (
    <CommercePage
      locale={locale}
      title={he ? "חיובים מחזוריים" : "Recurring billing"}
      subtitle={
        he
          ? "הסכמה מתועדת בלבד; אין הזנת אסימון תשלום ואין הבטחה לגבייה אוטומטית. יכולת החיוב תלויה בספק ובמוכנות."
          : "Record consent only. No payment token is collected, and automatic collection is not promised. Charging depends on provider capability and readiness."
      }
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
      {feedback ? (
        <p role="status" className={styles.helpText}>
          {feedback}
        </p>
      ) : null}
      {createWriteUnknown ? (
        <p role="alert" className={styles.helpText}>
          {he
            ? "תוצאת השמירה אינה ידועה. רעננו ובדקו אם התוכנית נשמרה לפני ניסיון נוסף."
            : "The save result is unknown. Refresh and check whether the schedule exists before trying again."}
        </p>
      ) : null}
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
          <SectionCard title={he ? "תוכניות קיימות" : "Existing schedules"}>
            <RecordTable
              columns={columns}
              rows={rows}
              locale={locale}
              empty={he ? "אין חיובים מחזוריים." : "No recurring schedules."}
              onSelect={edit}
            />
            {rows.map((row) => (
              <div className={styles.actionRow} key={read(row, "id")}>
                {(read(row, "status") || read(row, "state")) === "active" ? (
                  <ActionButton
                    label={he ? "השהיה" : "Pause"}
                    onClick={() =>
                      void action("recurring_pause", {
                        id: read(row, "id"),
                        expected_revision: Number(row.revision) || 0,
                        reason: he ? "השהיה לבקשת מנהל" : "Paused by manager",
                      })
                    }
                  />
                ) : (
                  <ActionButton
                    label={he ? "חידוש" : "Resume"}
                    onClick={() =>
                      void action("recurring_resume", {
                        id: read(row, "id"),
                        expected_revision: Number(row.revision) || 0,
                      })
                    }
                  />
                )}
                <ActionButton
                  label={he ? "ביטול" : "Cancel"}
                  kind="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        he
                          ? "לבטל את החיוב המחזורי?"
                          : "Cancel this recurring schedule?",
                      )
                    )
                      void action("recurring_cancel", {
                        id: read(row, "id"),
                        expected_revision: Number(row.revision) || 0,
                        reason: he
                          ? "בוטל דרך הממשק"
                          : "Cancelled from management",
                      });
                  }}
                />
              </div>
            ))}
          </SectionCard>
          {access.allowed("manageRecurring") ? (
            <SectionCard
              title={he ? "תיעוד הסכמה והגדרה" : "Record consent and schedule"}
            >
              <div className={styles.grid3}>
                <FormField label={he ? "שם תוכנית" : "Schedule name"} required>
                  {(p) => (
                    <input
                      {...p}
                      className={styles.fieldInput}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label={he ? "מזהה לקוח" : "Customer ID"}>
                  {(p) => (
                    <input
                      {...p}
                      className={styles.fieldInput}
                      dir="ltr"
                      value={form.customer_id}
                      onChange={(e) =>
                        setForm({ ...form, customer_id: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label={he ? "סכום (₪)" : "Amount (ILS)"} required>
                  {(p) => (
                    <input
                      {...p}
                      className={styles.fieldInput}
                      inputMode="decimal"
                      dir="ltr"
                      value={form.amount}
                      onChange={(e) =>
                        setForm({ ...form, amount: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label={he ? "מחזור (חודשים)" : "Interval (months)"}>
                  {(p) => (
                    <select
                      {...p}
                      className={styles.fieldSelect}
                      value={form.interval}
                      onChange={(e) =>
                        setForm({ ...form, interval: e.target.value })
                      }
                    >
                      {[1, 2, 3, 6, 12].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField label={he ? "חיוב הבא" : "Next charge"} required>
                  {(p) => (
                    <input
                      {...p}
                      type="datetime-local"
                      className={styles.fieldInput}
                      value={form.next}
                      onChange={(e) =>
                        setForm({ ...form, next: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField
                  label={he ? "אסמכתת הסכמה" : "Consent reference"}
                  required
                >
                  {(p) => (
                    <input
                      {...p}
                      className={styles.fieldInput}
                      value={form.consent}
                      onChange={(e) =>
                        setForm({ ...form, consent: e.target.value })
                      }
                    />
                  )}
                </FormField>
              </div>
              <p className={styles.helpText}>
                {he
                  ? "יש לתעד אסמכתה להסכמה שניתנה מחוץ למסך. לא ניתן להפעיל גבייה מכאן."
                  : "Record a reference to consent obtained outside this screen. This workspace cannot initiate charges."}
              </p>
              <ActionButton
                label={he ? "שמירת הגדרה" : "Save schedule"}
                kind="primary"
                disabled={
                  saving ||
                  createWriteUnknown ||
                  !form.name ||
                  !form.amount ||
                  !form.next ||
                  !form.consent ||
                  !access.allowed("manageRecurring")
                }
                onClick={() => {
                  try {
                    const cents = toAgorot(form.amount);
                    const date = new Date(form.next);
                    if (
                      !Number.isSafeInteger(cents) ||
                      cents <= 0 ||
                      !Number.isFinite(date.getTime())
                    )
                      throw new Error();
                    void action("recurring_save", {
                      name: form.name.trim(),
                      ...(form.customer_id
                        ? { customer_id: form.customer_id }
                        : {}),
                      amount_agorot: cents,
                      currency: "ILS",
                      interval_months: Number(form.interval),
                      next_charge_at: date.toISOString(),
                      consent_reference: form.consent.trim(),
                    });
                  } catch {
                    setFeedback(
                      he
                        ? "בדקו את הסכום ואת מועד החיוב."
                        : "Check the amount and next charge date.",
                    );
                  }
                }}
              />
            </SectionCard>
          ) : null}
        </div>
      </SectionState>
    </CommercePage>
  );
}
