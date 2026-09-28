import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { RequestsQueue } from "@/components/management/requests/requests-queue";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "requests");

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  const context = await requireRole(safeLocale, ["admin", "ceo"]);

  return (
    <RequestsQueue
      locale={safeLocale}
      selfId={context.user.id}
      selfName={context.profile?.full_name?.trim() || context.user.email || ""}
    />
  );
}
