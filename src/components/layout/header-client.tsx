"use client";

import Link from "@/components/motion/motion-link";
import { usePathname } from "next/navigation";
import { useRouter } from "@/components/motion/use-motion-router";
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
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { switchLocalePath, withLocale, type Locale } from "@/lib/i18n";
import { Brand } from "@/components/layout/brand";
import { AccountMenu } from "@/components/layout/account-menu";
import { HeaderCartLink } from "@/features/cart/header-cart-link";

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
    logout: string;
    switchToStorefront: string;
    manageAccount: string;
    workerArea: string;
    adminConsole: string;
    myAccount: string;
    userMenu: string;
    roleBadge: string;
  };
};

import {
  transitionTheme,
  type ThemeMode,
} from "@/components/motion/theme-transition";
import { useAnimationSettings } from "@/components/motion/animation-provider";

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

export function HeaderClient({
  locale,
  labels,
  categories,
}: {
  locale: Locale;
  labels: HeaderLabels;
  categories: Array<{ key: string; label: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const animationSettings = useAnimationSettings();
  const [open, setOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const productsButton = useRef<HTMLButtonElement>(null);
  const productsMenu = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const mobileNavigationRef = useRef<HTMLDivElement>(null);
  const themeMode = useSyncExternalStore(
    subscribeTheme,
    readTheme,
    serverTheme,
  );
  const he = locale === "he";
  const Arrow = he ? ArrowLeft : ArrowRight;
  const productsHref = withLocale(locale);
  const navLinks = [
    { href: productsHref, label: labels.nav.products },
    { href: withLocale(locale, "services"), label: labels.nav.services },
    { href: withLocale(locale, "home"), label: labels.nav.home },
    { href: withLocale(locale, "about"), label: labels.nav.about },
    { href: withLocale(locale, "contact"), label: labels.nav.contact },
  ];
  const modes = [
    {
      value: "dark" as const,
      icon: Moon,
      label: he ? "מצב כהה — ניגודיות גבוהה" : "Dark theme — high contrast",
    },
    {
      value: "medium" as const,
      icon: SunMoon,
      label: he ? "מצב ביניים" : "Mid theme",
    },
    {
      value: "light" as const,
      icon: Sun,
      label: he ? "מצב בהיר" : "Light theme",
    },
  ];

  // The floating panel scrolls with the document, outside the sticky header.
  // It never creates a second scroll container or expands the header offset.
  useLayoutEffect(() => {
    if (!open) return;
    const header = headerRef.current;
    const panel = mobileNavigationRef.current;
    if (!header || !panel) return;
    const place = () => {
      panel.style.top = `${header.getBoundingClientRect().bottom + window.scrollY}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(header);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Measure header height for sticky coordination
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use borderBoxSize.blockSize if available (Chrome 84+), fallback to contentRect.height
        const height =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        document.documentElement.style.setProperty(
          "--header-sticky-offset",
          `${height}px`,
        );
      }
    });

    resizeObserver.observe(element, { box: "border-box" });
    // Set initial height using border-box
    document.documentElement.style.setProperty(
      "--header-sticky-offset",
      `${element.getBoundingClientRect().height}px`,
    );

    return () => {
      resizeObserver.unobserve(element);
      document.documentElement.style.removeProperty("--header-sticky-offset");
    };
  }, []);

  useEffect(() => {
    if (!open && !productsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Escape dismisses the top account popup before its parent navigation.
      if (document.querySelector(".premium-account-dropdown")) return;
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
        (link.href === productsHref
          ? pathname.startsWith(`${productsHref}/store/`)
          : pathname.startsWith(`${link.href}/`));
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
              {categories.map(({ key, label }) => (
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
      <div
        className="premium-topbar"
        role="region"
        aria-label={he ? "הודעות החנות" : "Store announcements"}
        suppressHydrationWarning
      >
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
      <header
        ref={headerRef}
        className="miro-site-header premium-header"
        suppressHydrationWarning
      >
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
            <HeaderCartLink locale={locale} />
            <Link
              href={withLocale(locale, "contact")}
              className="miro-button miro-button-primary premium-quote-action"
            >
              {labels.actions.requestQuote}
              <Arrow size={16} aria-hidden="true" />
            </Link>
            <AccountMenu
              locale={locale}
              labels={{
                account: labels.actions.account,
                logout: labels.actions.logout,
                switchToStorefront: labels.actions.switchToStorefront,
                manageAccount: labels.actions.manageAccount,
                workerArea: labels.actions.workerArea,
                adminConsole: labels.actions.adminConsole,
                myAccount: labels.actions.myAccount,
                userMenu: labels.actions.userMenu,
                roleBadge: labels.actions.roleBadge,
              }}
              compact
            />
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
              suppressHydrationWarning
            >
              {modes.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  data-theme-option={value}
                  aria-label={label}
                  title={label}
                  aria-pressed={themeMode === value}
                  onClick={(event) =>
                    transitionTheme(
                      value,
                      event.currentTarget,
                      animationSettings,
                    )
                  }
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
        {open &&
          createPortal(
            <div
              id="mobile-navigation"
              ref={mobileNavigationRef}
              className="premium-mobile-navigation"
              suppressHydrationWarning
            >
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
                  <AccountMenu
                    locale={locale}
                    labels={{
                      account: labels.actions.account,
                      logout: labels.actions.logout,
                      switchToStorefront: labels.actions.switchToStorefront,
                      manageAccount: labels.actions.manageAccount,
                      workerArea: labels.actions.workerArea,
                      adminConsole: labels.actions.adminConsole,
                      myAccount: labels.actions.myAccount,
                      userMenu: labels.actions.userMenu,
                      roleBadge: labels.actions.roleBadge,
                    }}
                    onNavigate={closeNavigation}
                  />
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
            </div>,
            document.body,
          )}
      </header>
    </>
  );
}
