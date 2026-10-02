"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { roleLabel, type AppRole } from "@/lib/roles";
import { withLocale, type Locale } from "@/lib/i18n";
import { AdminNav } from "@/components/management/admin-nav";
import { Drawer } from "@/components/management/ui/drawer";
import { OverlayStackProvider } from "@/components/management/ui/overlay-stack";
import { ManagementTopbar } from "./management-topbar";
import { mgmtShellCopy } from "./nav-config";
import { WorkspaceProvider } from "./workspace-context";
import { OverflowText } from "../ui/overflow-text";

const COLLAPSE_STORAGE_KEY = "miro.mgmt.sidebar-collapsed";
const COLLAPSE_CHANGE_EVENT = "miro:mgmt-sidebar-collapse";

let memoryCollapsed: boolean | null = null;
const collapseListeners = new Set<() => void>();

function subscribeCollapsed(onStoreChange: () => void) {
  collapseListeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(COLLAPSE_CHANGE_EVENT, onStoreChange);
  return () => {
    collapseListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(COLLAPSE_CHANGE_EVENT, onStoreChange);
  };
}

function readCollapsed() {
  if (memoryCollapsed !== null) return memoryCollapsed;
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistCollapsed(next: boolean) {
  memoryCollapsed = next;
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Storage unavailable (private mode): the preference still applies
    // in-memory for this session.
  }
  collapseListeners.forEach((listener) => listener());
}

export type ManagementShellProps = {
  locale: Locale;
  role: AppRole;
  userName: string;
  userEmail: string;
  children: ReactNode;
};

/**
 * Management app shell: persistent collapsible sidebar on desktop (inline
 * start edge, RTL-aware), an accessible drawer on mobile/tablet, a consistent
 * top bar, and the routed feature panel in the main content area.
 *
 * Collapse state persists in localStorage. The server snapshot always renders
 * the expanded state to stay hydration-safe; the stored preference is applied
 * as soon as the client hydrates.
 */
export function ManagementShell({
  locale,
  role,
  userName,
  userEmail,
  children,
}: ManagementShellProps) {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    persistCollapsed(!readCollapsed());
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const initials =
    (userName || userEmail)
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <WorkspaceProvider locale={locale} role={role}>
      <OverlayStackProvider>
        <div
          className="mgmt-shell"
          data-sidebar={collapsed ? "collapsed" : "expanded"}
        >
          <aside
            className="mgmt-sidebar"
            aria-label={mgmtShellCopy.navLabel[locale]}
          >
            <div className="mgmt-sidebar__brand">
              <Link
                href={withLocale(locale, "admin")}
                className="mgmt-sidebar__brand-link"
              >
                <span className="mgmt-sidebar__brand-mark" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="23"
                    height="23"
                    fill="currentColor"
                  >
                    <path d="M4 18V6h3.5l4.5 7 4.5-7H20v12h-3.5v-6.5L12 18l-4.5-6.5V18z" />
                  </svg>
                </span>
                <span className="mgmt-sidebar__brand-text">
                  <span className="mgmt-sidebar__brand-name">
                    {mgmtShellCopy.brandName[locale]}
                  </span>
                  <span className="mgmt-sidebar__brand-tagline">
                    {mgmtShellCopy.brandTagline[locale]}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className="mgmt-sidebar__collapse"
                onClick={toggleCollapsed}
                aria-label={
                  collapsed
                    ? mgmtShellCopy.expandSidebar[locale]
                    : mgmtShellCopy.collapseSidebar[locale]
                }
                title={
                  collapsed
                    ? mgmtShellCopy.expandSidebar[locale]
                    : mgmtShellCopy.collapseSidebar[locale]
                }
                aria-expanded={!collapsed}
              >
                <CollapseIcon
                  size={18}
                  aria-hidden="true"
                  className="mgmt-sidebar__collapse-icon"
                />
              </button>
            </div>
            <div className="mgmt-sidebar__nav">
              <AdminNav locale={locale} role={role} collapsed={collapsed} />
            </div>
            <div className="mgmt-sidebar__footer">
              <span className="mgmt-sidebar__avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="mgmt-sidebar__identity">
                <span className="mgmt-sidebar__identity-name">
                  <OverflowText
                    text={userName || userEmail}
                    focusable={false}
                  />
                </span>
                <span className={`mgmt-role-badge mgmt-role-badge--${role}`}>
                  {roleLabel(role, locale)}
                </span>
              </span>
            </div>
          </aside>

          <div className="mgmt-shell__body">
            <ManagementTopbar
              locale={locale}
              role={role}
              userName={userName}
              userEmail={userEmail}
              onOpenNav={() => setDrawerOpen(true)}
            />
            <div className="mgmt-shell__main">{children}</div>
          </div>

          <Drawer
            open={drawerOpen}
            onClose={closeDrawer}
            title={mgmtShellCopy.brandTagline[locale]}
            side="start"
            closeLabel={mgmtShellCopy.closeNavigation[locale]}
            className="mgmt-drawer--nav"
          >
            <AdminNav locale={locale} role={role} onNavigate={closeDrawer} />
          </Drawer>
        </div>
      </OverlayStackProvider>
    </WorkspaceProvider>
  );
}
