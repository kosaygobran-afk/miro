"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CeoAction = "email" | "password" | "add" | "delete";

type FormNotice = {
  text: string;
  type: "success" | "error";
};

export function CeoSettings({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<CeoAction | null>(null);
  const [notices, setNotices] = useState<Partial<Record<CeoAction, FormNotice>>>(
    {},
  );

  function setFormNotice(
    action: CeoAction,
    text: string,
    type: "success" | "error",
  ) {
    setNotices((prev) => ({ ...prev, [action]: { text, type } }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const action = String(data.action ?? "") as CeoAction;

    if (
      action === "password" &&
      String(data.newPassword ?? "") !== String(data.confirmPassword ?? "")
    ) {
      setFormNotice(
        action,
        he ? "הסיסמאות החדשות אינן תואמות." : "New passwords do not match.",
        "error",
      );
      return;
    }

    setBusyAction(action);
    try {
      const response = await fetch("/api/ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        setFormNotice(
          action,
          he
            ? "הפעולה לא הושלמה. בדקו את הסיסמה. הוספת מנהל ראשי דורשת חשבון מאומת, ומחיקה דורשת מנהל ראשי פעיל נוסף."
            : "Action could not be completed. Check your password. Adding a CEO requires a verified account; deleting yourself requires another active CEO.",
          "error",
        );
        return;
      }
      form.reset();
      if (action === "delete") {
        await createClient().auth.signOut({ scope: "local" });
        router.replace(`/${locale}/login`);
        router.refresh();
      } else {
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
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-black">
        {he ? "אבטחת חשבון מנהל ראשי" : "CEO account security"}
      </h2>
      <p>
        {he
          ? "כל פעולה דורשת אימות סיסמה. לא ניתן להסיר מנהל ראשי אחר או למחוק את המנהל הראשי האחרון."
          : "Every action requires your password. You cannot remove another CEO or delete the last active CEO."}
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {(["email", "password", "add", "delete"] as const).map((action) => (
          <form
            key={action}
            onSubmit={submit}
            className="miro-card space-y-4 p-6"
          >
            <h3 className="font-bold">
              {action === "email"
                ? he
                  ? "שינוי כתובת הדואר שלי"
                  : "Change my email"
                : action === "add"
                  ? he
                    ? "הוספת מנהל ראשי"
                    : "Add a CEO"
                  : action === "password"
                    ? he
                      ? "שינוי סיסמה"
                      : "Change password"
                    : he
                      ? "מחיקת החשבון שלי"
                      : "Delete my account"}
            </h3>
            <input type="hidden" name="action" value={action} />
            {action === "password" ? (
              <>
                <label className="block">
                  {he ? "סיסמה חדשה" : "New password"}
                  <input
                    className="miro-input"
                    type="password"
                    name="newPassword"
                    minLength={12}
                    maxLength={200}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  {he ? "אישור סיסמה חדשה" : "Confirm new password"}
                  <input
                    className="miro-input"
                    type="password"
                    name="confirmPassword"
                    minLength={12}
                    maxLength={200}
                    required
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : action !== "delete" ? (
              <>
                <label className="block">
                  {he ? "כתובת דואר" : "Email address"}
                  <input
                    className="miro-input"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
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
                <label className="block">
                  {he ? "הקלידו DELETE לאישור" : "Type DELETE to confirm"}
                  <input
                    className="miro-input"
                    name="confirmation"
                    pattern="DELETE"
                    required
                    autoComplete="off"
                  />
                </label>
              </>
            )}
            <label className="block">
              {he ? "הסיסמה הנוכחית שלי" : "My current password"}
              <input
                className="miro-input"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                maxLength={200}
              />
            </label>
            <button
              className="miro-button miro-button-secondary"
              disabled={busyAction === action}
            >
              {action === "delete"
                ? he
                  ? "מחיקת החשבון שלי"
                  : "Delete my account"
                : he
                  ? "אימות והמשך"
                  : "Verify and continue"}
            </button>
            {notices[action] && (
              <p
                role="status"
                className={`rounded-lg border px-4 py-2 text-sm ${
                  notices[action]!.type === "success"
                    ? "border-success-text/30 bg-success-text/10 text-success-text"
                    : "border-error-text/30 bg-error-text/10 text-error-text"
                }`}
              >
                {notices[action]!.text}
              </p>
            )}
          </form>
        ))}
      </div>
    </section>
  );
}
