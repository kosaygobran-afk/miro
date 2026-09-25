"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

// Legacy/dashboard recovery links can land on Site URL with tokens in the hash.
// Move the hash intact: only the reset page should consume this session.
export function RecoveryRedirect({ locale }: { locale: Locale }) {
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const resetPath = `/${locale}/reset-password`;
    if (
      window.location.pathname !== resetPath &&
      (hash.get("type") === "recovery" ||
        hash.get("error_code") === "otp_expired")
    ) {
      window.location.replace(`${resetPath}${window.location.hash}`);
    }
  }, [locale]);

  return null;
}
