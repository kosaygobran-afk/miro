import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { SettingsPanel } from "@/components/management/settings-panel";
import { CeoSettings } from "@/components/management/ceo-settings";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { SettingsDirectory } from "@/components/management/settings-directory";
import { PageHeader } from "@/components/management/ui/page-header";

export const generateMetadata = privateMetadata("admin", "settings");

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);
  const isCeo = context.role === "ceo";
  const he = safeLocale === "he";

  return (
    <div className="mgmt-page-stack">
      <PageHeader
        title={he ? "הגדרות" : "Settings"}
        subtitle={
          he
            ? "כלי ניהול לאתר, לחנות, לעסק ולחשבונות המשתמשים."
            : "Find controls for the website, storefront, business and user accounts."
        }
      />
      <SettingsDirectory locale={safeLocale} isCeo={isCeo} />
      <SettingsPanel locale={safeLocale} isCeo={isCeo} />
      {isCeo && <CeoSettings locale={safeLocale} />}
    </div>
  );
}
