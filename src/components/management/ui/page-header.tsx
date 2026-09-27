import type { ReactNode } from "react";

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
}: PageHeaderProps) {
  return (
    <header
      className={["mgmt-page-header", className].filter(Boolean).join(" ")}
    >
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav className="mgmt-page-header__breadcrumb" aria-label="Breadcrumb">
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
          <h1 className="mgmt-page-header__title">{title}</h1>
          {subtitle ? (
            <p className="mgmt-page-header__subtitle">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="mgmt-page-header__actions">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
