"use client";

import { useEffect } from "react";
import { useRouter } from "@/components/motion/use-motion-router";
import { getClient } from "@/lib/supabase/client";

const RECONCILE_INTERVAL_MS = 120_000;

/** Keep an open storefront in sync with catalog and stock writes elsewhere. */
export function StoreLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const hasPublicKey = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    );
    if (!hasPublicKey) return;
    const client = getClient();
    let disposed = false;
    let checking = false;
    let version: number | null = null;
    let renderedVersion: number | null = null;
    let refreshedAt = Date.now();
    let pending: ReturnType<typeof setTimeout> | null = null;
    const needsRefresh = () =>
      version !== renderedVersion ||
      // Scheduled promotions and private role prices do not all emit the public
      // signal. Reconcile them periodically once popup interaction has ended.
      (Date.now() - refreshedAt >= RECONCILE_INTERVAL_MS &&
        !document.querySelector(".sf-hover-preview, [data-preview-intent]"));
    const refresh = () => {
      if (
        disposed ||
        document.visibilityState !== "visible" ||
        !needsRefresh() ||
        pending
      )
        return;
      pending = setTimeout(() => {
        pending = null;
        if (
          disposed ||
          document.visibilityState !== "visible" ||
          !needsRefresh()
        )
          return;
        renderedVersion = version;
        refreshedAt = Date.now();
        router.refresh();
      }, 250);
    };
    const observeVersion = (next: unknown, fromUpdate = false) => {
      if (disposed || typeof next !== "number" || !Number.isSafeInteger(next))
        return;
      if (version === null) {
        version = next;
        // The first read establishes a baseline. A real UPDATE still needs a
        // refresh if it beats that read; it happened after this page was loaded.
        if (!fromUpdate) renderedVersion = next;
      } else if (next > version) {
        version = next;
      }
      refresh();
    };
    const checkVersion = async () => {
      if (disposed || checking || document.visibilityState !== "visible")
        return;
      checking = true;
      try {
        const { data, error } = await client
          .from("store_catalog_version")
          .select("version")
          .eq("id", 1)
          .abortSignal(AbortSignal.timeout(10_000))
          .single();
        if (!error) observeVersion(data?.version);
      } catch {
        // Keep the rendered catalog on an outage; the next read can recover.
      } finally {
        checking = false;
      }
    };
    // The subscribed row contains only a version and timestamp; private
    // product fields never enter the public Realtime publication.
    const channel = client
      .channel("store-catalog-version")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "store_catalog_version",
        },
        (payload) => observeVersion(payload.new.version, true),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void checkVersion();
      });
    const poll = setInterval(checkVersion, 15000);
    document.addEventListener("visibilitychange", checkVersion);
    window.addEventListener("focus", checkVersion);
    void checkVersion();
    return () => {
      disposed = true;
      if (pending) clearTimeout(pending);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", checkVersion);
      window.removeEventListener("focus", checkVersion);
      void client.removeChannel(channel);
    };
  }, [router]);

  return null;
}
