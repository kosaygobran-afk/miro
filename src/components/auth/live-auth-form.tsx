"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withLocale, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { passwordRecoveryRedirect } from "@/lib/password-recovery";

export function LiveAuthForm({
  locale,
  mode,
  fields,
  submitLabel,
  initialNotice,
  userEmail,
}: {
  locale: Locale;
  mode: "login" | "signup" | "forgot" | "reset";
  fields: Array<{ name: string; label: string; type: string }>;
  submitLabel: string;
  initialNotice: string;
  userEmail?: string;
}) {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const [message, setMessage] = useState(
    configured
      ? initialNotice
      : locale === "he"
        ? "הכניסה לחשבון אינה זמינה כרגע."
        : "Account access is currently unavailable.",
  );
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
    const password = values.password ?? "";
    const confirmPassword = values.confirmPassword ?? "";
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
        window.location.assign(withLocale(locale, "workspace"));
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
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/${locale}/account`,
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
        router.refresh();
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

        // Provide redirectTo so the recovery link goes to our callback with next=/reset-password
        const redirectTo = passwordRecoveryRedirect(
          window.location.origin,
          locale,
        );
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        // Redirect to check-email page with email in query params
        router.push(
          withLocale(locale, `check-email?email=${encodeURIComponent(email)}`),
        );
        return;
      }

      if (!password || !confirmPassword || password !== confirmPassword) {
        setMessage(
          locale === "he"
            ? confirmPassword
              ? "הסיסמאות אינן תואמות."
              : "יש להזין סיסמה חדשה."
            : confirmPassword
              ? "Passwords do not match."
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

      // Sign out after password reset so user can log in with new password
      await supabase.auth.signOut();

      // Redirect to login with email pre-filled
      const loginUrl = userEmail
        ? withLocale(locale, `login?email=${encodeURIComponent(userEmail)}`)
        : withLocale(locale, "login");
      router.push(loginUrl);
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
              required
              minLength={
                field.type === "password" && mode !== "login" ? 8 : undefined
              }
            />
          </label>
        );
      })}

      <button
        type="submit"
        className="miro-button miro-button-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting || !configured}
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
