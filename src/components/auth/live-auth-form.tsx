"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withLocale, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export function LiveAuthForm({
  locale,
  mode,
  fields,
  submitLabel,
  initialNotice,
}: {
  locale: Locale;
  mode: "login" | "signup" | "forgot" | "reset";
  fields: Array<{ name: string; label: string; type: string }>;
  submitLabel: string;
  initialNotice: string;
}) {
  const [message, setMessage] = useState(initialNotice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries()) as Record<
      string,
      string
    >;
    const email = (values.email ?? "").trim();
    const password = (values.password ?? "").trim();
    const name = (values.name ?? "").trim();

    try {
      const supabase = createClient();

      if (mode === "login") {
        if (!email || !password) {
          setMessage(
            locale === "he"
              ? "יש להזין דואר אלקטרוני וסיסמה."
              : "Please enter both email and password.",
          );
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage(
          locale === "he"
            ? "התחברת בהצלחה. מעביר אותך לחשבון..."
            : "Signed in successfully. Redirecting to your account...",
        );
        router.push(withLocale(locale, "account"));
        return;
      }

      if (mode === "signup") {
        if (!email || !password || !name) {
          setMessage(
            locale === "he"
              ? 'יש להזין שם, דוא"ל וסיסמה.'
              : "Please enter your name, email and password.",
          );
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.user && !data.session) {
          setMessage(
            locale === "he"
              ? 'המשתמש נוצר. בדוק את דוא"ל שלך לאישור הרשמה.'
              : "Account created. Please check your email to confirm sign-up.",
          );
          return;
        }

        setMessage(
          locale === "he" ? "נרשמת בהצלחה." : "Signed up successfully.",
        );
        router.push(withLocale(locale, "account"));
        return;
      }

      if (mode === "forgot") {
        if (!email) {
          setMessage(
            locale === "he"
              ? 'יש להזין דוא"ל לשחזור הסיסמה.'
              : "Please enter an email address to reset your password.",
          );
          return;
        }

        const redirectTo = `${window.location.origin}/${locale}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage(
          locale === "he"
            ? "הקישור לשחזור סיסמה נשלח למייל שלך."
            : "A password reset link has been sent to your email.",
        );
        return;
      }

      if (!password) {
        setMessage(
          locale === "he"
            ? "יש להזין סיסמה חדשה."
            : "Please enter a new password.",
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        locale === "he"
          ? "הסיסמה עודכנה בהצלחה."
          : "Password updated successfully.",
      );
      router.push(withLocale(locale, "login"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : locale === "he"
            ? "אירעה שגיאה. נסה שוב."
            : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {fields.map((field) => {
        const autoCompleteValue =
          field.type === "password"
            ? mode === "login"
              ? "current-password"
              : "new-password"
            : field.name;

        return (
          <label key={field.name} className="block">
            <span className="mb-2 block font-bold text-foreground">
              {field.label}
            </span>
            <input
              className="miro-input"
              type={field.type}
              name={field.name}
              autoComplete={autoCompleteValue}
              required={field.name !== "confirmPassword"}
            />
          </label>
        );
      })}

      <button
        type="submit"
        className="miro-button miro-button-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        aria-live="polite"
      >
        {isSubmitting
          ? locale === "he"
            ? "מעבד..."
            : "Processing..."
          : submitLabel}
      </button>

      <p
        role="status"
        className="rounded-lg border border-border-subtle bg-surface-muted p-3 text-sm text-muted-foreground"
      >
        {message}
      </p>
    </form>
  );
}
