"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Notice } from "./ui";
import {
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

type CeoAction = "email" | "password" | "add" | "delete";

type FormNotice = {
  text: string;
  type: "success" | "error";
};

const NOTICE_DURATION = 5000;

export function CeoSettings({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<CeoAction | null>(null);
  // Synchronous in-flight ref to close rapid duplicate-event races
  const inFlightRef = useRef(false);
  const [notices, setNotices] = useState<
    Partial<Record<CeoAction, FormNotice>>
  >({});
  // Refs to track notice timers for cleanup
  const noticeTimersRef = useRef<Partial<Record<CeoAction, NodeJS.Timeout>>>(
    {},
  );

  // Clear notice timer on unmount or action change
  const clearNoticeTimer = useCallback((action: CeoAction) => {
    const timer = noticeTimersRef.current[action];
    if (timer) {
      clearTimeout(timer);
      delete noticeTimersRef.current[action];
    }
  }, []);

  function setFormNotice(
    action: CeoAction,
    text: string,
    type: "success" | "error",
  ) {
    // Clear any existing timer for this action
    clearNoticeTimer(action);
    setNotices((prev) => ({ ...prev, [action]: { text, type } }));
    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      setNotices((prev) => {
        const next = { ...prev };
        delete next[action];
        return next;
      });
      delete noticeTimersRef.current[action];
    }, NOTICE_DURATION);
    noticeTimersRef.current[action] = timer;
  }

  // Cleanup all timers on unmount
  useEffect(() => {
    const ref = noticeTimersRef;
    return () => {
      Object.values(ref.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const action = String(data.action ?? "") as CeoAction;

    // Guard: if any action is in flight, reject this submission
    if (busyAction !== null || inFlightRef.current) {
      return;
    }

    // Client-side validation
    if (action === "password") {
      const newPassword = String(data.newPassword ?? "");
      const confirmPassword = String(data.confirmPassword ?? "");

      if (newPassword.length < 12) {
        setFormNotice(
          action,
          he
            ? "הסיסמה החדשה חייבת להיות באורך 12 תווים לפחות."
            : "New password must be at least 12 characters.",
          "error",
        );
        return;
      }
      if (newPassword !== confirmPassword) {
        setFormNotice(
          action,
          he ? "הסיסמאות החדשות אינן תואמות." : "New passwords do not match.",
          "error",
        );
        return;
      }
    }

    // Set both state and ref for immediate guard
    setBusyAction(action);
    inFlightRef.current = true;
    try {
      const response = await fetch("/api/ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setFormNotice(
          action,
          errorData.error ||
            (he
              ? "הפעולה לא הושלמה. בדקו את הסיסמה. הוספת מנהל ראשי דורשת חשבון מאומת, ומחיקה דורשת מנהל ראשי פעיל נוסף."
              : "Action could not be completed. Check your password. Adding a CEO requires a verified account; deleting yourself requires another active CEO."),
          "error",
        );
        // Preserve form values on error - do NOT reset
        return;
      }
      // Clear only the current action's obsolete notice
      setNotices((prev) => {
        const next = { ...prev };
        delete next[action];
        return next;
      });
      setFormNotice(
        action,
        action === "password"
          ? he
            ? "הסיסמה עודכנה."
            : "Password updated."
          : action === "email"
            ? he
              ? "בדקו את שתי תיבות הדואר ואשרו את השינוי."
              : "Check both email inboxes to verify the change."
            : he
              ? "נוסף מנהל ראשי."
              : "CEO added successfully.",
        "success",
      );
      if (action === "delete") {
        await createClient().auth.signOut({ scope: "local" });
        router.replace(`/${locale}/login`);
        router.refresh();
      } else {
        // Reset form on success (except delete which signs out)
        form.reset();
        router.refresh();
      }
    } catch {
      setFormNotice(
        action,
        he ? "שגיאת חיבור. נסו שוב." : "Connection failed. Please try again.",
        "error",
      );
    } finally {
      setBusyAction(null);
      inFlightRef.current = false;
    }
  }
  const actionPresentation = {
    email: {
      icon: Mail,
      title: he ? "שינוי כתובת הדואר שלי" : "Change my email",
      description: he
        ? "העדכון נכנס לתוקף לאחר אימות הכתובת הישנה והחדשה."
        : "The update takes effect after both the old and new addresses are verified.",
    },
    password: {
      icon: KeyRound,
      title: he ? "שינוי סיסמה" : "Change password",
      description: he
        ? "השתמשו בסיסמה ייחודית באורך 12 תווים לפחות."
        : "Use a unique password with at least 12 characters.",
    },
    add: {
      icon: UserPlus,
      title: he ? "הוספת מנהל ראשי" : "Add a CEO",
      description: he
        ? "הענקת הרשאת מנכ״ל לחשבון פעיל ומאומת קיים."
        : "Grant CEO access to an existing, active, verified account.",
    },
    delete: {
      icon: TriangleAlert,
      title: he ? "מחיקת החשבון שלי" : "Delete my account",
      description: he
        ? "פעולה קבועה ורגישה. נדרש מנהל ראשי פעיל נוסף."
        : "A permanent, sensitive action. Another active CEO is required.",
    },
  } as const;

  return (
    <section className="ceo-security" aria-labelledby="ceo-security-title">
      <div className="mgmt-card mgmt-card--padded flex items-start gap-3">
        <span className="mgmt-metric-card__icon" aria-hidden="true">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 id="ceo-security-title" className="text-2xl font-black">
            {he ? "אבטחת חשבון מנהל ראשי" : "CEO account security"}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {he
              ? "כל פעולה דורשת אימות סיסמה. לא ניתן להסיר מנהל ראשי אחר או למחוק את המנהל הראשי האחרון."
              : "Every action requires password verification. You cannot remove another CEO or delete the last active CEO."}
          </p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {(["email", "password", "add", "delete"] as const).map((action) => {
          const presentation = actionPresentation[action];
          const ActionIcon = presentation.icon;
          return (
            <form
              key={action}
              onSubmit={submit}
              aria-labelledby={`ceo-${action}-title`}
              className={`mgmt-card mgmt-card--padded space-y-4 ${action === "delete" ? "border-destructive/40" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="mgmt-metric-card__icon" aria-hidden="true">
                  <ActionIcon className="h-5 w-5" />
                </span>
                <div>
                  <h3 id={`ceo-${action}-title`} className="font-bold">
                    {presentation.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {presentation.description}
                  </p>
                </div>
              </div>
              <input type="hidden" name="action" value={action} />
              {action === "password" ? (
                <>
                  <label className="block space-y-2">
                    {he ? "סיסמה חדשה" : "New password"}
                    <input
                      className="miro-input"
                      type="password"
                      name="newPassword"
                      minLength={12}
                      maxLength={200}
                      required
                      autoComplete="new-password"
                      disabled={busyAction !== null}
                    />
                  </label>
                  <label className="block space-y-2">
                    {he ? "אישור סיסמה חדשה" : "Confirm new password"}
                    <input
                      className="miro-input"
                      type="password"
                      name="confirmPassword"
                      minLength={12}
                      maxLength={200}
                      required
                      autoComplete="new-password"
                      disabled={busyAction !== null}
                    />
                  </label>
                </>
              ) : action !== "delete" ? (
                <>
                  <label className="block space-y-2">
                    {he ? "כתובת דואר" : "Email address"}
                    <input
                      className="miro-input"
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      disabled={busyAction !== null}
                    />
                  </label>
                  {action === "add" && (
                    <p className="text-sm text-muted-foreground">
                      {he
                        ? "יש להזין כתובת של חשבון קיים, פעיל ומאומת במערכת."
                        : "Enter the address of an existing verified active account."}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm">
                    {he
                      ? "המחיקה קבועה ומסירה את החשבון והפרופיל. רשומות עסקיות וביקורת נשמרות בהתאם למדיניות."
                      : "Deletion permanently removes your account and profile. Business and audit records remain according to policy."}
                  </p>
                  <label className="block space-y-2">
                    {he ? "הקלידו DELETE לאישור" : "Type DELETE to confirm"}
                    <input
                      className="miro-input"
                      name="confirmation"
                      pattern="DELETE"
                      required
                      autoComplete="off"
                      disabled={busyAction !== null}
                    />
                  </label>
                </>
              )}
              <label className="block space-y-2">
                {he ? "הסיסמה הנוכחית שלי" : "My current password"}
                <input
                  className="miro-input"
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  maxLength={200}
                  disabled={busyAction !== null}
                />
              </label>
              <button
                type="submit"
                className={`miro-button ${action === "delete" ? "miro-button-secondary text-destructive" : "miro-button-primary"}`}
                disabled={busyAction !== null}
                aria-busy={busyAction === action || undefined}
              >
                {busyAction === action ? (
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {action === "delete"
                  ? he
                    ? "מחיקת החשבון שלי"
                    : "Delete my account"
                  : he
                    ? "אימות והמשך"
                    : "Verify and continue"}
              </button>
              {notices[action] && (
                <Notice
                  tone={
                    notices[action]!.type === "success" ? "success" : "danger"
                  }
                  onDismiss={() =>
                    setNotices((prev) => {
                      const next = { ...prev };
                      delete next[action];
                      return next;
                    })
                  }
                  dismissLabel={he ? "סגור" : "Dismiss"}
                  className="mt-2"
                >
                  {notices[action]!.text}
                </Notice>
              )}
            </form>
          );
        })}
      </div>
    </section>
  );
}
