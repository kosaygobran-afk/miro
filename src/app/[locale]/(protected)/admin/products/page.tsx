import { requireRole } from "@/lib/auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { ProductManagement } from "@/components/management/product-management";
import { privateMetadata } from "@/components/auth/private-closed-page";

export const generateMetadata = privateMetadata("admin", "products");

export default async function ProductsPage({
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
    typeof query.status === "string" &&
    ["draft", "active", "hidden", "archived"].includes(query.status)
      ? query.status
      : "";
  return (
    <ProductManagement
      key={status}
      locale={safeLocale}
      initialStatus={status}
    />
  );
}
