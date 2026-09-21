"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  SunMoon,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { switchLocalePath, withLocale, type Locale } from "@/lib/i18n";
import { Brand } from "@/components/layout/brand";

export type HeaderLabels = {
  logo: string;
  tagline: string;
  homeLabel: string;
  navLabel: string;
  nav: {
    home: string;
    services: string;
    homeServices: string;
    business: string;
    products: string;
    about: string;
    contact: string;
  };
  actions: {
    requestQuote: string;
    account: string;
    languageSwitch: string;
    themeToggle: string;
    openMenu: string;
    closeMenu: string;
  };
  products: {
    cameras: string;
    servers: string;
    routers: string;
    cables: string;
    accessories: string;
    networkGear: string;
  };
};

type ThemeMode = "dark" | "medium" | "light";

function subscribeTheme(callback: () => void) {
  window.addEventListener("miro-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("miro-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}
function readTheme(): ThemeMode {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "medium" ? theme : "dark";
}
const serverTheme = (): ThemeMode => "dark";

export function HeaderClient({
  locale,
  labels,
}: {
  locale: Locale;
  labels: HeaderLabels;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const productsButton = useRef<HTMLButtonElement>(null);
  const productsMenu = useRef<HTMLDivElement>(null);
  const themeMode = useSyncExternalStore(
    subscribeTheme,
    readTheme,
    serverTheme,
  );
  const he = locale === "he";
  const Arrow = he ? ArrowLeft : ArrowRight;
  const productsHref = withLocale(locale, "store");
  const navLinks = [
    { href: withLocale(locale), label: labels.nav.home },
    { href: productsHref, label: labels.nav.products },
    { href: withLocale(locale, "services"), label: labels.nav.services },
    { href: withLocale(locale, "about"), label: labels.nav.about },
    { href: withLocale(locale, "contact"), label: labels.nav.contact },
  ];
  const categories = [
    ["cameras", labels.products.cameras],
    ["servers", labels.products.servers],
    ["routers", labels.products.routers],
    ["cables", labels.products.cables],
    ["accessories", labels.products.accessories],
    ["network-gear", labels.products.networkGear],
  ];
  const modes = [
    {
      value: "dark" as const,
      icon: Moon,
      label: he ? "מצב כהה" : "Dark theme",
    },
    {
      value: "medium" as const,
      icon: SunMoon,
      label: he ? "מצב אפור" : "Medium theme",
    },
    {
      value: "light" as const,
      icon: Sun,
      label: he ? "מצב בהיר" : "Light theme",
    },
  ];

  useEffect(() => {
    if (!open && !productsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (productsOpen) {
        setProductsOpen(false);
        productsButton.current?.focus();
      } else {
        setOpen(false);
        menuButton.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (productsOpen && !productsMenu.current?.contains(event.target as Node))
        setProductsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, productsOpen]);

  function chooseTheme(theme: ThemeMode) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("miro-theme", theme);
    } catch {
      /* Works without browser storage. */
    }
    window.dispatchEvent(new Event("miro-theme-change"));
  }
  function closeNavigation() {
    setOpen(false);
    setProductsOpen(false);
  }
  function searchForm(className: string) {
    return (
      <form
        action={`${productsHref}#store-items`}
        method="get"
        role="search"
        className={className}
        onSubmit={closeNavigation}
      >
        <input
          name="q"
          type="search"
          maxLength={120}
          aria-label={he ? "חיפוש בחנות" : "Search the store"}
          placeholder={he ? "מה תרצו למצוא?" : "Find your security solution"}
        />
        <button type="submit" aria-label={he ? "חיפוש" : "Search"}>
          <Search size={18} aria-hidden="true" />
        </button>
      </form>
    );
  }
  function navLinksView(mobile = false) {
    return navLinks.map((link) => {
      const exact = pathname === link.href;
      const active =
        exact ||
        (link.href !== withLocale(locale) &&
          pathname.startsWith(`${link.href}/`));
      const linkElement = (
        <Link
          href={link.href}
          aria-current={exact ? "page" : active ? "location" : undefined}
          onClick={closeNavigation}
          className={`premium-nav-link ${active ? "is-active" : ""}`}
        >
          {link.label}
        </Link>
      );
      if (link.href !== productsHref || mobile)
        return <div key={link.href}>{linkElement}</div>;
      return (
        <div
          className="premium-nav-disclosure"
          key={link.href}
          ref={productsMenu}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setProductsOpen(false);
          }}
        >
          {linkElement}
          <button
            ref={productsButton}
            className="premium-disclosure-button"
            type="button"
            aria-label={he ? "קטגוריות החנות" : "Store categories"}
            aria-expanded={productsOpen}
            aria-controls="store-navigation"
            onClick={() => setProductsOpen(!productsOpen)}
          >
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {productsOpen && (
            <div id="store-navigation" className="premium-dropdown">
              <p>{he ? "לכל צורך, הפתרון שלו" : "Find the right fit"}</p>
              {categories.map(([key, label]) => (
                <Link
                  key={key}
                  href={withLocale(locale, `store/${key}`)}
                  onClick={closeNavigation}
                >
                  {label}
                  <Arrow size={15} aria-hidden="true" />
                </Link>
              ))}
              <Link
                href={productsHref}
                onClick={closeNavigation}
                className="premium-dropdown-all"
              >
                {he ? "לכל המוצרים" : "Explore the store"}
                <Arrow size={15} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <>
      <div className="premium-topbar">
        <div className="miro-container premium-topbar-inner">
          <span>
            <ShieldCheck size={13} aria-hidden="true" />
            {he
              ? "טכנולוגיה חכמה. שקט ביום־יום."
              : "Smarter technology. Everyday peace of mind."}
          </span>
          <span className="premium-topbar-motto" dir="ltr">
            SECURE. SMART. CONNECTED.
          </span>
          <Link href={withLocale(locale, "services/business")}>
            {he ? "פתרון שמתאים לעסק שלכם" : "Security that fits your business"}
            <Arrow size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <header className="miro-site-header premium-header">
        <div className="miro-container premium-header-inner">
          <Link
            href={withLocale(locale)}
            className="premium-logo-link"
            aria-label={labels.homeLabel}
            onClick={closeNavigation}
          >
            <Brand locale={locale} />
          </Link>
          <nav className="premium-desktop-nav" aria-label={labels.navLabel}>
            {navLinksView()}
          </nav>
          {searchForm("premium-header-search")}
          <div className="premium-header-actions">
            <Link
              href={withLocale(locale, "contact")}
              className="miro-button miro-button-primary premium-quote-action"
            >
              {labels.actions.requestQuote}
              <Arrow size={16} aria-hidden="true" />
            </Link>
            <Link
              href={withLocale(locale, "account")}
              className="premium-account-action premium-icon-button"
              aria-label={labels.actions.account}
            >
              <UserRound size={20} aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="premium-language premium-icon-button"
              onClick={() => {
                closeNavigation();
                router.push(
                  `${switchLocalePath(pathname, he ? "en" : "he")}${window.location.search}${window.location.hash}`,
                );
              }}
              aria-label={he ? "Switch to English" : "מעבר לעברית"}
            >
              {he ? "EN" : "עב"}
            </button>
            <div
              className="premium-theme-selector"
              role="group"
              aria-label={labels.actions.themeToggle}
              dir="ltr"
            >
              {modes.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  data-theme-option={value}
                  aria-label={label}
                  title={label}
                  aria-pressed={themeMode === value}
                  onClick={() => chooseTheme(value)}
                >
                  <Icon size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button
              ref={menuButton}
              type="button"
              className="premium-mobile-toggle premium-icon-button"
              aria-label={
                open ? labels.actions.closeMenu : labels.actions.openMenu
              }
              aria-expanded={open}
              aria-controls="mobile-navigation"
              onClick={() => setOpen(!open)}
            >
              {open ? (
                <X size={22} aria-hidden="true" />
              ) : (
                <Menu size={22} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {open && (
          <div id="mobile-navigation" className="premium-mobile-navigation">
            <div className="miro-container">
              {searchForm("premium-mobile-search")}
              <nav aria-label={labels.navLabel}>{navLinksView(true)}</nav>
              <div className="premium-mobile-shortcuts">
                <Link
                  href={withLocale(locale, "services/home")}
                  onClick={closeNavigation}
                >
                  {labels.nav.homeServices}
                  <Arrow size={16} aria-hidden="true" />
                </Link>
                <Link
                  href={withLocale(locale, "services/business")}
                  onClick={closeNavigation}
                >
                  {labels.nav.business}
                  <Arrow size={16} aria-hidden="true" />
                </Link>
                <Link
                  href={withLocale(locale, "account")}
                  onClick={closeNavigation}
                >
                  {labels.actions.account}
                  <UserRound size={16} aria-hidden="true" />
                </Link>
              </div>
              <Link
                href={withLocale(locale, "contact")}
                className="miro-button miro-button-primary"
                onClick={closeNavigation}
              >
                {labels.actions.requestQuote}
                <Check size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
