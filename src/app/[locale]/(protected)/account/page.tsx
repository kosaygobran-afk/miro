import { AccountDashboard } from "@/components/account/account-dashboard";
import { isLocale, type Locale } from "@/lib/i18n";
import { requireAuth } from "@/lib/auth";

export async function generateMetadata() {
  return { title: "Account", robots: { index: false, follow: false } };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireAuth(safeLocale);
  return <AccountDashboard locale={safeLocale} context={context} />;
}
