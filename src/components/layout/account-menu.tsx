"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { withLocale, type Locale } from "@/lib/i18n";
import { roleLabel, type AppRole } from "@/lib/roles";

type SessionData = {
  authenticated: boolean;
  role: AppRole | null;
  name: string | null;
};

type AccountMenuLabels = {
  account: string;
  logout: string;
  switchToStorefront: string;
  manageAccount: string;
  workerArea: string;
  adminConsole: string;
  myAccount: string;
  userMenu: string;
  roleBadge: string;
};

export function AccountMenu({
  locale,
  labels,
  compact = false,
  onNavigate,
}: {
  locale: Locale;
  labels: AccountMenuLabels;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionData>({
    authenticated: false,
    role: null,
    name: null,
  });
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const data = await response.json();
        if (active)
          setSession({
            authenticated: data.authenticated ?? false,
            role: ["ceo", "admin", "worker", "customer"].includes(data.role)
              ? data.role
              : null,
            name: data.name ?? null,
          });
      } catch {
        if (active)
          setSession({ authenticated: false, role: null, name: null });
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || !open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
    } catch {
      /* ignore */
    }
    router.push(withLocale(locale));
    router.refresh();
    setOpen(false);
  }

  const role = session.role;

  const roleDestination =
    role === "admin" || role === "ceo"
      ? withLocale(locale, "admin")
      : role === "worker"
        ? withLocale(locale, "worker")
        : withLocale(locale, "account");

  const roleButtonLabel =
    role === "admin" || role === "ceo"
      ? labels.adminConsole
      : role === "worker"
        ? labels.workerArea
        : labels.myAccount;

  const RoleButtonIcon =
    role === "admin" || role === "ceo" ? LayoutDashboard : UserRound;

  if (!session.authenticated) {
    return (
      <div suppressHydrationWarning>
        <Link
          href={withLocale(locale, "login")}
          onClick={onNavigate}
          className={compact ? "premium-account-action" : undefined}
          aria-label={labels.account}
          title={labels.account}
        >
          <UserRound size={19} aria-hidden="true" />
          {!compact && <span>{labels.account}</span>}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="premium-account-menu"
      ref={menuRef}
      suppressHydrationWarning
    >
      <button
        ref={buttonRef}
        type="button"
        className={`premium-account-trigger ${compact ? "compact" : ""}`}
        aria-label={labels.userMenu}
        aria-expanded={open}
        aria-controls="account-dropdown"
        onClick={() => setOpen(!open)}
      >
        <UserRound size={19} aria-hidden="true" />
        {!compact && session.name && (
          <span className="premium-account-name">{session.name}</span>
        )}
        {!compact && role && (
          <span className="premium-role-badge">
            {labels.roleBadge.replace("{role}", roleLabel(role, locale))}
          </span>
        )}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div
          id="account-dropdown"
          className="premium-account-dropdown"
          role="menu"
        >
          <div className="premium-account-header">
            <div className="premium-account-avatar" aria-hidden="true">
              <UserRound size={24} />
            </div>
            <div className="premium-account-info">
              <p className="premium-account-display-name">
                {session.name ?? "User"}
              </p>
              {role && (
                <span className="premium-account-role">
                  {roleLabel(role, locale)}
                </span>
              )}
            </div>
          </div>
          <Link
            href={roleDestination}
            className="premium-account-primary-action"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            <RoleButtonIcon size={18} aria-hidden="true" />
            <span>{roleButtonLabel}</span>
          </Link>
          <Link
            href={withLocale(locale)}
            className="premium-account-secondary-action"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            {labels.switchToStorefront}
          </Link>
          <button
            type="button"
            className="premium-account-logout"
            role="menuitem"
            onClick={handleLogout}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{labels.logout}</span>
          </button>
        </div>
      )}
    </div>
  );
}
