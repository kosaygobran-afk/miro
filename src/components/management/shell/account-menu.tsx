"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useAnimationSettings } from "@/components/motion/animation-provider";
import { createPortal } from "react-dom";
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
  const menuId = useId();
  const animationSettings = useAnimationSettings();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const focusFirst = () =>
      panelRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true });
    if (animationSettings.appearanceVersion !== "2") {
      focusFirst();
      return;
    }
    const anchor = triggerRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth;
      const height = viewport?.height ?? innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const panelWidth = Math.min(320, width - 32);
      panel.style.width = `${panelWidth}px`;
      panel.style.maxHeight = `${Math.max(0, height - 32)}px`;
      const preferred =
        locale === "he" ? bounds.left : bounds.right - panelWidth;
      panel.style.left = `${Math.max(left + 16, Math.min(preferred, left + width - panelWidth - 16))}px`;
      panel.style.top = `${Math.max(top + 16, Math.min(bounds.bottom + 10, top + height - panel.offsetHeight - 20))}px`;
    };
    place();
    focusFirst();
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    observer.observe(panel);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      for (const property of ["width", "max-height", "left", "top"])
        panel.style.removeProperty(property);
    };
  }, [open, locale, animationSettings.appearanceVersion]);

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
        !rootRef.current.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    // Keyboard users can tab from the menu straight into the tools popup.
    // Close on focus leaving the menu so the two overlays never stack.
    const onFocusIn = (event: FocusEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
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

  const accountPanel = open ? (
    <div
      ref={panelRef}
      id={menuId}
      className="mgmt-account__popover"
      role="menu"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          setOpen(false);
          triggerRef.current?.focus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="menuitem"]',
          ),
        );
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  items.length) %
                items.length;
        items[next]?.focus();
      }}
      aria-label={mgmtShellCopy.accountMenuLabel[locale]}
    >
      <div className="mgmt-account__identity">
        <span className="mgmt-account__identity-avatar" aria-hidden="true">
          {initials}
        </span>
        <div className="mgmt-account__identity-copy">
          <span className="mgmt-account__identity-label">
            {mgmtShellCopy.signedInAs[locale]}
          </span>
          <span className="mgmt-account__identity-name" dir="auto">
            {userName || userEmail}
          </span>
          {userName && userEmail ? (
            <span className="mgmt-account__identity-email" dir="auto">
              {userEmail}
            </span>
          ) : null}
          <span className={`mgmt-account__role mgmt-account__role--${role}`}>
            {roleLabel(role, locale)}
          </span>
        </div>
      </div>
      <p className="mgmt-account__current-area">
        {locale === "he"
          ? "נמצא כעת: סביבת הניהול"
          : "Current area: Management console"}
      </p>
      <a
        href={withLocale(locale)}
        className="mgmt-account__item"
        role="menuitem"
        onClick={() => setOpen(false)}
      >
        <Store size={15} aria-hidden="true" />
        <span>{mgmtShellCopy.storefrontLink[locale]}</span>
      </a>
      <form
        action={`/api/auth/logout?locale=${locale}`}
        method="POST"
        onSubmit={() => {
          // Block delayed saves while the logout request is navigating.
          if (typeof window !== "undefined") {
            document.documentElement.dataset.managementSigningOut = "true";
            try {
              const keys = Object.keys(sessionStorage).filter(
                (key) =>
                  key.startsWith("miro.management.tools.draft.") ||
                  key.startsWith("miro.payment.keys."),
              );
              for (const key of keys) {
                sessionStorage.removeItem(key);
              }
            } catch {
              // Storage can be disabled; logout must still proceed.
            }
          }
        }}
      >
        <button
          type="submit"
          className="mgmt-account__item mgmt-account__item--logout"
          role="menuitem"
        >
          <LogOut size={15} aria-hidden="true" />
          <span>{mgmtShellCopy.logout[locale]}</span>
        </button>
      </form>
    </div>
  ) : null;
  const portalHost =
    open && animationSettings.appearanceVersion === "2"
      ? document.getElementById("mgmt-overlay-portal-host")
      : null;

  return (
    <div className="mgmt-account" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mgmt-account__trigger"
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
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
      {portalHost ? createPortal(accountPanel, portalHost) : accountPanel}
    </div>
  );
}
