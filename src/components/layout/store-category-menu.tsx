import { LayoutGrid, ArrowLeft, ArrowRight } from "lucide-react";
import Link from "@/components/motion/motion-link";
import { withLocale, type Locale } from "@/lib/i18n";

/** Root-category navigation uses only the existing public navigation projection. */
export function StoreCategoryMenu({
  locale,
  categories,
  pathname,
  onNavigate,
}: {
  locale: Locale;
  categories: Array<{ key: string; label: string }>;
  pathname: string;
  onNavigate: () => void;
}) {
  const he = locale === "he";
  const Arrow = he ? ArrowLeft : ArrowRight;

  return (
    <>
      <div className="premium-category-menu__heading">
        <LayoutGrid
          className="premium-category-menu__emblem"
          size={21}
          aria-hidden="true"
        />
        <h2>{he ? "בוחרים קטגוריה" : "Shop by category"}</h2>
        <span className="premium-category-menu__count">
          {categories.length} {he ? "קטגוריות" : "categories"}
        </span>
      </div>
      {categories.length > 0 ? (
        <ul
          className="premium-category-menu__list"
          role="list"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const links = Array.from(event.currentTarget.querySelectorAll("a"));
            const current = links.indexOf(
              document.activeElement as HTMLAnchorElement,
            );
            if (current < 0) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? links.length - 1
                  : (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      links.length) %
                    links.length;
            links[next]?.focus();
          }}
        >
          {categories.map(({ key, label }) => {
            const href = withLocale(locale, `store/${key}`);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={key}>
                <Link
                  href={href}
                  prefetch={false}
                  onClick={onNavigate}
                  className="premium-category-menu__link"
                  aria-current={
                    pathname === href ? "page" : active ? "location" : undefined
                  }
                >
                  <span className="premium-category-menu__label">{label}</span>
                  <Arrow
                    className="premium-category-menu__arrow"
                    size={17}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="premium-category-menu__empty">
          {he
            ? "אין קטגוריות להצגה כרגע."
            : "No categories to display right now."}
        </p>
      )}
      <div className="premium-category-menu__footer">
        <Link
          href={withLocale(locale)}
          onClick={onNavigate}
          className="premium-dropdown-all"
        >
          <span>{he ? "לכל המוצרים" : "Explore the store"}</span>
          <Arrow size={17} aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
