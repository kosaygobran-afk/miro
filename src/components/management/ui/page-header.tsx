"use client";

import type { ReactNode } from "react";
import Link from "@/components/motion/motion-link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { roleLabel } from "@/lib/roles";
import { useWorkspace } from "../shell/workspace-context";
import {
  matchMgmtNav,
  mgmtNavItems,
  mgmtNavItemLabel,
  mgmtNavSectionLabel,
  type MgmtNavItemKey,
} from "../shell/nav-config";
import { OverflowText } from "./overflow-text";
import styles from "./reporting-workspace.module.css";

export type PageHeaderProps = {
  /** Page-level title, rendered as an <h1>. */
  title: ReactNode;
  /** Short supporting line under the title. */
  subtitle?: ReactNode;
  /** Optional breadcrumb trail rendered above the title. */
  breadcrumb?: { label: ReactNode; href?: string }[];
  /** Trailing actions slot (buttons, links, dropdowns). */
  actions?: ReactNode;
  className?: string;
  variant?: "workspace" | "plain";
  headingLevel?: 1 | 2;
};

/**
 * Consistent header row for management pages: breadcrumb, title, subtitle
 * and an actions slot. Locale direction is inherited from the shell.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  className,
  variant = "workspace",
  headingLevel = 1,
}: PageHeaderProps) {
  const workspace = useWorkspace();
  const pathname = usePathname() ?? "/he/admin";
  const locale =
    workspace?.locale ?? (pathname.startsWith("/en") ? "en" : "he");
  const he = locale === "he";
  const { item, section } = matchMgmtNav(pathname, locale);
  const Icon = item.icon;
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const related: Partial<Record<MgmtNavItemKey, MgmtNavItemKey[]>> = {
    overview: ["requests", "products", "inventory", "finance"],
    products: [
      "products",
      "categories",
      "inventory",
      "storefrontMerchandising",
    ],
    categories: ["categories", "products", "storefrontMerchandising"],
    services: ["services", "requests"],
    inventory: ["inventory", "suppliers", "products", "sales"],
    suppliers: ["suppliers", "inventory", "sales"],
    sales: ["sales", "customers", "finance"],
    customers: ["customers", "requests", "sales"],
    users: ["users", "audit", "settings"],
    audit: ["audit", "users", "settings"],
    settings: ["settings", "users", "audit"],
    storeDesign: ["storeDesign", "storefrontMerchandising", "products"],
    storefrontMerchandising: [
      "storeDesign",
      "storefrontMerchandising",
      "products",
      "categories",
    ],
  };
  return (
    <header
      className={[
        "mgmt-page-header",
        variant === "workspace" ? `${styles.hero} mgmt-workspace-header` : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {variant === "workspace" ? (
        <div className="mgmt-workspace-header__eyebrow">
          <span className="mgmt-workspace-header__icon">
            <Icon size={21} aria-hidden="true" />
          </span>
          <span className="mgmt-workspace-header__identity">
            <span>MIRO / {mgmtNavSectionLabel(section.key, locale)}</span>
            <span>
              {workspace
                ? roleLabel(workspace.role, locale)
                : he
                  ? "ניהול העסק"
                  : "Business workspace"}
            </span>
          </span>
          <ShieldCheck size={16} aria-hidden="true" />
        </div>
      ) : null}
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav
          className="mgmt-page-header__breadcrumb"
          aria-label={he ? "פירורי לחם" : "Breadcrumb"}
        >
          <ol className="mgmt-page-header__breadcrumb-list">
            {breadcrumb.map((crumb, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <li
                  key={index}
                  className="mgmt-page-header__breadcrumb-item"
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.href && !isLast ? (
                    <a
                      className="mgmt-page-header__breadcrumb-link"
                      href={crumb.href}
                    >
                      {crumb.label}
                    </a>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                  {!isLast ? (
                    <span
                      className="mgmt-page-header__breadcrumb-separator"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className="mgmt-page-header__row">
        <div className="mgmt-page-header__text">
          <Heading className="mgmt-page-header__title">
            {typeof title === "string" ? <OverflowText text={title} /> : title}
          </Heading>
          {subtitle ? (
            <p className="mgmt-page-header__subtitle">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="mgmt-page-header__actions">{actions}</div>
        ) : null}
      </div>
      {variant === "workspace" ? (
        <nav
          className={styles.connections}
          aria-label={he ? "אזורי עבודה קשורים" : "Related workspaces"}
        >
          {(related[item.key] ?? [item.key]).map((key) => {
            const target = mgmtNavItems.find((entry) => entry.key === key);
            return target ? (
              <Link
                key={key}
                href={`/${locale}${target.href}`}
                className={styles.connection}
                aria-current={key === item.key ? "page" : undefined}
              >
                <OverflowText
                  text={mgmtNavItemLabel(key, locale)}
                  focusable={false}
                />
              </Link>
            ) : null;
          })}
          <Link
            href={`/${locale}/${item.key === "services" ? "services" : "store"}`}
            className={styles.connection}
          >
            <OverflowText
              text={he ? "באתר" : "View website"}
              focusable={false}
            />
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
