import { requireRole } from "@/lib/auth";
import { isLocale, type Locale, withLocale } from "@/lib/i18n";
import { AdminNav } from "@/components/management/admin-nav";

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

  return (
    <div
      className="admin-shell min-h-screen"
      dir={safeLocale === "he" ? "rtl" : "ltr"}
    >
      <header className="admin-shell__header">
        <div className="admin-shell__header-inner">
          <div className="admin-shell__brand">
            <a
              href={withLocale(safeLocale)}
              className="admin-shell__storefront-link"
            >
              {safeLocale === "he" ? "↗ מעבר לחנות" : "↗ Switch to storefront"}
            </a>
          </div>
          <AdminNav locale={safeLocale} />
          <div className="admin-shell__user">
            <span
              className={`admin-shell__role-badge ${
                context.role === "ceo"
                  ? "admin-shell__role-badge--ceo"
                  : "admin-shell__role-badge--admin"
              }`}
            >
              {context.role === "ceo"
                ? safeLocale === "he"
                  ? "מנכ״ל"
                  : "CEO"
                : safeLocale === "he"
                  ? "מנהל"
                  : "Admin"}
            </span>
            <form
              action={`/api/auth/logout?locale=${safeLocale}`}
              method="POST"
            >
              <button type="submit" className="admin-shell__logout-button">
                {safeLocale === "he" ? "התנתקות" : "Log out"}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="admin-shell__main">{children}</main>
    </div>
  );
}
