"use client";

import { useState } from "react";
import Link from "next/link";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  Mail,
  Loader2,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface CheckEmailClientProps {
  locale: Locale;
  email: string;
  title: string;
  subtitle: string;
  stepsInbox: string;
  stepsSpam: string;
  stepsClick: string;
  resendLabel: string;
  differentEmail: string;
  backToLogin: string;
}

export function CheckEmailClient({
  locale,
  email,
  title,
  subtitle,
  stepsInbox,
  stepsSpam,
  stepsClick,
  resendLabel,
  differentEmail,
  backToLogin,
}: CheckEmailClientProps) {
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setResendMessage(null);

    try {
      const response = await fetch(
        `/api/auth/resend-reset?email=${encodeURIComponent(email)}&locale=${locale}`,
        {
          method: "POST",
        },
      );
      const data = await response.json();

      if (data.error) {
        setResendMessage({
          type: "error",
          text: data.error,
        });
      } else {
        setResendMessage({
          type: "success",
          text: "Email sent again successfully",
        });
      }
    } catch {
      setResendMessage({
        type: "error",
        text:
          locale === "he"
            ? "אירעה שגיאה. נסה שוב."
            : "Something went wrong. Please try again.",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="miro-card p-8 text-center" suppressHydrationWarning>
      {/* Animated Mail Icon */}
      <div className="mx-auto mb-6 relative">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <Mail className="w-10 h-10 text-primary" />
        </div>
        {/* Orbiting dots animation */}
        <div className="absolute inset-0 -inset-4 flex items-center justify-center pointer-events-none">
          <div className="w-32 h-32 border-2 border-primary/20 rounded-full animate-spin" />
        </div>
        <div className="absolute inset-0 -inset-8 flex items-center justify-center pointer-events-none">
          <div
            className="w-40 h-40 border-2 border-primary/10 rounded-full animate-spin reverse"
            style={{ animationDuration: "3s" }}
          />
        </div>
      </div>

      <h1 className="text-2xl font-black mb-2">{title}</h1>
      <p className="text-muted-foreground mb-6">{subtitle}</p>

      <div className="space-y-3 text-sm text-muted-foreground mb-6 p-4 bg-surface-muted rounded-xl">
        <p className="flex items-center justify-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span>{stepsInbox}</span>
        </p>
        <p className="flex items-center justify-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span>{stepsSpam}</span>
        </p>
        <p className="flex items-center justify-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
          <span>{stepsClick}</span>
        </p>
      </div>

      {/* Resend Section */}
      <div className="border-t border-border-subtle pt-6">
        <p className="text-sm text-muted-foreground mb-4">
          {locale === "he" ? "לא קיבלת את המייל?" : "Didn't receive the email?"}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleResend}
            disabled={resending}
            className="miro-button miro-button-secondary w-full gap-2"
          >
            {resending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{locale === "he" ? "שולח..." : "Sending..."}</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>{resendLabel}</span>
              </>
            )}
          </button>

          {resendMessage && (
            <p
              className={`text-sm flex items-center justify-center gap-2 ${
                resendMessage.type === "success"
                  ? "text-success-text"
                  : "text-error-text"
              }`}
              role="status"
            >
              {resendMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              {resendMessage.text}
            </p>
          )}

          <Link
            className="text-sm text-accent-text hover:underline flex items-center justify-center gap-1"
            href={withLocale(locale, "forgot-password")}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{differentEmail}</span>
          </Link>
        </div>
      </div>

      <Link
        className="mt-6 block text-sm text-accent-text hover:underline"
        href={withLocale(locale, "login")}
      >
        {backToLogin}
      </Link>
    </div>
  );
}
