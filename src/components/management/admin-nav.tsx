"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { withLocale, type Locale } from "@/lib/i18n";
import type { AppRole } from "@/lib/roles";
import {
  matchMgmtNav,
  mgmtNavItemLabel,
  mgmtNavSectionLabel,
  mgmtNavSections,
  mgmtShellCopy,
} from "./shell/nav-config";

export type AdminNavProps = {
  locale: Locale;
  /** Role of the signed-in management user (drives CEO-only affordances). */
  role: AppRole;
  /** Icon-only presentation (collapsed sidebar). Default false. */
  collapsed?: boolean;
  /** Called after a navigation link is activated (drawer dismissal). */
  onNavigate?: () => void;
};

/**
 * Grouped management navigation used by the sidebar and the mobile drawer.
 * Semantic <nav> with links and aria-current="page" for the active entry
 * (page navigation, not tabs). CEO-only entries stay visible for Admin
 * users but carry a read-only badge and hint.
 */
export function AdminNav({
  locale,
  role,
  collapsed = false,
  onNavigate,
}: AdminNavProps) {
  const pathname = usePathname();
  const activeKey = matchMgmtNav(pathname ?? `/${locale}/admin`, locale).item
    .key;
  const isCeo = role === "ceo";

  return (
    <nav
      className={["mgmt-nav", collapsed ? "mgmt-nav--collapsed" : null]
        .filter(Boolean)
        .join(" ")}
      aria-label={mgmtShellCopy.navLabel[locale]}
    >
      {mgmtNavSections.map((section) => (
        <div className="mgmt-nav__section" key={section.key}>
          <p
            className="mgmt-nav__section-label"
            aria-hidden={collapsed || undefined}
          >
            {collapsed ? "" : mgmtNavSectionLabel(section.key, locale)}
          </p>
          <ul className="mgmt-nav__list">
            {section.items.map((item) => {
              const isActive = activeKey === item.key;
              const restricted = item.ceoOnly && !isCeo;
              const label = mgmtNavItemLabel(item.key, locale);
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={withLocale(locale, item.href)}
                    onClick={onNavigate}
                    className={[
                      "mgmt-nav__link",
                      isActive ? "mgmt-nav__link--active" : null,
                      restricted ? "mgmt-nav__link--restricted" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={
                      collapsed
                        ? restricted
                          ? `${label} · ${mgmtShellCopy.ceoOnlyBadge[locale]}`
                          : label
                        : restricted
                          ? mgmtShellCopy.ceoOnlyHint[locale]
                          : undefined
                    }
                  >
                    <Icon
                      size={18}
                      aria-hidden="true"
                      className="mgmt-nav__icon"
                    />
                    <span className="mgmt-nav__label">{label}</span>
                    {restricted ? (
                      <span
                        className="mgmt-nav__badge"
                        data-collapsed={collapsed || undefined}
                      >
                        <Lock
                          size={collapsed ? 12 : 11}
                          aria-hidden="true"
                          className="mgmt-nav__badge-icon"
                        />
                        {collapsed ? (
                          <span className="mgmt-visually-hidden">
                            {mgmtShellCopy.ceoOnlyBadge[locale]}
                          </span>
                        ) : (
                          <span className="mgmt-nav__badge-text">
                            {mgmtShellCopy.ceoOnlyBadge[locale]}
                          </span>
                        )}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
