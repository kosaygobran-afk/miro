"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ClipboardPlus,
  LoaderCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "@/components/motion/use-motion-router";

export function AccountForms({
  locale,
  name,
  phone,
}: {
  locale: "he" | "en";
  name: string;
  phone: string;
}) {
  const he = locale === "he";
  return (
    <section
      className="account-forms grid gap-6 lg:grid-cols-2"
      aria-label={
        he ? "ניהול החשבון ופניות שירות" : "Profile and service requests"
      }
    >
      <SubmissionForm
        locale={locale}
        action="profile"
        title={he ? "פרטי החשבון" : "Your profile"}
        icon={UserRound}
        submitLabel={he ? "שמירת פרטים" : "Save profile"}
      >
        <label className="block">
          {he ? "שם מלא" : "Full name"}
          <input
            className="miro-input"
            name="full_name"
            defaultValue={name}
            required
            maxLength={100}
            autoComplete="name"
            dir="auto"
          />
        </label>
        <label className="block">
          {he ? "טלפון" : "Phone"}
          <input
            className="miro-input"
            name="phone"
            type="tel"
            defaultValue={phone}
            maxLength={30}
            autoComplete="tel"
            dir="ltr"
          />
        </label>
      </SubmissionForm>
      <SubmissionForm
        locale={locale}
        action="request"
        title={he ? "פניית שירות חדשה" : "New service request"}
        icon={ClipboardPlus}
        submitLabel={he ? "שליחת פנייה" : "Submit request"}
      >
        <p className="text-sm text-muted-foreground">
          {he
            ? "הפנייה תישמר בחשבון ותהיה זמינה לצוות השירות. אין להזין סיסמאות או קודי אבטחה."
            : "Your request is saved to your account for the service team. Do not include passwords or security codes."}
        </p>
        <label className="block">
          {he ? "איך נוכל לעזור?" : "How can we help?"}
          <textarea
            className="miro-input"
            name="message"
            required
            minLength={10}
            maxLength={4000}
            rows={4}
            dir="auto"
          />
        </label>
      </SubmissionForm>
    </section>
  );
}

function SubmissionForm({
  locale,
  action,
  title,
  icon: Icon,
  submitLabel,
  children,
}: {
  locale: "he" | "en";
  action: "profile" | "request";
  title: string;
  icon: LucideIcon;
  submitLabel: string;
  children: ReactNode;
}) {
  const he = locale === "he";
  const router = useRouter();
  const statusId = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    [],
  );
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!response.ok) throw new Error();
      if (pending.current !== controller) return;
      setMessage(he ? "נשמר בהצלחה." : "Saved successfully.");
      if (action === "request") form.reset();
      router.refresh();
    } catch {
      if (pending.current !== controller) return;
      // A lost response may follow a committed write. Do not automatically resubmit requests.
      setMessage(
        action === "request"
          ? he
            ? "לא ניתן לאשר שהפנייה נשמרה. בדקו את היסטוריית הפניות לפני שליחה נוספת."
            : "We could not confirm the save. Check request history before submitting again."
          : he
            ? "לא ניתן לשמור. נסו שוב."
            : "Could not save. Please try again.",
      );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <form
      onSubmit={save}
      className="miro-card account-form space-y-4 p-6"
      aria-busy={busy}
      aria-describedby={statusId}
    >
      <h2 className="text-xl font-black account-panel-title">
        <Icon size={22} aria-hidden="true" />
        {title}
      </h2>
      <input type="hidden" name="action" value={action} />
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        {children}
      </fieldset>
      <button
        className="miro-button miro-button-primary"
        disabled={busy}
        aria-describedby={statusId}
      >
        {busy && (
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        )}
        {busy ? (he ? "שומר…" : "Saving…") : submitLabel}
      </button>
      <p
        id={statusId}
        role="status"
        className="account-form-status text-sm text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
