import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { CustomersManager } from "@/components/management/customers-manager";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "customers");

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  return <CustomersManager locale={safeLocale} />;
}
