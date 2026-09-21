"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const body = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      setMessage(he ? "נשמר בהצלחה." : "Saved successfully.");
      if (body.action === "request") form.reset();
      router.refresh();
    } catch {
      setMessage(
        he ? "לא ניתן לשמור. נסו שוב." : "Could not save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={save} className="miro-card space-y-4 p-6">
        <h2 className="text-xl font-black">
          {he ? "פרטי החשבון" : "Your profile"}
        </h2>
        <input type="hidden" name="action" value="profile" />
        <label className="block">
          {he ? "שם מלא" : "Full name"}
          <input
            className="miro-input"
            name="full_name"
            defaultValue={name}
            required
            maxLength={100}
            autoComplete="name"
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
          />
        </label>
        <button className="miro-button miro-button-primary" disabled={busy}>
          {he ? "שמירת פרטים" : "Save profile"}
        </button>
      </form>
      <form onSubmit={save} className="miro-card space-y-4 p-6">
        <h2 className="text-xl font-black">
          {he ? "פניית שירות חדשה" : "New service request"}
        </h2>
        <input type="hidden" name="action" value="request" />
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
          />
        </label>
        <button className="miro-button miro-button-primary" disabled={busy}>
          {he ? "שליחת פנייה" : "Submit request"}
        </button>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
