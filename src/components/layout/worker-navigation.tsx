"use client";

import { ClipboardList, Store, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { useRouter } from "@/components/motion/use-motion-router";
import Link from "@/components/motion/motion-link";
import { withLocale, type Locale } from "@/lib/i18n";
import { switchNavigationLocale } from "./switch-navigation-locale";
import { NavigationThemeSelector } from "./navigation-theme-selector";
import { AccountMenu } from "./account-menu";
import type { HeaderLabels } from "./header-client";
import styles from "./worker-navigation.module.css";

export function WorkerNavigation({
  locale,
  labels,
}: {
  locale: Locale;
  labels: HeaderLabels["actions"];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--navigation-header-edge",
        `${Math.max(0, header.getBoundingClientRect().bottom)}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
      document.documentElement.style.removeProperty("--navigation-header-edge");
    };
  }, []);
  const he = locale === "he";
  const links = [
    {
      href: withLocale(locale, "worker"),
      label: he ? "המשימות שלי" : "My tasks",
      icon: ClipboardList,
    },
    {
      href: withLocale(locale, "account"),
      label: labels.myAccount,
      icon: UserRound,
    },
    {
      href: withLocale(locale),
      label: he ? "החנות" : "Storefront",
      icon: Store,
    },
  ];
  return (
    <header
      ref={headerRef}
      className={styles.header}
      data-worker-navigation="true"
    >
      <div className={`miro-container ${styles.inner}`}>
        <Link
          href={withLocale(locale, "worker")}
          className={styles.brand}
          aria-label={labels.workerArea}
        >
          <ClipboardList size={21} aria-hidden="true" />
          <span>
            MIRO <small>{labels.workerArea}</small>
          </span>
        </Link>
        <nav
          className={styles.links}
          aria-label={he ? "ניווט סביבת העובד" : "Worker navigation"}
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.preferences}>
          <button
            type="button"
            className={styles.language}
            onClick={() =>
              switchNavigationLocale(pathname, he ? "en" : "he", router)
            }
            lang={he ? "en" : "he"}
            aria-label={he ? "Switch to English" : "מעבר לעברית"}
            title={he ? "Switch to English" : "מעבר לעברית"}
          >
            {he ? "EN" : "עב"}
          </button>
          <NavigationThemeSelector locale={locale} label={labels.themeToggle} />
          <AccountMenu locale={locale} labels={labels} compact />
        </div>
      </div>
    </header>
  );
}
