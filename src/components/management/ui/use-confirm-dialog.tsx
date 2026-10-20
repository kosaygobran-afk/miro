"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmationDialog } from "./dialog";

export type ConfirmDialogOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel: ReactNode;
  /** "danger" styling for destructive confirmations. */
  tone?: "default" | "danger";
  closeLabel?: string;
};

type ConfirmRequest = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

export type ConfirmDialogApi = {
  /**
   * Opens the themed confirmation dialog and resolves `true`/`false`,
   * matching the blocking semantics of a native confirm() call.
   */
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  /** Render this node once somewhere in the component tree. */
  dialogNode: ReactNode;
};

/**
 * Promise-based replacement for `window.confirm` that keeps the same stop/
 * proceed semantics while using the themed, accessible management dialog
 * (focus trap, Escape cancels, overlay click cancels, portal-host theming).
 *
 * Calls are serialized: a second confirm() only opens after the previous
 * answer, mirroring the modal behaviour of a native confirm() dialog.
 */
export function useConfirmDialog(): ConfirmDialogApi {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const tail = useRef<Promise<unknown>>(Promise.resolve());

  const settle = useCallback((confirmed: boolean) => {
    setRequest((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    const run = () =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      });
    const chained = tail.current.then(run, run);
    // Never let an aborted/hard-rejected chain jam later activations.
    tail.current = chained.then(
      () => undefined,
      () => undefined,
    );
    return chained;
  }, []);

  const dialogNode = request ? (
    <ConfirmationDialog
      open
      tone={request.tone}
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      closeLabel={request.closeLabel}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, dialogNode };
}
