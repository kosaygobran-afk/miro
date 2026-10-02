import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { InventoryManager } from "@/components/management/inventory-manager";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "inventory");

export default async function InventoryPage({
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

  const status =
    query.status === "low" || query.status === "out_of_stock"
      ? query.status
      : "all";
  return (
    <InventoryManager
      key={status}
      locale={safeLocale}
      initialStockFilter={status}
    />
  );
}
