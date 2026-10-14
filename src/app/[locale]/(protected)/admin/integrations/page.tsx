import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { IntegrationsWorkspace } from "@/components/management/commerce/support-workspaces";
export const generateMetadata = privateMetadata("admin");
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safe = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safe, ["admin", "ceo"]);
  return <IntegrationsWorkspace locale={safe} />;
}
