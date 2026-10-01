"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keep an open storefront in sync with catalog and stock writes elsewhere. */
export function StoreLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, 250);
    };
    // Avoid publishing complete product rows (including private cost fields)
    // over a public Realtime channel. Refresh visible storefronts frequently.
    const poll = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      if (pending) clearTimeout(pending);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  return null;
}
