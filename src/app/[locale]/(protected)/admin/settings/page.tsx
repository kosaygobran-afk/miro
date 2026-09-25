import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { SettingsPanel } from "@/components/management/settings-panel";
import { CeoSettings } from "@/components/management/ceo-settings";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);
  const isCeo = context.role === "ceo";

  return (
    <>
      <SettingsPanel locale={safeLocale} isCeo={isCeo} />
      {isCeo && <CeoSettings locale={safeLocale} />}
    </>
  );
}
