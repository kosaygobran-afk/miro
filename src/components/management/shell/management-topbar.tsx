"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Store } from "lucide-react";
import { roleLabel, type AppRole } from "@/lib/roles";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  matchMgmtNav,
  mgmtNavItemLabel,
  mgmtNavItemSubtitle,
  mgmtNavSectionLabel,
  mgmtShellCopy,
} from "./nav-config";
import { AccountMenu } from "./account-menu";

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
 * the end side. Title/crumb resolve from the shared nav model.
 */
export function ManagementTopbar({
  locale,
  role,
  userName,
  userEmail,
  onOpenNav,
}: ManagementTopbarProps) {
  const pathname = usePathname();
  const { section, item } = matchMgmtNav(
    pathname ?? `/${locale}/admin`,
    locale,
  );
  const isOverview = item.key === "overview";
  const restricted = item.ceoOnly && role !== "ceo";

  return (
    <header className="mgmt-topbar">
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
            <h1 className="mgmt-topbar__title">
              {mgmtNavItemLabel(item.key, locale)}
            </h1>
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
