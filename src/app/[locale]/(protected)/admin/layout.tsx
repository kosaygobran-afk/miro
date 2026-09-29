import { requireRole } from "@/lib/auth";
import { getDirection, isLocale, type Locale } from "@/lib/i18n";
import { ManagementShell } from "@/components/management/shell/management-shell";
import "@/styles/management.css";

/**
 * Management console layout. Resolves the actor role/status on the server
 * (user_roles is the trusted source via requireRole) and hands it to the
 * client shell, which renders the sidebar, top bar and content area.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);

  const userName =
    context.profile?.full_name?.trim() || context.user.email || "";

  return (
    <div className="mgmt-shell-root" dir={getDirection(safeLocale)}>
      <ManagementShell
        locale={safeLocale}
        role={context.role}
        userName={userName}
        userEmail={context.user.email ?? ""}
      >
        {children}
      </ManagementShell>
    </div>
  );
}
