"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Store } from "lucide-react";
import { roleLabel, type AppRole } from "@/lib/roles";
import { withLocale, type Locale } from "@/lib/i18n";
import { mgmtShellCopy } from "./nav-config";

export type AccountMenuProps = {
  locale: Locale;
  role: AppRole;
  userName: string;
  userEmail: string;
};

/**
 * User/account affordance for the management top bar: identity button that
 * opens a small popover with user details, storefront link and logout.
 * Escape or an outside pointer press closes it and focus returns to the
 * trigger.
 */
export function AccountMenu({
  locale,
  role,
  userName,
  userEmail,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);

    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const initials =
    (userName || userEmail)
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="mgmt-account" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mgmt-account__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={mgmtShellCopy.accountMenuLabel[locale]}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="mgmt-account__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="mgmt-account__name">{userName || userEmail}</span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={
            open
              ? "mgmt-account__chevron mgmt-account__chevron--open"
              : "mgmt-account__chevron"
          }
        />
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="mgmt-account__popover"
          role="group"
          aria-label={mgmtShellCopy.accountMenuLabel[locale]}
        >
          <div className="mgmt-account__identity">
            <span className="mgmt-account__identity-label">
              {mgmtShellCopy.signedInAs[locale]}
            </span>
            <span className="mgmt-account__identity-name">
              {userName || userEmail}
            </span>
            {userName && userEmail ? (
              <span className="mgmt-account__identity-email">{userEmail}</span>
            ) : null}
            <span className={`mgmt-account__role mgmt-account__role--${role}`}>
              {roleLabel(role, locale)}
            </span>
          </div>
          <a
            href={withLocale(locale)}
            className="mgmt-account__item"
            onClick={() => setOpen(false)}
          >
            <Store size={15} aria-hidden="true" />
            <span>{mgmtShellCopy.storefrontLink[locale]}</span>
          </a>
          <form action={`/api/auth/logout?locale=${locale}`} method="POST">
            <button
              type="submit"
              className="mgmt-account__item mgmt-account__item--logout"
            >
              <LogOut size={15} aria-hidden="true" />
              <span>{mgmtShellCopy.logout[locale]}</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
