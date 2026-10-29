"use client";

import { useState } from "react";
import { useRouter } from "@/components/motion/use-motion-router";
import { createClient } from "@/lib/supabase/client";
import { invalidateAccountSession } from "@/lib/account-session";

export function LogoutButton({
  label,
  locale = "he",
}: {
  label: string;
  locale?: "he" | "en";
}) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setIsLoading(true);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setIsLoading(false);
      return;
    }
    invalidateAccountSession();
    router.push(`/${locale}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      className="miro-button miro-button-secondary"
      onClick={handleLogout}
      disabled={isLoading}
    >
      {isLoading ? "..." : label}
    </button>
  );
}
