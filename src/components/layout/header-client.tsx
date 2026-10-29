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
  Store,
  Wrench,
  House,
  Info,
  Phone,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withLocale, type Locale } from "@/lib/i18n";
import { switchNavigationLocale } from "./switch-navigation-locale";
import { Brand } from "@/components/layout/brand";
import { StoreCategoryMenu } from "@/components/layout/store-category-menu";
import { AccountMenu } from "@/components/layout/account-menu";
import { NavigationThemeSelector } from "./navigation-theme-selector";
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

import { useAnimationSettings } from "@/components/motion/animation-provider";

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
  const he = locale === "he";
  const Arrow = he ? ArrowLeft : ArrowRight;
  const productsHref = withLocale(locale);
  const navLinks = [
    { href: productsHref, label: labels.nav.products, icon: Store },
    {
      href: withLocale(locale, "services"),
      label: labels.nav.services,
      icon: Wrench,
    },
    { href: withLocale(locale, "home"), label: labels.nav.home, icon: House },
    { href: withLocale(locale, "about"), label: labels.nav.about, icon: Info },
    {
      href: withLocale(locale, "contact"),
      label: labels.nav.contact,
      icon: Phone,
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

  // Height coordinates sticky content; viewport bottom coordinates the beam.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bounds = header.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--header-sticky-offset",
        `${bounds.height}px`,
      );
      document.documentElement.style.setProperty(
        "--navigation-header-edge",
        `${Math.max(0, bounds.bottom)}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(header);
    if (header.previousElementSibling)
      observer.observe(header.previousElementSibling);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      document.documentElement.style.removeProperty("--header-sticky-offset");
      document.documentElement.style.removeProperty("--navigation-header-edge");
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
      const target = event.target as Node;
      if (productsOpen && !productsMenu.current?.contains(target))
        setProductsOpen(false);
      if (
        open &&
        !mobileNavigationRef.current?.contains(target) &&
        !headerRef.current?.contains(target) &&
        !(
          event.target instanceof Element &&
          event.target.closest(".premium-account-dropdown")
        )
      )
        setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, productsOpen]);

  // A desktop dropdown must not retain hidden focus after the hamburger breakpoint.
  useEffect(() => {
    if (!productsOpen) return;
    const compact = window.matchMedia("(max-width: 1199px)");
    const collapse = () => {
      if (!compact.matches) return;
      setProductsOpen(false);
      menuButton.current?.focus({ preventScroll: true });
    };
    compact.addEventListener("change", collapse);
    return () => compact.removeEventListener("change", collapse);
  }, [productsOpen]);

  useEffect(() => {
    if (!open && !productsOpen) return;
    const desktop = window.matchMedia("(min-width: 1200px)");
    const collapse = () => {
      if (!desktop.matches) return;
      const focusWasInside = mobileNavigationRef.current?.contains(
        document.activeElement,
      );
      setOpen(false);
      if (focusWasInside)
        headerRef.current
          ?.querySelector<HTMLElement>(".premium-desktop-nav .premium-nav-link")
          ?.focus({ preventScroll: true });
    };
    const leave = () => {
      setOpen(false);
      setProductsOpen(false);
    };
    desktop.addEventListener("change", collapse);
    window.addEventListener("popstate", leave);
    return () => {
      desktop.removeEventListener("change", collapse);
      window.removeEventListener("popstate", leave);
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
      const Icon = link.icon;
      const linkElement = (
        <Link
          href={link.href}
          aria-current={exact ? "page" : active ? "location" : undefined}
          onClick={closeNavigation}
          className={`premium-nav-link ${active ? "is-active" : ""}`}
        >
          {animationSettings.appearanceVersion === "2" && (
            <Icon className="premium-nav-icon" size={17} aria-hidden="true" />
          )}
          <span>{link.label}</span>
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
            onClick={() => setProductsOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              setProductsOpen(true);
              requestAnimationFrame(() =>
                productsMenu.current
                  ?.querySelector<HTMLElement>("#store-navigation a")
                  ?.focus(),
              );
            }}
          >
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {productsOpen && (
            <div
              id="store-navigation"
              className={`premium-dropdown${animationSettings.appearanceVersion === "2" ? " premium-category-menu" : ""}`}
            >
              {animationSettings.appearanceVersion === "2" ? (
                <StoreCategoryMenu
                  locale={locale}
                  categories={categories}
                  pathname={pathname}
                  onNavigate={closeNavigation}
                />
              ) : (
                <>
                  <p>{he ? "לכל צורך, הפתרון שלו" : "Find the right fit"}</p>
                  {categories.map(({ key, label }) => (
                    <Link
                      key={key}
                      href={withLocale(locale, `store/${key}`)}
                      prefetch={false}
                      onClick={closeNavigation}
                      className="miro-centered-control"
                    >
                      <span className="miro-control-label">{label}</span>
                      <Arrow
                        className="miro-control-end"
                        size={15}
                        aria-hidden="true"
                      />
                    </Link>
                  ))}
                  <Link
                    href={productsHref}
                    onClick={closeNavigation}
                    className="premium-dropdown-all miro-centered-control"
                  >
                    <span className="miro-control-label">
                      {he ? "לכל המוצרים" : "Explore the store"}
                    </span>
                    <Arrow
                      className="miro-control-end"
                      size={15}
                      aria-hidden="true"
                    />
                  </Link>
                </>
              )}
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
            <div className="premium-header-action-group premium-header-action-group--shopping">
              <HeaderCartLink locale={locale} />
              <Link
                href={withLocale(locale, "contact")}
                className="miro-button miro-button-primary premium-quote-action"
              >
                {labels.actions.requestQuote}
                <Arrow size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="premium-header-action-group premium-header-action-group--personal">
              <AccountMenu
                locale={locale}
                onNavigate={closeNavigation}
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
                  switchNavigationLocale(pathname, he ? "en" : "he", router);
                }}
                aria-label={he ? "Switch to English" : "מעבר לעברית"}
                title={he ? "Switch to English" : "מעבר לעברית"}
              >
                {he ? "EN" : "עב"}
              </button>
              <NavigationThemeSelector
                locale={locale}
                label={labels.actions.themeToggle}
              />
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
              onClick={() => setOpen((current) => !current)}
              onKeyDown={(event) => {
                if (
                  !open ||
                  !["ArrowDown", "Tab"].includes(event.key) ||
                  event.shiftKey
                )
                  return;
                event.preventDefault();
                mobileNavigationRef.current
                  ?.querySelector<HTMLElement>("input, a, button")
                  ?.focus();
              }}
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
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const controls =
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    "input, a[href], button",
                  );
                if (event.shiftKey && document.activeElement === controls[0]) {
                  event.preventDefault();
                  menuButton.current?.focus();
                } else if (
                  !event.shiftKey &&
                  document.activeElement === controls[controls.length - 1]
                ) {
                  event.preventDefault();
                  setOpen(false);
                  document
                    .getElementById("main-content")
                    ?.focus({ preventScroll: true });
                }
              }}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (
                  next instanceof Element &&
                  !event.currentTarget.contains(next) &&
                  !headerRef.current?.contains(next) &&
                  !next.closest(".premium-account-dropdown")
                )
                  setOpen(false);
              }}
            >
              <div className="miro-container">
                {searchForm("premium-mobile-search")}
                <nav aria-label={labels.navLabel}>{navLinksView(true)}</nav>
                <div className="premium-mobile-shortcuts">
                  <Link
                    href={withLocale(locale, "services/home")}
                    onClick={closeNavigation}
                    className="miro-centered-control"
                  >
                    <span className="miro-control-label">
                      {labels.nav.homeServices}
                    </span>
                    <Arrow
                      className="miro-control-end"
                      size={16}
                      aria-hidden="true"
                    />
                  </Link>
                  <Link
                    href={withLocale(locale, "services/business")}
                    onClick={closeNavigation}
                    className="miro-centered-control"
                  >
                    <span className="miro-control-label">
                      {labels.nav.business}
                    </span>
                    <Arrow
                      className="miro-control-end"
                      size={16}
                      aria-hidden="true"
                    />
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
