"use client";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "@/components/motion/use-motion-router";

export function RemoveSavedButton({
  productId,
  locale,
  productName,
}: {
  productId: string;
  locale: "he" | "en";
  productName: string;
}) {
  const he = locale === "he";
  const router = useRouter();
  const statusId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
      if (restoreFocus.current)
        queueMicrotask(() => {
          // Restore a keyboard deletion's focus after React removes the card, without
          // interrupting someone who has already moved to another control.
          if (document.activeElement === document.body)
            document.getElementById("account-saved-heading")?.focus();
        });
    },
    [],
  );
  async function remove() {
    if (pending.current) return;
    const wasFocused = document.activeElement === button.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/account/saved-products?productId=${encodeURIComponent(productId)}`,
        {
          method: "DELETE",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!response.ok) throw new Error();
      if (pending.current !== controller) return;
      restoreFocus.current = wasFocused;
      setMessage(he ? "המוצר הוסר מהשמורים." : "Removed from saved products.");
      router.refresh();
    } catch {
      if (pending.current === controller)
        setMessage(
          he
            ? "לא ניתן להסיר. נסו שוב."
            : "Could not remove. Please try again.",
        );
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="account-remove-control">
      <button
        ref={button}
        type="button"
        className="miro-button miro-button-secondary text-xs"
        disabled={busy}
        aria-busy={busy}
        aria-label={`${he ? "הסרת" : "Remove"} ${productName}`}
        aria-describedby={statusId}
        onClick={remove}
      >
        {busy ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 size={16} aria-hidden="true" />
        )}
        {busy ? (he ? "מסיר…" : "Removing…") : he ? "הסר" : "Remove"}
      </button>
      <p id={statusId} role="status" className="text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
