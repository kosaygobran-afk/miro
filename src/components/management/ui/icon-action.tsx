"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { OverflowText } from "./overflow-text";

type IconActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  tone?: "neutral" | "danger";
};

function tooltipPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const halfWidth = Math.min(192, (window.innerWidth - 32) / 2);
  return {
    top: rect.bottom + 8,
    left: Math.max(
      halfWidth + 16,
      Math.min(window.innerWidth - halfWidth - 16, rect.left + rect.width / 2),
    ),
  };
}

/** Shared tooltip behavior for buttons and navigation actions. */
function useActionTooltip(label: string, tooltipClass = "") {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };
  const hideSoon = () => {
    keepOpen();
    hideTimer.current = setTimeout(() => setPosition(null), 180);
  };
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    const dismiss = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      anchor.current = null;
      setPosition(null);
    };
    const reposition = () => {
      const element = anchor.current;
      if (
        element?.isConnected &&
        (element.matches(":hover") || document.activeElement === element)
      ) {
        setPosition(tooltipPosition(element));
      } else dismiss();
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", escape);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  function show(element: HTMLElement) {
    keepOpen();
    anchor.current = element;
    setPosition(tooltipPosition(element));
  }
  const handlers = {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) =>
      show(event.currentTarget),
    onPointerLeave: hideSoon,
    onFocus: (event: React.FocusEvent<HTMLElement>) =>
      show(event.currentTarget),
    onBlur: () => {
      anchor.current = null;
      setPosition(null);
    },
    "aria-describedby": position ? id : undefined,
  };
  const tooltip = position
    ? createPortal(
        <span
          id={id}
          role="tooltip"
          className={`mgmt-action-tooltip ${tooltipClass}`}
          style={position}
          onPointerEnter={keepOpen}
          onPointerLeave={hideSoon}
        >
          {label}
        </span>,
        document.body,
      )
    : null;
  return { handlers, tooltip };
}

/** A bounded primary name with secondary metadata revealed outside the table. */
export function TextHint({
  text,
  detail,
  dir,
}: {
  text: string;
  detail: string;
  dir?: "ltr" | "rtl";
}) {
  const { handlers, tooltip } = useActionTooltip(
    detail,
    "mgmt-text-hint__tooltip",
  );
  return (
    <>
      <span {...handlers} tabIndex={0} className="mgmt-text-hint" dir={dir}>
        <OverflowText text={text} dir={dir} focusable={false} />
      </span>
      {tooltip}
    </>
  );
}

export function IconAction({
  label,
  children,
  tone = "neutral",
  className,
  ...props
}: IconActionProps) {
  const { handlers, tooltip } = useActionTooltip(label);
  return (
    <>
      <button
        {...props}
        {...handlers}
        type="button"
        className={["mgmt-icon-action", `mgmt-icon-action--${tone}`, className]
          .filter(Boolean)
          .join(" ")}
        aria-label={props["aria-label"] ?? label}
      >
        {children}
      </button>
      {tooltip}
    </>
  );
}

export function IconLink({
  label,
  children,
  className,
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  label: string;
  href: string;
  children: ReactNode;
}) {
  const { handlers, tooltip } = useActionTooltip(label);
  return (
    <>
      <Link
        {...props}
        {...handlers}
        href={href}
        className={["mgmt-icon-action", className].filter(Boolean).join(" ")}
        aria-label={label}
      >
        {children}
      </Link>
      {tooltip}
    </>
  );
}

export function ActivationSwitch({
  active,
  label,
  ...props
}: Omit<IconActionProps, "children"> & { active: boolean }) {
  return (
    <IconAction
      {...props}
      label={label}
      role="switch"
      aria-checked={active}
      className="mgmt-activation-switch"
    >
      <span className="mgmt-activation-switch__track" aria-hidden="true">
        <span className="mgmt-activation-switch__thumb">
          <span />
        </span>
      </span>
    </IconAction>
  );
}
