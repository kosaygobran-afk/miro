"use client";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "../shell/workspace-context";
import { can } from "@/lib/permissions";
export function SalesChannelControl({
  productId,
  locale,
}: {
  productId: string;
  locale: "he" | "en";
}) {
  const workspace = useWorkspace();
  const writable = can(workspace?.role ?? "worker", "manageSettings");
  const he = locale === "he";
  const [saved, setSaved] = useState<{
    sales_channel: string;
    updated_at: string;
  } | null>(null);
  const [channel, setChannel] = useState("contact_only");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/management/commerce/product-channel?product_id=${productId}`,
          { cache: "no-store", signal },
        );
        if (!response.ok) throw new Error("unavailable");
        const result = await response.json();
        if (!signal?.aborted) {
          setSaved(result);
          setChannel(result.sales_channel);
        }
      } catch {
        if (!signal?.aborted)
          setMessage(
            he
              ? "הגדרות ערוצי המכירה אינן זמינות בסביבה זו."
              : "Sales channel settings are unavailable in this environment.",
          );
      }
    },
    [productId, he],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);
  async function save() {
    if (!saved || busy || !writable) return;
    setBusy(true);
    try {
      const response = await fetch("/api/management/commerce/product-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          channel,
          expected_updated_at: saved.updated_at,
        }),
      });
      setMessage(
        response.ok
          ? he
            ? "ערוץ המכירה נשמר."
            : "Sales channel saved."
          : he
            ? "המידע השתנה או שהשמירה לא אושרה. רעננו ובדקו לפני ניסיון נוסף."
            : "The record changed or the save was not confirmed. Reload and review before retrying.",
      );
      await load();
    } catch {
      setMessage(
        he
          ? "תוצאת השמירה אינה ידועה. רעננו לפני ניסיון נוסף."
          : "The save result is unknown. Reload before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const labels = he
    ? ["פנייה בלבד", "קופה בלבד", "תשלום באתר", "קופה ותשלום באתר"]
    : ["Contact only", "POS only", "Online checkout", "POS and online"];
  return (
    <section style={{ gridColumn: "1 / -1", display: "grid", gap: "0.75rem" }}>
      <label htmlFor="product-sales-channel">
        {he ? "ערוץ מכירה — אישור מנכ״ל" : "Sales channel — CEO approval"}
      </label>
      <select
        id="product-sales-channel"
        className="miro-input"
        value={channel}
        disabled={!saved || !writable || busy}
        onChange={(event) => setChannel(event.target.value)}
      >
        {["contact_only", "pos_only", "online_checkout", "pos_and_online"].map(
          (value, index) => (
            <option value={value} key={value}>
              {labels[index]}
            </option>
          ),
        )}
      </select>
      <p>
        {he
          ? "תשלום באתר דורש מחיר ומלאי מאושרים וחיבור סליקה פעיל. דוגמאות הקטלוג נשארות לפנייה בלבד עד אישור מפורש."
          : "Online checkout requires approved pricing, stock and an active gateway. Reference catalog products stay contact-only until explicitly approved."}
      </p>
      {writable ? (
        <button
          type="button"
          className="mgmt-button mgmt-button--secondary"
          disabled={!saved || busy || channel === saved.sales_channel}
          onClick={() => void save()}
        >
          {he ? "שמירת ערוץ מכירה" : "Save sales channel"}
        </button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
