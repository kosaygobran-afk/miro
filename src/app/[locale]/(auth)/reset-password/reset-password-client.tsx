"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LiveAuthForm } from "@/components/auth/live-auth-form";
import { type Locale } from "@/lib/i18n";

interface ResetPasswordClientProps {
  locale: Locale;
  noticeTitle: string;
  resetPasswordTitle: string;
  resetPasswordSubtitle: string;
  passwordLabel: string;
  confirmPasswordLabel: string;
  submitLabel: string;
  userEmail?: string;
}

export function ResetPasswordClient({
  locale,
  noticeTitle,
  resetPasswordTitle,
  resetPasswordSubtitle,
  passwordLabel,
  confirmPasswordLabel,
  submitLabel,
  userEmail,
}: ResetPasswordClientProps) {
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const recoveryUser = useRef<Promise<User | null> | null>(null);

  useEffect(() => {
    let active = true;

    const getRecoveryUser = async (): Promise<User | null> => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.slice(1));
        if (url.searchParams.has("error") || hash.has("error")) {
          window.history.replaceState(null, "", url.pathname);
          return null;
        }
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        const implicitRecovery = hash.get("type") === "recovery";
        if (implicitRecovery) {
          // Our client uses PKCE; explicitly accept legacy recovery sessions.
          // Remove credentials before SDK initialization and history navigation.
          window.history.replaceState(null, "", url.pathname);
          if (!accessToken || !refreshToken) return null;
        }
        const supabase = createClient();
        if (implicitRecovery) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          });
          if (error) return null;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        return user;
      } catch {
        // Missing configuration and invalid sessions both require a fresh link.
        return null;
      }
    };

    // Strict Mode replays effects in development. Both runs must await the same
    // exchange; a second run must not read an empty hash or an unfinished session.
    recoveryUser.current ??= getRecoveryUser();
    recoveryUser.current.then((user) => {
      if (!active) return;
      if (user) {
        setEmail(user.email ?? "");
        setValidSession(true);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="miro-section">
        <div className="miro-container max-w-md">
          <div className="miro-card p-6 text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p role="status" className="mt-4 text-muted-foreground">
              {locale === "he" ? "טוען..." : "Loading..."}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const finalEmail = userEmail || email;

  return (
    <section className="miro-section">
      <div className="miro-container max-w-md">
        <div className="miro-card p-6">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] text-accent-text">
            {noticeTitle}
          </p>
          <h1 className="text-3xl font-black">{resetPasswordTitle}</h1>
          <p className="mb-6 mt-2 text-muted-foreground">
            {resetPasswordSubtitle}
          </p>
          {validSession ? (
            <LiveAuthForm
              locale={locale}
              mode="reset"
              fields={[
                {
                  name: "password",
                  label: passwordLabel,
                  type: "password",
                },
                {
                  name: "confirmPassword",
                  label: confirmPasswordLabel,
                  type: "password",
                },
              ]}
              submitLabel={submitLabel}
              initialNotice={
                locale === "he"
                  ? "בחרו לפחות שמונה תווים ואשרו את הסיסמה החדשה."
                  : "Use at least eight characters and confirm your new password."
              }
              userEmail={finalEmail}
            />
          ) : (
            <div>
              <p role="alert" className="mb-4 text-muted-foreground">
                {locale === "he"
                  ? "קישור האיפוס אינו תקף או שפג תוקפו. בקשו קישור חדש ופתחו אותו באותו דפדפן שבו ביקשתם את האיפוס."
                  : "This reset link is invalid or has expired. Request a new link and open it in the same browser where you requested the reset."}
              </p>
              <Link
                className="miro-button miro-button-primary w-full"
                href={`/${locale}/forgot-password`}
              >
                {locale === "he"
                  ? "בקשת קישור חדש"
                  : "Request a new reset link"}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
