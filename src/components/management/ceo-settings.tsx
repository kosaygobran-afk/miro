"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CeoSettings({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        setNotice(
          he
            ? "הפעולה לא הושלמה. בדקו את הסיסמה. הוספת מנהל ראשי דורשת חשבון מאומת, ומחיקה דורשת מנהל ראשי פעיל נוסף."
            : "Action could not be completed. Check your password. Adding a CEO requires a verified account; deleting yourself requires another active CEO.",
        );
        return;
      }
      form.reset();
      if (data.action === "delete") {
        await createClient().auth.signOut({ scope: "local" });
        router.replace(`/${locale}/login`);
        router.refresh();
      } else {
        setNotice(
          data.action === "password"
            ? he
              ? "הסיסמה עודכנה."
              : "Password updated."
            : data.action === "email"
              ? he
                ? "בדקו את שתי תיבות הדואר ואשרו את השינוי."
                : "Check both email inboxes to verify the change."
              : he
                ? "נוסף מנהל ראשי."
                : "CEO added successfully.",
        );
        router.refresh();
      }
    } catch {
      setNotice(
        he ? "שגיאת חיבור. נסו שוב." : "Connection failed. Please try again.",
      );
    } finally {
      setBusy(false);
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
              disabled={busy}
            >
              {action === "delete"
                ? he
                  ? "מחיקת החשבון שלי"
                  : "Delete my account"
                : he
                  ? "אימות והמשך"
                  : "Verify and continue"}
            </button>
          </form>
        ))}
      </div>
      <p role="status">{notice}</p>
    </section>
  );
}
