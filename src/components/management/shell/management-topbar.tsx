"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "@/components/motion/motion-link";
import { usePathname } from "next/navigation";
import { useRouter } from "@/components/motion/use-motion-router";
import { Menu, Store, Pause, Play, Ellipsis } from "lucide-react";
import { roleLabel, type AppRole } from "@/lib/roles";
import { withLocale, type Locale } from "@/lib/i18n";
import { switchNavigationLocale } from "@/components/layout/switch-navigation-locale";
import {
  matchMgmtNav,
  mgmtNavItemLabel,
  mgmtNavItemSubtitle,
  mgmtNavSectionLabel,
  mgmtShellCopy,
} from "./nav-config";
import { IconAction, IconLink } from "../ui/icon-action";
import { AccountMenu } from "./account-menu";
import { WorkspaceDisplay, WorkspaceTools } from "./workspace-tools";

import { NavigationThemeSelector } from "@/components/layout/navigation-theme-selector";

function subscribeTextMotion(callback: () => void) {
  window.addEventListener("miro-text-motion", callback);
  return () => window.removeEventListener("miro-text-motion", callback);
}
function readTextMotion() {
  return document.documentElement.dataset.textMotion === "paused";
}

export type ManagementTopbarProps = {
  locale: Locale;
  role: AppRole;
  userName: string;
  userEmail: string;
  /** Opens the mobile navigation drawer. Only rendered under lg screens. */
  onOpenNav: () => void;
};

/**
 * Management top bar: hamburger (mobile), breadcrumb, current page title and
 * subtitle on the start side; storefront link, role badge and account menu on
 * the end side. Language/theme switches on the end side too.
 * Title/crumb resolve from the shared nav model.
 */
export function ManagementTopbar({
  locale,
  role,
  userName,
  userEmail,
  onOpenNav,
}: ManagementTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const topbarRef = useRef<HTMLElement>(null);
  const controlsTrigger = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const controlsId = useId();
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1200px)");
    const reconcile = () => {
      const focused = document.activeElement;
      // An open tool restores focus to its mounted opener after closing.
      setControlsOpen(
        !desktop.matches &&
          Array.from(document.querySelectorAll('[role="dialog"]')).some(
            (dialog) => dialog.getClientRects().length > 0,
          ),
      );
      if (desktop.matches && focused === controlsTrigger.current)
        controlsRef.current
          ?.querySelector<HTMLElement>("button, a")
          ?.focus({ preventScroll: true });
      else if (!desktop.matches && controlsRef.current?.contains(focused))
        controlsTrigger.current?.focus({ preventScroll: true });
    };
    desktop.addEventListener("change", reconcile);
    return () => desktop.removeEventListener("change", reconcile);
  }, []);
  useEffect(() => {
    if (!controlsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        endRef.current?.contains(event.target) ||
        event.target.closest('[role="dialog"], #mgmt-overlay-portal-host')
      )
        return;
      setControlsOpen(false);
    };
    // Window bubble runs after modal capture and floating-window Escape handlers.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setControlsOpen(false);
      if (controlsTrigger.current?.getClientRects().length)
        controlsTrigger.current.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [controlsOpen]);
  const { section, item } = matchMgmtNav(
    pathname ?? `/${locale}/admin`,
    locale,
  );
  const isOverview = item.key === "overview";
  const restricted = item.ceoOnly && role !== "ceo";

  const he = locale === "he";
  const textPaused = useSyncExternalStore(
    subscribeTextMotion,
    readTextMotion,
    () => false,
  );
  // Keep sticky content and the navigation beam within the actual workspace.
  useLayoutEffect(() => {
    const element = topbarRef.current;
    if (!element) return;

    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const style = document.documentElement.style;
      style.setProperty("--mgmt-topbar-height", `${bounds.height}px`);
      style.setProperty("--mgmt-workspace-left", `${bounds.left}px`);
      style.setProperty(
        "--mgmt-workspace-right",
        `${document.documentElement.clientWidth - bounds.right}px`,
      );
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element, { box: "border-box" });
    // A breakpoint can move the workspace while leaving its width unchanged.
    window.addEventListener("resize", measure);
    measure();

    return () => {
      resizeObserver.unobserve(element);
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--mgmt-topbar-height");
      document.documentElement.style.removeProperty("--mgmt-workspace-left");
      document.documentElement.style.removeProperty("--mgmt-workspace-right");
    };
  }, []);

  function handleLocaleChange() {
    const newLocale = locale === "he" ? "en" : "he";
    switchNavigationLocale(pathname, newLocale, router);
  }

  return (
    <header ref={topbarRef} className="mgmt-topbar">
      <div className="mgmt-topbar__start">
        <button
          type="button"
          className="mgmt-topbar__menu-button"
          onClick={() => {
            setControlsOpen(false);
            onOpenNav();
          }}
          aria-label={mgmtShellCopy.openNavigation[locale]}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="mgmt-topbar__text">
          <nav
            className="mgmt-topbar__breadcrumb"
            aria-label={
              locale === "he" ? "נתיב סביבת העבודה" : "Workspace breadcrumb"
            }
          >
            <ol className="mgmt-topbar__breadcrumb-list">
              <li className="mgmt-topbar__breadcrumb-item">
                <Link
                  href={withLocale(locale, "admin")}
                  className="mgmt-topbar__breadcrumb-link"
                >
                  {mgmtShellCopy.breadcrumbRoot[locale]}
                </Link>
              </li>
              {!isOverview ? (
                <>
                  <li
                    className="mgmt-topbar__breadcrumb-item mgmt-topbar__breadcrumb-item--static"
                    aria-hidden="true"
                  >
                    <span>{mgmtNavSectionLabel(section.key, locale)}</span>
                  </li>
                  <li
                    className="mgmt-topbar__breadcrumb-item"
                    aria-current="page"
                  >
                    <span>{mgmtNavItemLabel(item.key, locale)}</span>
                  </li>
                </>
              ) : null}
            </ol>
          </nav>
          <div className="mgmt-topbar__heading">
            <p className="mgmt-topbar__title">
              {mgmtNavItemLabel(item.key, locale)}
            </p>
            {restricted ? (
              <span
                className="mgmt-topbar__restricted-badge"
                title={mgmtShellCopy.ceoOnlyHint[locale]}
              >
                {mgmtShellCopy.ceoOnlyBadge[locale]}
              </span>
            ) : null}
          </div>
          <p className="mgmt-topbar__subtitle">
            {mgmtNavItemSubtitle(item.key, locale)}
            {restricted ? ` ${mgmtShellCopy.ceoOnlyHint[locale]}` : ""}
          </p>
        </div>
      </div>
      <div
        className="mgmt-topbar__end"
        ref={endRef}
        onPointerDownCapture={(event) => {
          // Below 1200px the tools group is a popup; opening the account menu
          // closes it so the two overlays never stack. Desktop inline tools
          // stay visible regardless of this state.
          if (
            event.target instanceof Element &&
            event.target.closest(".mgmt-account__trigger")
          )
            setControlsOpen(false);
        }}
        onClickCapture={(event) => {
          // Keyboard activation (Enter/Space) fires click without pointerdown.
          if (
            event.target instanceof Element &&
            event.target.closest(".mgmt-account__trigger")
          )
            setControlsOpen(false);
        }}
      >
        <button
          ref={controlsTrigger}
          type="button"
          className="mgmt-topbar__controls-toggle"
          aria-label={he ? "כלים ותצוגה" : "Tools and display"}
          title={he ? "כלים ותצוגה" : "Tools and display"}
          aria-expanded={controlsOpen}
          aria-controls={controlsId}
          onClick={() => setControlsOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            setControlsOpen(true);
            requestAnimationFrame(() =>
              controlsRef.current
                ?.querySelector<HTMLElement>("button, a")
                ?.focus(),
            );
          }}
        >
          <Ellipsis size={19} aria-hidden="true" />
        </button>
        <div
          id={controlsId}
          ref={controlsRef}
          className="mgmt-topbar__controls"
          data-open={controlsOpen}
          role="group"
          aria-label={he ? "כלים ותצוגה" : "Tools and display"}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (
              next instanceof Element &&
              !endRef.current?.contains(next) &&
              !next.closest('[role="dialog"], #mgmt-overlay-portal-host')
            )
              setControlsOpen(false);
          }}
          onClickCapture={(event) => {
            if (
              !(event.target instanceof Element) ||
              !event.currentTarget.contains(event.target)
            )
              return;
            const opener = event.target.closest<HTMLElement>("button, a");
            opener?.focus({ preventScroll: true });
            setControlsOpen(true);
          }}
        >
          <div
            className="mgmt-topbar__control-group mgmt-topbar__control-group--work"
            role="group"
            aria-label={he ? "ניווט וכלי עבודה" : "Navigation and work tools"}
          >
            <WorkspaceTools locale={locale} role={role} />
            <IconLink
              href={withLocale(locale, "store")}
              className="mgmt-topbar__storefront-link"
              label={mgmtShellCopy.storefrontLink[locale]}
              aria-label={mgmtShellCopy.storefrontLink[locale]}
            >
              <Store size={18} aria-hidden="true" />
            </IconLink>
          </div>
          <div
            className="mgmt-topbar__control-group mgmt-topbar__control-group--display"
            role="group"
            aria-label={he ? "תצוגה ותנועה" : "Display and motion"}
          >
            <WorkspaceDisplay locale={locale} />
            <NavigationThemeSelector
              locale={locale}
              label={he ? "בחירת ערכת נושא" : "Select theme"}
              management
            />
            <IconAction
              label={
                textPaused
                  ? he
                    ? "הפעלת תנועת טקסט"
                    : "Resume scrolling text"
                  : he
                    ? "עצירת תנועת טקסט"
                    : "Pause scrolling text"
              }
              aria-pressed={textPaused}
              onClick={() => {
                document.documentElement.dataset.textMotion = textPaused
                  ? "running"
                  : "paused";
                window.dispatchEvent(new Event("miro-text-motion"));
              }}
            >
              {textPaused ? (
                <Play size={18} aria-hidden="true" />
              ) : (
                <Pause size={18} aria-hidden="true" />
              )}
            </IconAction>
          </div>
          <div
            className="mgmt-topbar__control-group mgmt-topbar__control-group--identity"
            role="group"
            aria-label={he ? "שפה ותפקיד" : "Language and role"}
          >
            <button
              type="button"
              className="mgmt-topbar__lang-btn"
              onClick={handleLocaleChange}
              aria-label={he ? "Switch to English" : "מעבר לעברית"}
              title={he ? "Switch to English" : "מעבר לעברית"}
            >
              {he ? "EN" : "עב"}
            </button>
            <span
              className={`mgmt-role-badge mgmt-role-badge--${role}`}
              title={roleLabel(role, locale)}
            >
              {roleLabel(role, locale)}
            </span>
          </div>
        </div>
        <AccountMenu
          locale={locale}
          role={role}
          userName={userName}
          userEmail={userEmail}
        />
      </div>
    </header>
  );
}
