"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

interface UsePosBarcodeOptions {
  onMatch: (sku: string) => void;
  enabled?: boolean;
  scopeRef?: RefObject<HTMLElement | null>;
  onClear?: () => void;
}

/** Keyboard-wedge scanning is scoped to the active POS and never steals a dialog/input Enter. */
export function usePosBarcode({
  onMatch,
  enabled = true,
  scopeRef,
}: UsePosBarcodeOptions) {
  const [buffer, setBuffer] = useState("");
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBuffer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    bufferRef.current = "";
    lastKeyTimeRef.current = 0;
    setBuffer("");
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !target
      )
        return;
      const enclosingDialog = target.closest("[role='dialog']");
      const anotherModal = Array.from(
        document.querySelectorAll("[role='dialog'][aria-modal='true']"),
      ).some(
        (dialog) =>
          dialog.checkVisibility() &&
          (!scopeRef?.current || !dialog.contains(scopeRef.current)),
      );
      if (
        target.closest(
          "input, textarea, select, [contenteditable], [role='menu']",
        ) ||
        (enclosingDialog &&
          (!scopeRef?.current ||
            !enclosingDialog.contains(scopeRef.current))) ||
        anotherModal
      ) {
        clearBuffer();
        return;
      }
      const scopeRoot =
        scopeRef?.current?.closest("[data-pos-shell='true']") ??
        scopeRef?.current;
      if (
        scopeRef?.current &&
        (!scopeRef.current.checkVisibility() || !scopeRoot?.contains(target))
      ) {
        clearBuffer();
        return;
      }
      const now = performance.now();
      if (now - lastKeyTimeRef.current > 100) bufferRef.current = "";
      lastKeyTimeRef.current = now;
      if (event.key === "Enter") {
        const scanned = bufferRef.current.trim();
        if (scanned.length >= 3) {
          event.preventDefault();
          event.stopPropagation();
          onMatch(scanned);
        }
        clearBuffer();
        return;
      }
      if (event.key.length !== 1) {
        clearBuffer();
        return;
      }
      bufferRef.current = (bufferRef.current + event.key).slice(-200);
      setBuffer(bufferRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(clearBuffer, 150);
    };
    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("keydown", handle);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      bufferRef.current = "";
    };
  }, [enabled, onMatch, scopeRef, clearBuffer]);
  return { buffer, clearBuffer };
}

export function usePosBarcodeInput({
  onMatch,
  enabled = true,
  onClear,
}: UsePosBarcodeOptions) {
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (
        !enabled ||
        event.defaultPrevented ||
        event.nativeEvent.isComposing ||
        event.repeat
      )
        return;
      if (event.key === "Enter") {
        const value = event.currentTarget.value.trim();
        if (value) {
          event.preventDefault();
          event.stopPropagation();
          onMatch(value);
          onClear?.();
        }
      }
    },
    [enabled, onMatch, onClear],
  );
  return { onKeyDown };
}
