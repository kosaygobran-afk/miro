"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Sun, SunMoon, Store } from "lucide-react";
import { roleLabel, type AppRole } from "@/lib/roles";
import { switchLocalePath, withLocale, type Locale } from "@/lib/i18n";
import {
  matchMgmtNav,
  mgmtNavItemLabel,
  mgmtNavItemSubtitle,
  mgmtNavSectionLabel,
  mgmtShellCopy,
} from "./nav-config";
import { AccountMenu } from "./account-menu";

type ThemeMode = "dark" | "medium" | "light";

function subscribeTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("miro-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("miro-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}
function readTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "medium" ? theme : "dark";
}
const serverTheme = (): ThemeMode => "dark";

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
  const { section, item } = matchMgmtNav(
    pathname ?? `/${locale}/admin`,
    locale,
  );
  const isOverview = item.key === "overview";
  const restricted = item.ceoOnly && role !== "ceo";

  const he = locale === "he";
  const themeMode = useSyncExternalStore(
    subscribeTheme,
    readTheme,
    serverTheme,
  );

  // Measure topbar height for sticky coordination (border-box)
  useEffect(() => {
    const element = topbarRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize.blockSize if available (Chrome 84+), fallback to contentRect.height
        const height =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        document.documentElement.style.setProperty(
          "--mgmt-topbar-height",
          `${height}px`,
        );
      }
    });

    resizeObserver.observe(element, { box: "border-box" });
    // Set initial height using border-box
    document.documentElement.style.setProperty(
      "--mgmt-topbar-height",
      `${element.getBoundingClientRect().height}px`,
    );

    return () => {
      resizeObserver.unobserve(element);
      document.documentElement.style.removeProperty("--mgmt-topbar-height");
    };
  }, []);

  function chooseTheme(theme: ThemeMode) {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("miro-theme", theme);
      }
    } catch {
      /* Works without browser storage. */
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("miro-theme-change"));
    }
  }

  function handleLocaleChange() {
    const newLocale = locale === "he" ? "en" : "he";
    router.push(
      `${switchLocalePath(pathname, newLocale)}${window.location.search}${window.location.hash}`,
    );
  }

  const themeLabels = {
    dark: he ? "מצב כהה — ניגודיות גבוהה" : "Dark theme — high contrast",
    medium: he ? "מצב ביניים" : "Mid theme",
    light: he ? "מצב בהיר" : "Light theme",
  };

  return (
    <header ref={topbarRef} className="mgmt-topbar">
      <div className="mgmt-topbar__start">
        <button
          type="button"
          className="mgmt-topbar__menu-button"
          onClick={onOpenNav}
          aria-label={mgmtShellCopy.openNavigation[locale]}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="mgmt-topbar__text">
          <nav
            className="mgmt-topbar__breadcrumb"
            aria-label={locale === "he" ? "פירורי לחם" : "Breadcrumb"}
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
      <div className="mgmt-topbar__end">
        <Link
          href={withLocale(locale)}
          className="mgmt-topbar__storefront-link"
        >
          <Store size={16} aria-hidden="true" />
          <span className="mgmt-topbar__storefront-text">
            {mgmtShellCopy.storefrontLink[locale]}
          </span>
        </Link>
        <div
          className="mgmt-topbar__theme-selector"
          role="group"
          aria-label={he ? "בחירת ערכת נושא" : "Select theme"}
        >
          <button
            type="button"
            className="mgmt-topbar__theme-btn"
            data-theme-option="dark"
            aria-label={themeLabels.dark}
            aria-pressed={themeMode === "dark"}
            onClick={() => chooseTheme("dark")}
          >
            <Moon size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mgmt-topbar__theme-btn"
            data-theme-option="medium"
            aria-label={themeLabels.medium}
            aria-pressed={themeMode === "medium"}
            onClick={() => chooseTheme("medium")}
          >
            <SunMoon size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mgmt-topbar__theme-btn"
            data-theme-option="light"
            aria-label={themeLabels.light}
            aria-pressed={themeMode === "light"}
            onClick={() => chooseTheme("light")}
          >
            <Sun size={16} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="mgmt-topbar__lang-btn"
          onClick={handleLocaleChange}
          aria-label={he ? "Switch to English" : "מעבר לעברית"}
        >
          {he ? "EN" : "עב"}
        </button>
        <span
          className={`mgmt-role-badge mgmt-role-badge--${role}`}
          title={roleLabel(role, locale)}
        >
          {roleLabel(role, locale)}
        </span>
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
