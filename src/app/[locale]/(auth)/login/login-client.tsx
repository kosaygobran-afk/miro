"use client";

import { useState } from "react";
import { withLocale, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";

interface LoginClientProps {
  locale: Locale;
  prefilledEmail?: string;
  emailLabel: string;
  passwordLabel: string;
  submitLabel: string;
}

export function LoginClient({
  locale,
  prefilledEmail,
  emailLabel,
  passwordLabel,
  submitLabel,
}: LoginClientProps) {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const [message, setMessage] = useState(
    configured
      ? locale === "he"
        ? "התחברו באופן מאובטח לחשבון שלכם."
        : "Sign in securely to your account."
      : locale === "he"
        ? "הכניסה לחשבון אינה זמינה כרגע."
        : "Account access is currently unavailable.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setShowSuccess(false);
    setMessage(
      locale === "he"
        ? "התחברו באופן מאובטח לחשבון שלכם."
        : "Sign in securely to your account.",
    );

    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries()) as Record<
      string,
      string
    >;
    const email = prefilledEmail ?? (values.email ?? "").trim();
    const password = values.password ?? "";

    try {
      const supabase = createClient();

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

      setShowSuccess(true);
      setMessage(
        locale === "he"
          ? "התחברת בהצלחה. מעביר אותך לחשבון..."
          : "Signed in successfully. Redirecting to your account...",
      );

      // Read the authoritative role on a fresh server request after cookies land.
      window.location.assign(withLocale(locale, "workspace"));
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

  // If email is prefilled, show only password field with email display
  if (prefilledEmail) {
    return (
      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Email Display - Read-only */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-foreground">
            {emailLabel}
          </label>
          <div className="flex items-center gap-3 p-3 bg-surface-muted border border-border-subtle rounded-lg">
            <Mail className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-foreground font-medium truncate">
              {prefilledEmail}
            </span>
            <CheckCircle2 className="w-5 h-5 text-success-text shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground">
            {locale === "he"
              ? "הזן רק את הסיסמה החדשה שלך"
              : "Enter only your new password"}
          </p>
        </div>

        {/* Password Field */}
        <label className="block">
          <span className="mb-2 block font-bold text-foreground">
            {passwordLabel}
          </span>
          <input
            className="miro-input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            disabled={isSubmitting}
          />
        </label>

        <button
          type="submit"
          className="miro-button miro-button-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting || !configured}
          aria-live="polite"
        >
          {isSubmitting
            ? locale === "he"
              ? "מתחבר..."
              : "Signing in..."
            : submitLabel}
        </button>

        {/* Success/Error Message */}
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm flex items-center gap-2 transition-all ${
            showSuccess
              ? "border-success-text/30 bg-success-text/10 text-success-text"
              : message.includes("שגיאה") ||
                  message.includes("error") ||
                  message.includes("Error") ||
                  message.includes("Invalid") ||
                  message.includes("נכשל")
                ? "border-error-text/30 bg-error-text/10 text-error-text"
                : "border-border-subtle bg-surface-muted text-muted-foreground"
          }`}
        >
          {showSuccess && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          {!showSuccess &&
            (message.includes("שגיאה") ||
              message.includes("error") ||
              message.includes("Error") ||
              message.includes("Invalid") ||
              message.includes("נכשל")) && (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
          <span>{message}</span>
        </div>
      </form>
    );
  }

  // Normal login form with both email and password
  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-2 block font-bold text-foreground">
          {emailLabel}
        </span>
        <input
          className="miro-input"
          type="email"
          name="email"
          autoComplete="email"
          required
          disabled={isSubmitting}
        />
      </label>

      <label className="block">
        <span className="mb-2 block font-bold text-foreground">
          {passwordLabel}
        </span>
        <input
          className="miro-input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={isSubmitting}
        />
      </label>

      <button
        type="submit"
        className="miro-button miro-button-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting || !configured}
        aria-live="polite"
      >
        {isSubmitting
          ? locale === "he"
            ? "מתחבר..."
            : "Signing in..."
          : submitLabel}
      </button>

      <div
        role="status"
        className={`rounded-lg border p-3 text-sm flex items-center gap-2 transition-all ${
          showSuccess
            ? "border-success-text/30 bg-success-text/10 text-success-text"
            : message.includes("שגיאה") ||
                message.includes("error") ||
                message.includes("Error") ||
                message.includes("Invalid") ||
                message.includes("נכשל")
              ? "border-error-text/30 bg-error-text/10 text-error-text"
              : "border-border-subtle bg-surface-muted text-muted-foreground"
        }`}
      >
        {showSuccess && <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {!showSuccess &&
          (message.includes("שגיאה") ||
            message.includes("error") ||
            message.includes("Error") ||
            message.includes("Invalid") ||
            message.includes("נכשל")) && (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
        <span>{message}</span>
      </div>
    </form>
  );
}
