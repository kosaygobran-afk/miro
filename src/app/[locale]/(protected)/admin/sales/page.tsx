import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { SalesPanel } from "@/components/management/sales-panel";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "sales");

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const safeLocale = (isLocale(locale) ? locale : "he") as Locale;
  await requireRole(safeLocale, ["admin", "ceo"]);

  return (
    <SalesPanel
      locale={safeLocale}
      initialView={query.view === "record" ? "record" : "history"}
    />
  );
}
