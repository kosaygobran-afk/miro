import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { RecurringWorkspace } from "@/components/management/commerce/commerce-operations-workspace";
export const generateMetadata = privateMetadata("admin");
export default async function RecurringPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safe = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safe, ["admin", "ceo"]);
  return <RecurringWorkspace locale={safe} />;
}
