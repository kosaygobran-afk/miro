"use client";

// @refresh reset
// Tooltip state is transient; remount on edits instead of retaining old Hook dependencies.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function hintPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const halfWidth = Math.min(120, (window.innerWidth - 32) / 2);
  const below = rect.top < 100;
  return {
    left: Math.max(
      halfWidth + 16,
      Math.min(window.innerWidth - halfWidth - 16, rect.left + rect.width / 2),
    ),
    top: below ? rect.bottom + 8 : rect.top - 8,
    below,
  };
}

/** A hoverable, Escape-dismissible hint that escapes card/rail clipping. */
export function CardActionHint({
  label,
  locale,
  children,
}: {
  label: string;
  locale: "he" | "en";
  children: (descriptionId: string | undefined) => ReactNode;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    below: boolean;
  } | null>(null);

  function keepOpen() {
    if (timer.current) clearTimeout(timer.current);
  }

  function show() {
    keepOpen();
    window.dispatchEvent(
      new CustomEvent("miro-card-action-hint-open", { detail: id }),
    );
    if (anchor.current) setPosition(hintPosition(anchor.current));
  }

  function hideSoon() {
    keepOpen();
    timer.current = setTimeout(() => {
      if (!anchor.current?.contains(document.activeElement)) setPosition(null);
    }, 150);
  }

  const open = position !== null;
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setPosition(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const dismissOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) dismiss();
    };
    const reposition = () => {
      const element = anchor.current;
      if (!element) return dismiss();
      const rect = element.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) dismiss();
      else setPosition(hintPosition(element));
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("miro-card-action-hint-open", dismissOther);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("miro-card-action-hint-open", dismissOther);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, id]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <span
      ref={anchor}
      className="sf-card-action-hint"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") show();
      }}
      onPointerLeave={hideSoon}
      onFocusCapture={show}
      onBlurCapture={() => {
        keepOpen();
        setPosition(null);
      }}
      onClick={() => setPosition(null)}
    >
      {children(open ? id : undefined)}
      {position &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            dir={locale === "he" ? "rtl" : "ltr"}
            className="sf-card-action-tooltip"
            data-below={position.below || undefined}
            style={{ left: position.left, top: position.top }}
            onPointerEnter={keepOpen}
            onPointerLeave={hideSoon}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
