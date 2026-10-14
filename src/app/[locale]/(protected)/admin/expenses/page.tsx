import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { ExpensesWorkspace } from "@/components/management/commerce/expenses-workspace";
export const generateMetadata = privateMetadata("admin");
export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safe = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safe, ["admin", "ceo"]);
  return <ExpensesWorkspace locale={safe} />;
}
