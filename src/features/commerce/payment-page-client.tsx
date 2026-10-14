"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "@/components/motion/motion-link";
import { formatAgorot, MAX_AGOROT } from "@/lib/commerce/money";
import styles from "./payment.module.css";

type CheckoutStatus = {
  intent: {
    id: string;
    status: string;
    total_agorot: number;
    remaining_agorot: number;
    channel: "pos" | "website";
    read_only_expired: boolean;
    order_number: string | null;
    currency: string;
    expires_at: string;
    order_id: string | null;
  };
  resume_pos_url: string | null;
  attempts: {
    id: string;
    state: string;
    method: string;
    amount_agorot: number;
    idempotency_key: string;
  }[];
  readiness: {
    configured: boolean;
    environment: string | null;
    capabilities: { hostedCard: string; bit: string; installments: string };
  };
};
type AmbiguousLeg = {
  intentId: string;
  method: "credit_card" | "bit";
  count: number;
  amount: number;
  key: string;
  selector: string;
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNRESOLVED_STATES = new Set([
  "created",
  "pending",
  "unknown",
  "authorized",
  "exception",
]);
const RESOLVED_STATES = new Set([
  "captured",
  "declined",
  "voided",
  "partially_refunded",
  "refunded",
]);

/** A successful HTTP response for a different intent is never authority to collect. */
export function isPaymentPageStatus(
  value: unknown,
  intentId: string,
): value is CheckoutStatus {
  if (!value || typeof value !== "object") return false;
  const data = value as CheckoutStatus;
  const intent = data.intent;
  return Boolean(
    intent &&
    intent.id === intentId &&
    intent.currency === "ILS" &&
    ["pos", "website"].includes(intent.channel) &&
    typeof intent.read_only_expired === "boolean" &&
    typeof intent.status === "string" &&
    Number.isSafeInteger(intent.total_agorot) &&
    intent.total_agorot >= 0 &&
    intent.total_agorot <= MAX_AGOROT &&
    Number.isSafeInteger(intent.remaining_agorot) &&
    intent.remaining_agorot >= 0 &&
    intent.remaining_agorot <= intent.total_agorot &&
    Array.isArray(data.attempts) &&
    data.attempts.every(
      (attempt) =>
        attempt &&
        typeof attempt.state === "string" &&
        typeof attempt.idempotency_key === "string" &&
        typeof attempt.method === "string" &&
        Number.isSafeInteger(attempt.amount_agorot) &&
        attempt.amount_agorot > 0 &&
        attempt.amount_agorot <= MAX_AGOROT,
    ) &&
    data.readiness &&
    typeof data.readiness.configured === "boolean" &&
    data.readiness.capabilities &&
    typeof data.readiness.capabilities.hostedCard === "string" &&
    typeof data.readiness.capabilities.bit === "string" &&
    typeof data.readiness.capabilities.installments === "string",
  );
}
export function isAmbiguousPaymentLeg(
  value: unknown,
  intentId: string,
): value is AmbiguousLeg {
  if (!value || typeof value !== "object") return false;
  const leg = value as AmbiguousLeg;
  return (
    leg.intentId === intentId &&
    ["credit_card", "bit"].includes(leg.method) &&
    Number.isInteger(leg.count) &&
    leg.count >= 1 &&
    leg.count <= 24 &&
    (leg.method !== "bit" || leg.count === 1) &&
    Number.isSafeInteger(leg.amount) &&
    leg.amount > 0 &&
    leg.amount <= MAX_AGOROT &&
    typeof leg.key === "string" &&
    UUID_PATTERN.test(leg.key) &&
    leg.selector === `${leg.method}:${leg.count}:${leg.amount}`
  );
}
function hasUnresolvedAttempt(status: CheckoutStatus): boolean {
  return status.attempts.some(
    (attempt) =>
      UNRESOLVED_STATES.has(attempt.state) ||
      !RESOLVED_STATES.has(attempt.state),
  );
}
export function isPaymentPageCollectable(status: CheckoutStatus): boolean {
  return (
    status.readiness.configured &&
    !status.intent.read_only_expired &&
    !status.intent.order_id &&
    ["reserved", "awaiting_payment", "partially_paid"].includes(
      status.intent.status,
    ) &&
    status.intent.remaining_agorot > 0 &&
    !hasUnresolvedAttempt(status)
  );
}

export function PaymentPageClient({
  locale,
  intentId,
}: {
  locale: "he" | "en";
  intentId: string;
}) {
  const he = locale === "he";
  const localeRef = useRef(he);
  useLayoutEffect(() => {
    localeRef.current = he;
  }, [he]);
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [installments, setInstallments] = useState(1);
  const [linkToken, setLinkToken] = useState("");
  const [ambiguousLeg, setAmbiguousLeg] = useState<AmbiguousLeg | null>(null);
  const ambiguousRef = useRef<AmbiguousLeg | null>(null);
  const submittingRef = useRef(false);
  const verifiedRef = useRef(false);
  const keys = useRef<Record<string, string>>({});
  const controller = useRef<AbortController | null>(null);
  const contextRef = useRef({ intentId, generation: 0 });
  useLayoutEffect(() => {
    controller.current?.abort();
    contextRef.current = {
      intentId,
      generation: contextRef.current.generation + 1,
    };
    keys.current = {};
    ambiguousRef.current = null;
    submittingRef.current = false;
    verifiedRef.current = false;
  }, [intentId]);

  const load = useCallback(async (): Promise<CheckoutStatus | null> => {
    if (contextRef.current.intentId !== intentId) return null;
    const generation = contextRef.current.generation;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    verifiedRef.current = false;
    setVerified(false);
    setLoading(true);
    const isCurrent = () =>
      !current.signal.aborted &&
      contextRef.current.intentId === intentId &&
      contextRef.current.generation === generation;
    try {
      const response = await fetch(`/api/commerce/intents/${intentId}`, {
        cache: "no-store",
        signal: current.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isPaymentPageStatus(data, intentId))
        throw new Error("unavailable");
      if (!isCurrent()) return null;
      const uncertain = ambiguousRef.current;
      if (uncertain) {
        // Absence can race a still-running write: retain that exact leg/key until its attempt is observed.
        const attempt = data.attempts.find(
          (entry) => entry.idempotency_key === uncertain.key,
        );
        if (
          attempt &&
          (attempt.method !== uncertain.method ||
            attempt.amount_agorot !== uncertain.amount)
        )
          throw new Error("operation_conflict");
        if (
          attempt &&
          ["captured", "declined", "voided"].includes(attempt.state)
        ) {
          ambiguousRef.current = null;
          setAmbiguousLeg(null);
          try {
            sessionStorage.removeItem(
              `miro.payment.keys.${intentId}.uncertain`,
            );
          } catch {
            /* memory still retains safety state */
          }
        }
      }
      verifiedRef.current = true;
      setVerified(true);
      setStatus(data);
      setLinkToken("");
      setError("");
      return data;
    } catch {
      if (isCurrent()) {
        verifiedRef.current = false;
        setVerified(false);
        setStatus(null);
        setError(
          localeRef.current
            ? "לא ניתן לאמת את מצב התשלום. בדקו את המצב; אין לנסות חיוב נוסף לפני אימות."
            : "Payment status could not be verified. Check status; another charge stays blocked until verification.",
        );
      }
      return null;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [intentId]);

  useEffect(() => {
    let cancelled = false;
    const generation = contextRef.current.generation;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    queueMicrotask(() => {
      if (cancelled || contextRef.current.generation !== generation) return;
      if (token && /^[0-9a-f]{64}$/.test(token))
        window.history.replaceState(null, "", window.location.pathname);
      setStatus(null);
      setError("");
      setLoading(true);
      setVerified(false);
      setSubmitting(false);
      setInstallments(1);
      setLinkToken("");
      setAmbiguousLeg(null);
      try {
        const saved: unknown = JSON.parse(
          sessionStorage.getItem(`miro.payment.keys.${intentId}.uncertain`) ??
            "null",
        );
        if (isAmbiguousPaymentLeg(saved, intentId)) {
          ambiguousRef.current = saved;
          setAmbiguousLeg(saved);
          setInstallments(saved.count);
        }
      } catch {
        /* storage is optional; this mounted tab keeps its in-memory key */
      }
      if (token && /^[0-9a-f]{64}$/.test(token)) {
        setLinkToken(token);
        setLoading(false);
      } else void load();
    });
    return () => {
      cancelled = true;
      controller.current?.abort();
    };
  }, [intentId, load]);

  async function claimLink() {
    if (
      !linkToken ||
      submittingRef.current ||
      contextRef.current.intentId !== intentId
    )
      return;
    const generation = contextRef.current.generation;
    submittingRef.current = true;
    setSubmitting(true);
    verifiedRef.current = false;
    setVerified(false);
    try {
      const response = await fetch("/api/commerce/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId, token: linkToken }),
      });
      if (contextRef.current.generation !== generation) return;
      if (!response.ok) throw new Error("unavailable");
      setLinkToken("");
      await load();
    } catch {
      if (contextRef.current.generation === generation) {
        setStatus(null);
        setError(
          he
            ? "הקישור אינו זמין או שתוצאת הפתיחה אינה ידועה. פנו לעסק לפני תשלום."
            : "This link is unavailable or its opening result is unknown. Contact the business before payment.",
        );
      }
    } finally {
      if (contextRef.current.generation === generation) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }
  const currentStatus = status?.intent.id === intentId ? status : null;
  const final =
    currentStatus &&
    ["paid", "cancelled", "expired"].includes(currentStatus.intent.status);
  useEffect(() => {
    if (linkToken || final) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !submittingRef.current)
        void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [linkToken, final, load]);
  const unresolved = currentStatus
    ? hasUnresolvedAttempt(currentStatus)
    : false;
  const newPaymentBlocked =
    !verified ||
    !currentStatus ||
    !isPaymentPageCollectable(currentStatus) ||
    (ambiguousLeg !== null &&
      ambiguousLeg.amount !== currentStatus.intent.remaining_agorot);

  async function start(method: "credit_card" | "bit") {
    if (
      submittingRef.current ||
      !verifiedRef.current ||
      !currentStatus ||
      !isPaymentPageCollectable(currentStatus) ||
      contextRef.current.intentId !== intentId
    )
      return;
    const generation = contextRef.current.generation;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      // Always query authority at the user action boundary, never rely on a previous render/poll.
      const fresh = await load();
      if (
        !fresh ||
        contextRef.current.generation !== generation ||
        !isPaymentPageCollectable(fresh)
      )
        return;
      if (
        fresh.readiness.capabilities[
          method === "credit_card" ? "hostedCard" : "bit"
        ] !== "enabled"
      )
        return;
      const uncertain = ambiguousRef.current;
      const count = uncertain
        ? uncertain.count
        : method === "bit"
          ? 1
          : fresh.readiness.capabilities.installments === "enabled"
            ? installments
            : 1;
      const amount = fresh.intent.remaining_agorot;
      const selector = `${method}:${count}:${amount}`;
      if (
        uncertain &&
        (uncertain.intentId !== intentId ||
          uncertain.method !== method ||
          uncertain.amount !== amount ||
          uncertain.selector !== selector)
      ) {
        setError(
          he
            ? "קיים ניסיון שלא הוכרע. יש לבדוק את אותו תשלום לפני שינוי אמצעי או סכום."
            : "An unresolved request exists. Reconcile that same payment before changing its method or amount.",
        );
        return;
      }
      const storageKey = `miro.payment.keys.${intentId}`;
      try {
        const saved: unknown = JSON.parse(
          sessionStorage.getItem(storageKey) ?? "{}",
        );
        if (saved && typeof saved === "object" && !Array.isArray(saved))
          for (const [key, value] of Object.entries(saved))
            if (typeof value === "string" && UUID_PATTERN.test(value))
              keys.current[key] ??= value;
      } catch {
        /* in-memory fallback */
      }
      const previous = fresh.attempts.find(
        (attempt) => attempt.idempotency_key === keys.current[selector],
      );
      if (
        !uncertain &&
        previous &&
        ["declined", "voided"].includes(previous.state)
      )
        delete keys.current[selector];
      keys.current[selector] =
        uncertain?.key ?? keys.current[selector] ?? crypto.randomUUID();
      const leg: AmbiguousLeg = {
        intentId,
        method,
        count,
        amount,
        selector,
        key: keys.current[selector],
      };
      ambiguousRef.current = leg;
      setAmbiguousLeg(leg);
      verifiedRef.current = false;
      setVerified(false);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(keys.current));
        sessionStorage.setItem(`${storageKey}.uncertain`, JSON.stringify(leg));
      } catch {
        /* in-memory fallback */
      }
      const response = await fetch("/api/commerce/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent_id: intentId,
          method,
          installments: count,
          amount_agorot: amount,
          locale,
          idempotency_key: leg.key,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        redirect_url?: string;
      } | null;
      if (contextRef.current.generation !== generation) return;
      if (!response.ok || !data?.redirect_url) throw new Error("unknown");
      const redirect = new URL(data.redirect_url, window.location.origin);
      if (
        redirect.protocol !== "https:" &&
        redirect.origin !== window.location.origin
      )
        throw new Error("invalid_redirect");
      window.location.assign(redirect.href);
    } catch {
      if (contextRef.current.generation === generation) {
        setError(
          he
            ? "לא התקבלה תוצאת חיוב ודאית. בדקו את המצב לפני ניסיון נוסף."
            : "No definite payment outcome was returned. Check status before another attempt.",
        );
        await load();
      }
    } finally {
      if (contextRef.current.generation === generation) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  const labels: Record<string, string> = he
    ? {
        reserved: "מוכן לתשלום",
        awaiting_payment: "ממתין לאישור תשלום",
        partially_paid: "תשלום חלקי",
        paid: "התשלום אושר",
        expired: "תוקף הבקשה הסתיים",
        cancelled: "הבקשה בוטלה",
        exception: "התשלום דורש בדיקה",
      }
    : {
        reserved: "Ready for payment",
        awaiting_payment: "Awaiting payment confirmation",
        partially_paid: "Partially paid",
        paid: "Payment confirmed",
        expired: "Request expired",
        cancelled: "Request cancelled",
        exception: "Payment needs review",
      };
  return (
    <section
      className={styles.page}
      dir={he ? "rtl" : "ltr"}
      aria-label={he ? "תשלום מאובטח" : "Secure payment"}
    >
      <section className={styles.card} aria-busy={loading || submitting}>
        <p className={styles.brand}>MIRO</p>
        <h1>{he ? "תשלום מאובטח" : "Secure payment"}</h1>
        <p>
          {he
            ? "פרטי האשראי מוזנים בעמוד של ספק הסליקה. מצב התשלום מתעדכן לאחר אימות בשרת."
            : "Card details are entered on the payment provider's page. The payment status updates after server verification."}
        </p>
        {linkToken ? (
          <button
            type="button"
            className="miro-button miro-button-primary"
            disabled={submitting}
            onClick={() => void claimLink()}
          >
            {he ? "פתיחת בקשת התשלום" : "Open payment request"}
          </button>
        ) : null}
        {loading ? (
          <p role="status">
            {he ? "בודק מצב תשלום…" : "Checking payment status…"}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {currentStatus ? (
          <>
            <p className={styles.amount} dir="ltr">
              {formatAgorot(currentStatus.intent.total_agorot, locale)}
            </p>
            {currentStatus.intent.remaining_agorot !==
              currentStatus.intent.total_agorot &&
            !currentStatus.intent.order_id ? (
              <p>
                {he ? "יתרה לתשלום:" : "Remaining balance:"}{" "}
                <strong dir="ltr">
                  {formatAgorot(currentStatus.intent.remaining_agorot, locale)}
                </strong>
              </p>
            ) : null}
            <p role="status">
              {labels[currentStatus.intent.status] ??
                (he ? "דורש בדיקה" : "Needs review")}
            </p>
            {currentStatus.readiness.environment === "sandbox" ? (
              <p className={styles.warning}>
                {he
                  ? "סביבת בדיקה — אין חיוב אמיתי"
                  : "Sandbox — no real payment"}
              </p>
            ) : null}
            {currentStatus.intent.order_id ? (
              <p>
                {currentStatus.intent.order_number
                  ? he
                    ? "מספר הזמנה:"
                    : "Order:"
                  : he
                    ? "מזהה הזמנה:"
                    : "Order ID:"}{" "}
                <span dir="ltr">
                  {currentStatus.intent.order_number ??
                    currentStatus.intent.order_id}
                </span>
              </p>
            ) : null}
            {!final && !currentStatus.readiness.configured ? (
              <p>
                {he
                  ? "סליקה מקוונת עדיין אינה זמינה. אפשר לפנות לעסק להשלמת התשלום."
                  : "Online collection is not available yet. Contact the business to complete payment."}
              </p>
            ) : null}
            {currentStatus.intent.read_only_expired ? (
              <p className={styles.warning}>
                {he
                  ? "הבקשה אינה פתוחה לחיוב נוסף. ניתן להמשיך לבדוק את התוצאה או לפנות לעסק."
                  : "This request is closed to new charges. Continue checking its result or contact the business."}
              </p>
            ) : null}
            {unresolved ? (
              <p className={styles.warning}>
                {he
                  ? "קיים ניסיון תשלום פתוח. ממתינים לאימות לפני חיוב נוסף."
                  : "A payment attempt is open. Awaiting verification before another charge."}
              </p>
            ) : null}
            {ambiguousLeg && verified && !unresolved && !final ? (
              <p className={styles.warning}>
                {he
                  ? "הבקשה הקודמת טרם אומתה. בדקו שוב או המשיכו את אותו תשלום, אם זמין. אמצעי התשלום והתשלומים נשארים מוגנים משינוי."
                  : "The previous request has not been confirmed. Check again or resume that same payment if available. Its method and installments stay locked."}
              </p>
            ) : null}
            {currentStatus.readiness.capabilities.installments === "enabled" ? (
              <label>
                {he ? "תשלומים" : "Installments"}
                <select
                  value={installments}
                  aria-label={he ? "תשלומים" : "Installments"}
                  disabled={
                    submitting ||
                    !verified ||
                    !!ambiguousLeg ||
                    !!unresolved ||
                    !!final ||
                    newPaymentBlocked
                  }
                  onChange={(event) =>
                    setInstallments(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 24 }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!final ? (
              <div className={styles.actions}>
                {currentStatus.readiness.capabilities.hostedCard ===
                "enabled" ? (
                  <button
                    className="miro-button miro-button-primary"
                    disabled={
                      submitting ||
                      !verified ||
                      !!unresolved ||
                      currentStatus.intent.remaining_agorot <= 0 ||
                      newPaymentBlocked ||
                      (ambiguousLeg !== null &&
                        ambiguousLeg.method !== "credit_card")
                    }
                    onClick={() => void start("credit_card")}
                  >
                    {ambiguousLeg
                      ? he
                        ? "המשך בקשת אשראי"
                        : "Resume card request"
                      : he
                        ? "תשלום באשראי"
                        : "Pay by card"}
                  </button>
                ) : null}
                {currentStatus.readiness.capabilities.bit === "enabled" ? (
                  <button
                    className="miro-button miro-button-secondary"
                    disabled={
                      submitting ||
                      !verified ||
                      !!unresolved ||
                      currentStatus.intent.remaining_agorot <= 0 ||
                      newPaymentBlocked ||
                      (ambiguousLeg !== null && ambiguousLeg.method !== "bit")
                    }
                    onClick={() => void start("bit")}
                  >
                    {ambiguousLeg
                      ? he
                        ? "המשך בקשת bit"
                        : "Resume bit request"
                      : he
                        ? "תשלום ב־bit"
                        : "Pay with bit"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        <div className={styles.actions}>
          <button
            className="miro-button miro-button-secondary"
            onClick={() => void load()}
            disabled={submitting}
          >
            {he ? "בדיקת מצב" : "Check status"}
          </button>
          {currentStatus?.resume_pos_url === "/admin/pos" ? (
            <Link href={`/${locale}/admin/pos?resume=1`}>
              {he ? "חזרה לקופה ובדיקת המכירה" : "Return to POS and check sale"}
            </Link>
          ) : (
            <Link href={`/${locale}`}>
              {he ? "חזרה לחנות" : "Back to store"}
            </Link>
          )}
        </div>
      </section>
    </section>
  );
}
