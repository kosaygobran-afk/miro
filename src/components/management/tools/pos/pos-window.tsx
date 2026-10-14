"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useManagementTools } from "../management-tool-provider";
import { toAgorot } from "@/lib/commerce/money";
import {
  computePosTotals,
  comparePosQuote,
  getPosPaymentRecovery,
  canResumeManualPosIntent,
  generateIdempotencyKey,
  getEffectivePrice,
  hasSellPrice,
  validatePaymentTotal,
} from "./pos-utils";
import type { Locale } from "@/lib/i18n";
import type {
  PosCartLine,
  PosPayment,
  PosCustomer,
  PosCatalogItem,
  PosVariant,
  PosGatewayCapabilities,
  PosQuotedLine,
  PosPaymentAttemptSnapshot,
} from "./pos-types";
import { PosShell } from "./pos-shell";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,120}$/;
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PAYMENT_METHODS = new Set([
  "cash",
  "credit_card",
  "bit",
  "bank_transfer",
  "check",
  "other",
]);
interface PendingIntent {
  id: string;
  totalAgorot: number;
  snapshot: string;
}
interface IntentStatus {
  intent: {
    id: string;
    total_agorot: number;
    order_id: string | null;
    order_number?: string | null;
    status: string;
    expires_at?: string;
  };
  attempts: PosPaymentAttemptSnapshot[];
  items?: PosQuotedLine[];
}
function emptyLine(): PosCartLine {
  return {
    key: generateIdempotencyKey(),
    variantId: "",
    quantity: 1,
    unitPrice: 0,
    discountPerUnit: 0,
    product: null,
    variant: null,
  };
}
function emptyPayment(): PosPayment {
  return {
    id: generateIdempotencyKey(),
    method: "cash",
    collectionKind: "manual_recorded",
    amount: 0,
    installments: 1,
    reference: "",
  };
}
function validMoney(value: unknown): value is number {
  try {
    return typeof value === "number" && toAgorot(value) >= 0;
  } catch {
    return false;
  }
}
function restoreLine(value: unknown): value is PosCartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as PosCartLine;
  return (
    typeof line.key === "string" &&
    UUID_PATTERN.test(line.variantId) &&
    Number.isSafeInteger(line.quantity) &&
    line.quantity > 0 &&
    line.quantity <= 10000 &&
    validMoney(line.unitPrice) &&
    validMoney(line.discountPerUnit) &&
    line.discountPerUnit <= line.unitPrice
  );
}
function restorePayment(value: unknown): value is PosPayment {
  if (!value || typeof value !== "object") return false;
  const payment = value as PosPayment;
  return (
    typeof payment.id === "string" &&
    KEY_PATTERN.test(payment.id) &&
    PAYMENT_METHODS.has(payment.method) &&
    validMoney(payment.amount) &&
    typeof payment.reference === "string" &&
    payment.reference.length <= 120 &&
    (payment.cashReceived === undefined || validMoney(payment.cashReceived))
  );
}
function restoreCustomer(value: unknown): PosCustomer | null {
  if (!value || typeof value !== "object") return null;
  const customer = value as PosCustomer;
  if (
    typeof customer.name !== "string" ||
    typeof customer.email !== "string" ||
    typeof customer.phone !== "string"
  )
    return null;
  return {
    name: customer.name.slice(0, 200),
    email: customer.email.slice(0, 254),
    phone: customer.phone.slice(0, 30),
    ...(customer.accountId && UUID_PATTERN.test(customer.accountId)
      ? { accountId: customer.accountId, id: customer.accountId }
      : {}),
  };
}

export function PosWindow({
  locale,
  userId,
}: {
  locale: Locale;
  userId: string;
}) {
  const actorRef = useRef(userId);
  useLayoutEffect(() => {
    actorRef.current = userId;
  }, [userId]);
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const { saveDraft, clearDraft, getDraft } = useManagementTools();
  const [lines, setLines] = useState<PosCartLine[]>(() => [emptyLine()]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [payments, setPayments] = useState<PosPayment[]>(() => [
    emptyPayment(),
  ]);
  const [vatRate, setVatRate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(
    null,
  );
  const [attemptedSnapshot, setAttemptedSnapshot] = useState<string | null>(
    null,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const latestDraftRef = useRef<{
    userId: string;
    draft: Record<string, unknown>;
  } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [gatewayCapabilities, setGatewayCapabilities] =
    useState<PosGatewayCapabilities>({ hostedCard: false, bit: false });
  const locked = Boolean(pendingIntent || attemptedSnapshot);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/management/tax", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        const current = (
          Array.isArray(data?.taxRates) ? data.taxRates : []
        ).find(
          (row: { status?: string; is_active?: boolean }) =>
            row.status === "current" && row.is_active !== false,
        );
        if (
          typeof current?.rate === "number" &&
          Number.isFinite(current.rate) &&
          current.rate >= 0 &&
          current.rate <= 100
        )
          setVatRate(current.rate);
      })
      .catch(() => undefined);
    void fetch("/api/management/commerce/integrations", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        const capabilities = (data?.runtime ?? data?.readiness)?.capabilities;
        setGatewayCapabilities({
          hostedCard: capabilities?.hostedCard === "enabled",
          bit: capabilities?.bit === "enabled",
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = getDraft("pos");
      const draft =
        raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : null;
      const expired =
        draft &&
        typeof draft.savedAt === "number" &&
        Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS &&
        !draft.pendingIntent &&
        !draft.attemptedSnapshot;
      if (expired) clearDraft("pos");
      if (draft && !expired) {
        setIdempotencyKey(
          typeof draft.idempotencyKey === "string" &&
            KEY_PATTERN.test(draft.idempotencyKey)
            ? draft.idempotencyKey
            : generateIdempotencyKey(),
        );
        setCustomer(restoreCustomer(draft.customer));
        let restoredLines = Array.isArray(draft.lines)
          ? draft.lines.filter(restoreLine)
          : [];
        let restoredPayments = Array.isArray(draft.payments)
          ? draft.payments.filter(restorePayment).map((payment) => ({
              ...payment,
              collectionKind:
                payment.collectionKind === "provider_collected"
                  ? ("provider_collected" as const)
                  : ("manual_recorded" as const),
              installments: 1,
            }))
          : [];
        try {
          computePosTotals(restoredLines, restoredPayments, null);
        } catch {
          restoredLines = [];
          restoredPayments = [];
          setFormErrors({
            items:
              locale === "he"
                ? "טיוטה לא תקינה נדחתה. יש לבדוק כל מכירה ממתינה."
                : "An invalid draft was rejected. Review any pending sale.",
          });
        }
        setLines(restoredLines.length ? restoredLines : [emptyLine()]);
        setPayments(
          restoredPayments.length ? restoredPayments : [emptyPayment()],
        );
        const pending = draft.pendingIntent as
          Partial<PendingIntent> | undefined;
        setPendingIntent(
          pending &&
            typeof pending.id === "string" &&
            UUID_PATTERN.test(pending.id) &&
            Number.isSafeInteger(pending.totalAgorot) &&
            typeof pending.snapshot === "string"
            ? (pending as PendingIntent)
            : null,
        );
        setAttemptedSnapshot(
          typeof draft.attemptedSnapshot === "string"
            ? draft.attemptedSnapshot
            : typeof pending?.snapshot === "string"
              ? pending.snapshot
              : null,
        );
      } else {
        setIdempotencyKey(generateIdempotencyKey());
        setCustomer(null);
        setLines([emptyLine()]);
        setPayments([emptyPayment()]);
        setPendingIntent(null);
        setAttemptedSnapshot(null);
      }
      setReadyUser(userId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId, getDraft, clearDraft, locale]);

  useLayoutEffect(() => {
    if (readyUser !== userId) return;
    latestDraftRef.current = {
      userId,
      draft: {
        idempotencyKey,
        customer,
        lines,
        payments,
        pendingIntent,
        attemptedSnapshot,
        savedAt: Date.now(),
      },
    };
  }, [
    readyUser,
    userId,
    idempotencyKey,
    customer,
    lines,
    payments,
    pendingIntent,
    attemptedSnapshot,
  ]);

  useEffect(() => {
    if (readyUser !== userId) return;
    const snapshot = {
      idempotencyKey,
      customer,
      lines,
      payments,
      pendingIntent,
      attemptedSnapshot,
      savedAt: Date.now(),
    };
    const timer = window.setTimeout(() => saveDraft("pos", snapshot), 150);
    // A deliberate close immediately after editing must not discard the last change.
    return () => {
      window.clearTimeout(timer);
      // Never overwrite a synchronously persisted financial operation with an older effect closure.
      const latest = latestDraftRef.current;
      if (latest?.userId === userId) saveDraft("pos", latest.draft);
    };
  }, [
    readyUser,
    userId,
    idempotencyKey,
    customer,
    lines,
    payments,
    pendingIntent,
    attemptedSnapshot,
    saveDraft,
  ]);

  const selectedLines = lines.filter((line) => Boolean(line.variantId));
  let total = 0;
  try {
    total = computePosTotals(lines, payments, vatRate).total;
  } catch {
    /* Validation below reports invalid local amounts. */
  }
  const mutationAllowed = !saving && !locked && readyUser === userId;
  const updateLine = useCallback(
    (key: string, patch: Partial<PosCartLine>) => {
      if (!mutationAllowed) return;
      const updated = lines.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      );
      try {
        computePosTotals(updated, payments, vatRate);
      } catch {
        setFormErrors((previous) => ({
          ...previous,
          items:
            locale === "he"
              ? "הכמות או הסכום חורגים מהטווח הנתמך."
              : "Quantity or amount exceeds the supported range.",
        }));
        return;
      }
      setLines(updated);
      setFormErrors((previous) => ({ ...previous, items: "" }));
    },
    [mutationAllowed, lines, payments, vatRate, locale],
  );
  const handleVariantPick = useCallback(
    (product: PosCatalogItem, variant: PosVariant) => {
      if (!mutationAllowed || savingRef.current) return;
      const price = getEffectivePrice(product, variant);
      if (
        !hasSellPrice(product, variant) ||
        !validMoney(price) ||
        (product.tracking_mode !== "none" && variant.stock_qty < 1)
      ) {
        setFormErrors((previous) => ({
          ...previous,
          items:
            locale === "he"
              ? "הפריט אינו זמין למכירה."
              : "This item is unavailable for sale.",
        }));
        return;
      }
      setLines((previous) => {
        const matched = previous.find((line) => line.variantId === variant.id);
        if (
          matched &&
          (matched.quantity >= 10000 ||
            (product.tracking_mode !== "none" &&
              matched.quantity >= variant.stock_qty))
        )
          return previous;
        if (matched) {
          const updated = previous.map((line) =>
            line.variantId === variant.id
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          );
          try {
            computePosTotals(updated, [], null);
            return updated;
          } catch {
            return previous;
          }
        }
        const newEntry = {
          ...emptyLine(),
          variantId: variant.id,
          product,
          variant,
          unitPrice: price,
        };
        const updated = [
          ...previous.filter((line) => Boolean(line.variantId)),
          newEntry,
        ];
        try {
          computePosTotals(updated, [], null);
          return updated;
        } catch {
          return previous;
        }
      });
      setFormErrors((previous) => ({ ...previous, items: "" }));
      setSuccessMessage(null);
    },
    [mutationAllowed, locale],
  );
  const handleRemoveLine = useCallback(
    (key: string) => {
      if (!mutationAllowed) return;
      setLines((previous) => {
        const remaining = previous.filter((line) => line.key !== key);
        return remaining.length ? remaining : [emptyLine()];
      });
    },
    [mutationAllowed],
  );
  const handleClearCart = () => {
    if (!mutationAllowed) return;
    setLines([emptyLine()]);
    setPayments([emptyPayment()]);
    setFormErrors({});
    setSaveError("");
  };
  const handleCustomerChange = (value: PosCustomer | null) => {
    if (mutationAllowed) {
      setCustomer(value);
      setFormErrors((previous) => ({ ...previous, customer: "" }));
    }
  };
  const handlePaymentChange = (value: PosPayment[]) => {
    if (mutationAllowed) {
      try {
        computePosTotals(lines, value, vatRate);
      } catch {
        setFormErrors((previous) => ({
          ...previous,
          payments: t({
            he: "סכומי התשלום חורגים מהטווח הנתמך.",
            en: "Payment amounts exceed the supported range.",
          }),
        }));
        return;
      }
      setPayments(value);
      setFormErrors((previous) => ({ ...previous, payments: "" }));
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (
      customer &&
      (!customer.name.trim() ||
        customer.name.length > 200 ||
        customer.email.length > 254 ||
        customer.phone.length > 30 ||
        (customer.email.trim() &&
          !/^\S+@\S+\.\S+$/.test(customer.email.trim())))
    )
      errors.customer = t({
        he: "בדקו את שם הלקוח ופרטי ההתקשרות.",
        en: "Check customer name and contact details.",
      });
    if (!selectedLines.length || selectedLines.length > 100)
      errors.items = t({
        he: "הוסיפו בין פריט אחד ל-100 פריטי קטלוג.",
        en: "Add between 1 and 100 catalog lines.",
      });
    if (
      new Set(selectedLines.map((line) => line.variantId)).size !==
      selectedLines.length
    )
      errors.items = t({
        he: "קיימים פריטים כפולים בעגלה. עדכנו את העגלה לפני תשלום.",
        en: "Duplicate cart lines exist. Update the cart before payment.",
      });
    for (const line of selectedLines) {
      if (!restoreLine(line))
        errors.items = t({
          he: "יש להזין כמות שלמה ומחירים תקינים לפריטי קטלוג.",
          en: "Catalog lines require a whole quantity and valid prices.",
        });
      if (
        line.product?.tracking_mode !== "none" &&
        line.variant &&
        line.quantity > line.variant.stock_qty
      )
        errors.items = t({
          he: "הכמות גבוהה מהמלאי הזמין. עדכנו את העגלה.",
          en: "Quantity exceeds available stock. Update the cart.",
        });
    }
    if (
      total <= 0 ||
      !validatePaymentTotal(payments, total) ||
      payments.length > 6
    )
      errors.payments = t({
        he: "סכומי תשלום חיוביים חייבים להשתוות לסכום המכירה בדיוק.",
        en: "Positive payment amounts must exactly match the sale total.",
      });
    for (const payment of payments) {
      if (!restorePayment(payment) || payment.installments !== 1)
        errors.payments = t({
          he: "בדקו את פרטי התשלום. תשלומים מרובים אינם מופעלים.",
          en: "Check payment details. Installments are not enabled.",
        });
      if (
        payment.collectionKind === "provider_collected" &&
        !(
          (payment.method === "credit_card" &&
            gatewayCapabilities.hostedCard) ||
          (payment.method === "bit" && gatewayCapabilities.bit)
        )
      )
        errors.payments = t({
          he: "גבייה דרך ספק אינה זמינה לאמצעי זה.",
          en: "Provider collection is unavailable for this method.",
        });
      if (
        payment.method === "cash" &&
        payment.cashReceived !== undefined &&
        payment.cashReceived < payment.amount
      )
        errors.payments = t({
          he: "המזומן שהתקבל נמוך מהסכום לרישום.",
          en: "Cash received is less than the amount to record.",
        });
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const draftSnapshot = (reviewedPayments: PosPayment[] = payments) => {
    let guestName = t({ he: "לקוח מזדמן", en: "Walk-in customer" });
    if (attemptedSnapshot) {
      try {
        const name = JSON.parse(attemptedSnapshot).guestName;
        if (typeof name === "string") guestName = name;
      } catch {
        /* Invalid operation snapshots remain locked for reconciliation. */
      }
    }
    return JSON.stringify({
      guestName: customer ? null : guestName,
      customer: customer
        ? [
            customer.name.trim(),
            customer.email.trim(),
            customer.phone.trim(),
            customer.accountId ?? "",
          ]
        : null,
      items: selectedLines.map((line) => [
        line.variantId,
        line.quantity,
        toAgorot(line.unitPrice),
        toAgorot(line.discountPerUnit),
      ]),
      payments: reviewedPayments.map((payment) => [
        payment.id,
        payment.method,
        payment.collectionKind,
        toAgorot(payment.amount),
        payment.installments,
        payment.reference.trim(),
        payment.cashReceived === undefined
          ? null
          : toAgorot(payment.cashReceived),
      ]),
    });
  };
  const persistPending = (
    intent: PendingIntent | null,
    snapshot: string,
    operationPayments: PosPayment[] = payments,
  ) => {
    const draft = {
      idempotencyKey,
      customer,
      lines,
      payments: operationPayments,
      pendingIntent: intent,
      attemptedSnapshot: snapshot,
      savedAt: Date.now(),
    };
    if (actorRef.current === userId) latestDraftRef.current = { userId, draft };
    saveDraft("pos", draft);
  };
  const readStatus = async (intent: PendingIntent): Promise<IntentStatus> => {
    const response = await fetch(`/api/commerce/intents/${intent.id}`, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (
      !response.ok ||
      data?.intent?.id !== intent.id ||
      data.intent.total_agorot !== intent.totalAgorot ||
      !Array.isArray(data.attempts)
    )
      throw new Error(
        t({
          he: "תוצאת המכירה אינה ידועה. יש לבדוק שוב לפני ניסיון נוסף.",
          en: "Sale outcome is unknown. Check again before another attempt.",
        }),
      );
    return data;
  };
  const resumeHosted = async (intent: PendingIntent, payment: PosPayment) => {
    const response = await fetch("/api/commerce/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        intent_id: intent.id,
        method: payment.method,
        amount_agorot: toAgorot(payment.amount),
        idempotency_key: payment.id,
        installments: 1,
        locale,
      }),
    });
    const data = await response.json().catch(() => null);
    if (actorRef.current !== userId) return;
    if (!response.ok)
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : t({
              he: "פתיחת התשלום הממתין נכשלה. יש לבדוק שוב.",
              en: "Could not resume the pending payment. Check again.",
            }),
      );
    if (typeof data?.redirect_url === "string") {
      const redirect = new URL(data.redirect_url, window.location.origin);
      if (
        redirect.protocol !== "https:" &&
        redirect.origin !== window.location.origin
      )
        throw new Error(
          t({
            he: "הפניית התשלום אינה תקינה.",
            en: "Payment redirect is invalid.",
          }),
        );
      window.location.assign(redirect.href);
      return;
    }
    const status = await readStatus(intent);
    if (status.intent.order_id) {
      complete(status);
      return;
    }
    throw new Error(
      t({
        he: "התשלום טרם הוכרע. יש לבדוק שוב; אין לגבות מחדש.",
        en: "Payment is not final. Check again; do not collect again.",
      }),
    );
  };
  const complete = (status: IntentStatus) => {
    if (actorRef.current !== userId) return;
    const orderNumber = status.intent.order_number ?? status.intent.order_id;
    const newKey = generateIdempotencyKey();
    clearDraft("pos");
    setPendingIntent(null);
    setAttemptedSnapshot(null);
    setIdempotencyKey(newKey);
    setLines([emptyLine()]);
    setCustomer(null);
    setPayments([emptyPayment()]);
    setFormErrors({});
    saveDraft("pos", {
      idempotencyKey: newKey,
      lines: [],
      payments: [],
      savedAt: Date.now(),
    });
    setRefreshToken((value) => value + 1);
    setSuccessMessage(
      `${t({ he: "המכירה נרשמה", en: "Sale recorded" })} · ${t({ he: "הזמנה", en: "Order" })} ${orderNumber}`,
    );
  };
  const recordSale = async () => {
    if (savingRef.current || readyUser !== userId) return;
    if (!navigator.onLine) {
      setSaveError(
        t({
          he: "אין חיבור. הטיוטה נשמרת בלבד; התחברו לפני בדיקה או רישום מכירה.",
          en: "Offline — draft only. Reconnect before checking or recording a sale.",
        }),
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    setSuccessMessage(null);
    let active = pendingIntent;
    try {
      // Recovery must remain available if provider readiness, prices or local draft validation changed.
      if (active) {
        const recovered = await readStatus(active);
        if (actorRef.current !== userId) return;
        if (recovered.intent.order_id) {
          complete(recovered);
          return;
        }
        if (
          recovered.attempts.some((attempt) =>
            ["created", "authorized", "unknown", "exception"].includes(
              attempt.state,
            ),
          )
        )
          throw new Error(
            t({
              he: "ניסיון תשלום עדיין ממתין או אינו ידוע. בדקו שוב; אין לרשום גבייה נוספת.",
              en: "A payment is pending or unknown. Check again; do not record another collection.",
            }),
          );
      }
      if (!validate()) return;
      let snapshot = draftSnapshot();
      if (
        (attemptedSnapshot && attemptedSnapshot !== snapshot) ||
        (active && active.snapshot !== snapshot)
      )
        throw new Error(
          t({
            he: "פרטי מכירה ממתינה השתנו. יש ליישב אותה לפני מכירה חדשה.",
            en: "Pending sale details changed. Reconcile it before starting a new sale.",
          }),
        );
      if (!active) {
        setAttemptedSnapshot(snapshot);
        persistPending(null, snapshot);
        const response = await fetch("/api/management/commerce/intents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            channel: "pos",
            idempotency_key: idempotencyKey,
            customer_snapshot: customer
              ? {
                  name: customer.name.trim(),
                  email: customer.email.trim(),
                  phone: customer.phone.trim(),
                  ...(customer.accountId
                    ? { customer_id: customer.accountId }
                    : {}),
                }
              : {
                  name: JSON.parse(snapshot).guestName,
                  email: "",
                },
            items: selectedLines.map((line) => ({
              variant_id: line.variantId,
              quantity: line.quantity,
              ...(line.discountPerUnit > 0
                ? { discount_per_unit_agorot: toAgorot(line.discountPerUnit) }
                : {}),
            })),
          }),
        });
        const data = await response.json().catch(() => null);
        if (
          !response.ok ||
          typeof data?.intent?.id !== "string" ||
          !Number.isSafeInteger(data.intent.total_agorot)
        ) {
          if (
            ([400, 401, 403, 422].includes(response.status) && data?.error) ||
            data?.error === "insufficient_stock"
          ) {
            setAttemptedSnapshot(null);
            persistPending(null, "");
          }
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : t({
                  he: "יצירת המכירה לא הוכרעה. בדקו שוב עם אותם פרטים.",
                  en: "Sale creation is unresolved. Check again with the same details.",
                }),
          );
        }
        active = {
          id: data.intent.id,
          totalAgorot: data.intent.total_agorot,
          snapshot,
        };
        persistPending(active, snapshot);
        if (actorRef.current !== userId) return;
        setPendingIntent(active);
      }
      if (active.totalAgorot !== toAgorot(total))
        throw new Error(
          t({
            he: "המחיר שאומת בשרת השתנה. בטלו מכירה שלא שולמה ובדקו את הקטלוג מחדש.",
            en: "Server-validated pricing changed. Cancel the unpaid sale and review the refreshed catalog.",
          }),
        );
      const status = await readStatus(active);
      if (actorRef.current !== userId) return;
      if (status.intent.order_id) {
        complete(status);
        return;
      }
      const quote = comparePosQuote(selectedLines, status.items, vatRate);
      if (!quote.itemsMatch)
        throw new Error(
          t({
            he: "מחירים או פרטי פריטים השתנו בשרת. בטלו את המכירה שלא שולמה ובדקו את המחירים המעודכנים.",
            en: "Server item prices or details changed. Cancel the unpaid sale and review updated prices.",
          }),
        );
      if (quote.vatRate === null)
        throw new Error(
          t({
            he: "פירוט המס דורש בדיקת מנהל לפני רישום תשלום.",
            en: "The tax breakdown needs management review before recording funds.",
          }),
        );
      if (quote.taxNeedsReview) {
        setVatRate(quote.vatRate);
        throw new Error(
          t({
            he: "פירוט המע״מ עודכן לפי השרת. בדקו את הסיכום ואז אשרו שוב.",
            en: "VAT breakdown updated from the server. Review the summary, then confirm again.",
          }),
        );
      }
      const manualResume = canResumeManualPosIntent(
        status.intent.status,
        status.intent.expires_at,
        status.attempts,
        payments,
      );
      const holdExpired =
        typeof status.intent.expires_at === "string" &&
        Date.parse(status.intent.expires_at) <= Date.now();
      if (
        ["cancelled", "expired"].includes(status.intent.status) ||
        ((status.intent.status === "exception" || holdExpired) && !manualResume)
      )
        throw new Error(
          t({
            he: "המכירה דורשת ביטול או טיפול בסביבת התשלומים.",
            en: "This sale needs cancellation or review in payment operations.",
          }),
        );
      const unresolved = status.attempts.some((attempt) =>
        ["created", "authorized", "unknown", "exception"].includes(
          attempt.state,
        ),
      );
      if (unresolved)
        throw new Error(
          t({
            he: "ניסיון תשלום עדיין ממתין או אינו ידוע. בדקו שוב; אין לרשום גבייה נוספת.",
            en: "A payment is pending or unknown. Check again; do not record another collection.",
          }),
        );
      if (
        status.attempts.some(
          (attempt) =>
            attempt.state === "captured" &&
            !payments.some((payment) => payment.id === attempt.idempotency_key),
        )
      )
        throw new Error(
          t({
            he: "תשלום שנרשם אינו מופיע בטיוטה. יש ליישב את המכירה לפני קבלת כסף נוסף.",
            en: "A recorded payment is missing from this draft. Reconcile the sale before receiving more funds.",
          }),
        );
      const pendingAttempt = status.attempts.find(
        (attempt) => attempt.state === "pending",
      );
      if (pendingAttempt) {
        const payment = payments.find(
          (entry) => entry.id === pendingAttempt.idempotency_key,
        );
        if (
          !payment ||
          getPosPaymentRecovery(payment, status.attempts) !== "resume"
        )
          throw new Error(
            t({
              he: "פרטי התשלום הממתין דורשים בדיקת מנהל.",
              en: "The pending payment needs management review.",
            }),
          );
        persistPending(active, snapshot);
        await resumeHosted(active, payment);
        return;
      }
      let operationPayments = payments;
      const retryKeys = payments
        .filter(
          (payment) =>
            getPosPaymentRecovery(payment, status.attempts) === "retry",
        )
        .map((payment) => payment.id);
      if (retryKeys.length) {
        if (
          !window.confirm(
            t({
              he: "הספק אישר שהתשלום נדחה או בוטל. לנסות שוב רק את הסכום שלא נגבה? תשלומים שכבר התקבלו יישמרו.",
              en: "The provider verified a decline or void. Retry only the uncollected amount? Funds already recorded will be preserved.",
            }),
          )
        )
          return;
        operationPayments = payments.map((payment) =>
          retryKeys.includes(payment.id)
            ? { ...payment, id: generateIdempotencyKey() }
            : payment,
        );
        snapshot = draftSnapshot(operationPayments);
        active = { ...active, snapshot };
        setPayments(operationPayments);
        setAttemptedSnapshot(snapshot);
        setPendingIntent(active);
        persistPending(active, snapshot, operationPayments);
      }
      const manualUnrecorded = operationPayments.some(
        (payment) =>
          payment.collectionKind === "manual_recorded" &&
          !status.attempts.some(
            (attempt) =>
              attempt.idempotency_key === payment.id &&
              attempt.state === "captured",
          ),
      );
      if (
        manualUnrecorded &&
        !window.confirm(
          t({
            he: "אשרו שהסכומים החיצוניים התקבלו בפועל לפני רישומם.",
            en: "Confirm the external funds were actually received before recording them.",
          }),
        )
      )
        return;
      // Record external legs first; a hosted redirect must not skip later split tenders.
      for (const payment of [...operationPayments].sort(
        (a, b) =>
          Number(a.collectionKind === "provider_collected") -
          Number(b.collectionKind === "provider_collected"),
      )) {
        const existing = status.attempts.find(
          (attempt) => attempt.idempotency_key === payment.id,
        );
        if (existing) {
          if (
            existing.method !== payment.method ||
            existing.amount_agorot !== toAgorot(payment.amount) ||
            existing.collection_kind !== payment.collectionKind
          )
            throw new Error(
              t({
                he: "פרטי תשלום שנשמרו אינם תואמים. נדרשת בדיקת מנהל.",
                en: "Stored payment details differ. Management review is required.",
              }),
            );
          if (existing.state === "captured") continue;
          throw new Error(
            t({
              he: "ניסיון התשלום הקודם אינו הושלם. יש לבדוק אותו לפני ניסיון חדש.",
              en: "The previous payment attempt did not complete. Review it before a new attempt.",
            }),
          );
        }
        const provider = payment.collectionKind === "provider_collected";
        persistPending(active, snapshot, operationPayments);
        const response = await fetch(
          provider
            ? "/api/commerce/attempts"
            : "/api/management/commerce/tenders",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              intent_id: active.id,
              method: payment.method,
              amount_agorot: toAgorot(payment.amount),
              idempotency_key: payment.id,
              ...(provider
                ? { installments: 1, locale }
                : {
                    confirmed_received: true,
                    ...(payment.reference.trim()
                      ? { reference: payment.reference.trim() }
                      : {}),
                    ...(payment.method === "cash"
                      ? {
                          cash_received_agorot: toAgorot(
                            payment.cashReceived ?? payment.amount,
                          ),
                        }
                      : {}),
                  }),
            }),
          },
        );
        const data = await response.json().catch(() => null);
        if (actorRef.current !== userId) return;
        if (!response.ok)
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : t({
                  he: "תוצאת התשלום אינה ידועה. בדקו שוב לפני ניסיון נוסף.",
                  en: "Payment outcome is unknown. Check again before another attempt.",
                }),
          );
        if (provider) {
          if (typeof data?.redirect_url === "string") {
            const redirect = new URL(data.redirect_url, window.location.origin);
            if (
              redirect.protocol !== "https:" &&
              redirect.origin !== window.location.origin
            )
              throw new Error(
                t({
                  he: "הפניית התשלום אינה תקינה.",
                  en: "Payment redirect is invalid.",
                }),
              );
            window.location.assign(redirect.href);
            return;
          }
          const providerStatus = await readStatus(active);
          if (providerStatus.intent.order_id) {
            complete(providerStatus);
            return;
          }
          throw new Error(
            t({
              he: "ניסיון התשלום טרם הוכרע. יש לבדוק שוב.",
              en: "The payment attempt is not final. Check again.",
            }),
          );
        }
        await readStatus(active);
      }
      const finalStatus = await readStatus(active);
      if (!finalStatus.intent.order_id)
        throw new Error(
          t({
            he: "התשלום נרשם אך ההזמנה טרם הושלמה. בדקו שוב.",
            en: "Funds are recorded but the order is not finalized. Check again.",
          }),
        );
      complete(finalStatus);
    } catch (error) {
      if (actorRef.current === userId)
        setSaveError(
          error instanceof Error
            ? error.message
            : t({
                he: "החיבור הופסק. בדקו את המכירה הממתינה לפני ניסיון נוסף.",
                en: "Connection interrupted. Check the pending sale before another attempt.",
              }),
        );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const cancelPending = async () => {
    if (savingRef.current) return;
    if (!navigator.onLine) {
      setSaveError(
        t({
          he: "אין חיבור. המכירה הממתינה נשמרת; התחברו לפני בדיקה או ביטול.",
          en: "Offline — the pending sale stays saved. Reconnect before checking or cancelling.",
        }),
      );
      return;
    }
    if (!pendingIntent) {
      setSaveError(
        t({
          he: "בדקו תחילה את המכירה הממתינה כדי לאתר אותה בשרת, ואז ניתן לבטל אם לא שולמה.",
          en: "Check the pending sale first to find its server record, then cancel it if unpaid.",
        }),
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const status = await readStatus(pendingIntent);
      if (actorRef.current !== userId) return;
      if (status.intent.order_id) {
        complete(status);
        return;
      }
      if (
        status.attempts.some((attempt) =>
          ["created", "captured", "pending", "authorized", "unknown"].includes(
            attempt.state,
          ),
        )
      )
        throw new Error(
          t({
            he: "קיימים תשלומים שנרשמו או שטרם הוכרעו. יש ליישב אותם בסביבת התשלומים.",
            en: "Recorded or unresolved payments exist. Reconcile them in payment operations.",
          }),
        );
      if (
        !window.confirm(
          t({
            he: "לבטל את המכירה שטרם שולמה ולשחרר את המלאי השמור?",
            en: "Cancel this unpaid sale and release its stock hold?",
          }),
        )
      )
        return;
      const response = await fetch(
        `/api/commerce/intents/${pendingIntent.id}`,
        { method: "DELETE", cache: "no-store" },
      );
      const data = await response.json().catch(() => null);
      if (actorRef.current !== userId) return;
      if (!response.ok)
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : t({
                he: "תוצאת הביטול אינה ידועה. בדקו שוב.",
                en: "Cancellation outcome is unknown. Check again.",
              }),
        );
      setPendingIntent(null);
      setAttemptedSnapshot(null);
      setIdempotencyKey(generateIdempotencyKey());
      // An unpaid cancellation is a safe point to present the authoritative repriced quote.
      if (Array.isArray(status.items)) {
        setLines((previous) =>
          previous.map((line) => {
            const quoted = status.items?.find(
              (item) =>
                item.variant_id === line.variantId &&
                item.quantity === line.quantity,
            );
            return quoted &&
              Number.isSafeInteger(quoted.unit_price_agorot) &&
              Number.isSafeInteger(quoted.discount_per_unit_agorot)
              ? {
                  ...line,
                  unitPrice: quoted.unit_price_agorot / 100,
                  discountPerUnit: quoted.discount_per_unit_agorot / 100,
                }
              : line;
          }),
        );
        const rates = Array.from(
          new Set(status.items.map((item) => item.vat_rate)),
        );
        if (rates.length === 1 && Number.isFinite(rates[0]))
          setVatRate(rates[0]);
      }
      setPayments((previous) =>
        previous.map((payment) => ({
          ...payment,
          id: generateIdempotencyKey(),
        })),
      );
      setRefreshToken((value) => value + 1);
      setSaveError(
        t({
          he: "המכירה שלא שולמה בוטלה. בדקו את המחירים והסכומים לפני מכירה חדשה.",
          en: "Unpaid sale cancelled. Review prices and amounts before starting a new sale.",
        }),
      );
    } catch (error) {
      if (actorRef.current === userId)
        setSaveError(
          error instanceof Error
            ? error.message
            : "Cancellation outcome is unknown.",
        );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <PosShell
      locale={locale}
      cartLines={lines}
      onCartLineChange={updateLine}
      onCartLineRemove={handleRemoveLine}
      onVariantPick={handleVariantPick}
      customer={customer}
      onCustomerChange={handleCustomerChange}
      payments={payments}
      onPaymentChange={handlePaymentChange}
      onRecordSale={recordSale}
      onClearCart={handleClearCart}
      saving={saving}
      successMessage={successMessage}
      onDismissSuccess={() => setSuccessMessage(null)}
      gatewayCapabilities={gatewayCapabilities}
      vatRate={vatRate}
      formErrors={formErrors}
      saveError={saveError}
      pendingIntentId={
        pendingIntent?.id ?? (attemptedSnapshot ? "unresolved" : null)
      }
      locked={locked || readyUser !== userId}
      onCancelPending={cancelPending}
      refreshToken={refreshToken}
    />
  );
}
