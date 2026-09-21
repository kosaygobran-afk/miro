"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
