import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { FinanceDashboard } from "@/components/management/finance-dashboard";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "finance");

export default async function FinancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  return <FinanceDashboard locale={safeLocale} />;
}
