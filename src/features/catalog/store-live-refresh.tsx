"use client";

import { useEffect } from "react";
import { useRouter } from "@/components/motion/use-motion-router";
import { getClient } from "@/lib/supabase/client";

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
    // The subscribed row contains only a version and timestamp; private
    // product fields never enter the public Realtime publication.
    const hasPublicKey = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    );
    const client = hasPublicKey ? getClient() : null;
    const channel = client
      ?.channel("store-catalog-version")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "store_catalog_version",
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const poll = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      if (pending) clearTimeout(pending);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [router]);

  return null;
}
