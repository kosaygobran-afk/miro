"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Moon, Shield, ShoppingCart, Sun, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { switchLocalePath, withLocale, type Locale } from "@/lib/i18n";

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

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const navLinks = [
    { href: withLocale(locale), label: labels.nav.home },
    { href: withLocale(locale, "services"), label: labels.nav.services },
    {
      href: withLocale(locale, "services/home"),
      label: labels.nav.homeServices,
    },
    {
      href: withLocale(locale, "services/business"),
      label: labels.nav.business,
    },
    { href: withLocale(locale, "products"), label: labels.nav.products },
    { href: withLocale(locale, "about"), label: labels.nav.about },
    { href: withLocale(locale, "contact"), label: labels.nav.contact },
  ];

  const productsCategories = [
    {
      key: "cameras",
      href: withLocale(locale, "products/cameras"),
      label: labels.products.cameras,
    },
    {
      key: "servers",
      href: withLocale(locale, "products/servers"),
      label: labels.products.servers,
    },
    {
      key: "routers",
      href: withLocale(locale, "products/routers"),
      label: labels.products.routers,
    },
    {
      key: "cables",
      href: withLocale(locale, "products/cables"),
      label: labels.products.cables,
    },
    {
      key: "accessories",
      href: withLocale(locale, "products/accessories"),
      label: labels.products.accessories,
    },
    {
      key: "networkGear",
      href: withLocale(locale, "products/network-gear"),
      label: labels.products.networkGear,
    },
  ];

  const languageTarget = locale === "he" ? "en" : "he";

  const toggleTheme = () => {
    const root = document.documentElement;
    const current = root.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      window.localStorage.setItem("miro-theme", next);
    } catch {
      // Theme switching still works when the browser blocks storage.
    }
  };

  const nav = (
    <nav
      className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-1"
      aria-label={labels.navLabel}
    >
      {navLinks.map((link) => {
        const active = pathname === link.href;

        // Products dropdown
        if (link.href === withLocale(locale, "products")) {
          return (
            <div
              key={link.href}
              className="relative"
              onMouseEnter={() => setProductsOpen(true)}
              onMouseLeave={() => setProductsOpen(false)}
            >
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                aria-haspopup="true"
                aria-expanded={productsOpen}
                onClick={() => setOpen(false)}
                className={[
                  "rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  active
                    ? "bg-surface-hover text-foreground shadow-[inset_0_-3px_0_var(--primary)]"
                    : "",
                ].join(" ")}
              >
                {link.label}
              </Link>

              {/* Products Dropdown Sub-navigation */}
              {productsOpen && (
                <div className="absolute top-full left-0 mt-1 min-w-[200px] rounded-2xl border border-border-subtle bg-background p-2 shadow-xl z-50 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                  <div className="flex flex-col gap-1">
                    {productsCategories.map((cat) => {
                      const catActive = pathname === cat.href;
                      return (
                        <Link
                          key={cat.key}
                          href={cat.href}
                          aria-current={catActive ? "page" : undefined}
                          onClick={() => setProductsOpen(false)}
                          className={[
                            "rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-all duration-200",
                            catActive
                              ? "bg-primary/10 text-primary font-black relative before:absolute before:bottom-0 before:left-1/2 before:w-full before:h-0.5 before:bg-primary before:-translate-x-1/2 before:animate-in before:grow-0 before:duration-300"
                              : "hover:bg-primary/5",
                          ].join(" ")}
                        >
                          {cat.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={[
              "rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              active
                ? "bg-surface-hover text-foreground shadow-[inset_0_-3px_0_var(--primary)]"
                : "",
            ].join(" ")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/92 backdrop-blur-xl">
      <div className="miro-container flex min-h-16 items-center justify-between gap-3 py-2">
        <Link
          href={withLocale(locale)}
          className="flex shrink-0 items-center gap-3"
          aria-label={labels.homeLabel}
        >
          <span className="grid size-11 place-items-center rounded border border-primary bg-primary">
            <Shield
              className="size-6 text-primary-foreground"
              aria-hidden="true"
            />
          </span>
          <span className="leading-none">
            <span className="block text-3xl font-black tracking-normal text-foreground">
              {labels.logo}
            </span>
            <span className="hidden text-[0.64rem] font-bold uppercase text-muted-foreground sm:block">
              {labels.tagline}
            </span>
          </span>
        </Link>

        <div className="hidden lg:block">{nav}</div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            className="miro-button miro-button-primary miro-desktop-action"
            href={withLocale(locale, "contact")}
          >
            {labels.actions.requestQuote}
          </Link>

          <Link
            href={withLocale(locale, "account")}
            className="miro-desktop-action size-11 place-items-center rounded-lg text-foreground hover:bg-surface-hover"
            aria-label={labels.actions.account}
          >
            <User className="size-5" aria-hidden="true" />
          </Link>

          <span
            className="miro-desktop-action relative size-11 place-items-center rounded-lg text-foreground"
            aria-hidden="true"
          >
            <ShoppingCart className="size-5" />
            <span className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
              0
            </span>
          </span>

          <button
            type="button"
            className="h-11 min-w-11 rounded-lg px-2 text-sm font-black text-foreground hover:bg-surface-hover"
            onClick={() =>
              router.push(switchLocalePath(pathname, languageTarget))
            }
          >
            {labels.actions.languageSwitch}
          </button>

          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-foreground hover:bg-surface-hover"
            onClick={toggleTheme}
            aria-label={labels.actions.themeToggle}
          >
            <Sun className="theme-icon-sun size-5" aria-hidden="true" />
            <Moon className="theme-icon-moon size-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="grid size-11 place-items-center rounded-lg text-foreground hover:bg-surface-hover lg:hidden"
            aria-label={
              open ? labels.actions.closeMenu : labels.actions.openMenu
            }
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X className="size-6" aria-hidden="true" />
            ) : (
              <Menu className="size-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-navigation"
          className="border-t border-border-subtle bg-background p-4 lg:hidden"
        >
          <div className="miro-container space-y-4">
            {nav}
            <Link
              className="miro-button miro-button-primary w-full"
              href={withLocale(locale, "contact")}
              onClick={() => setOpen(false)}
            >
              {labels.actions.requestQuote}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
