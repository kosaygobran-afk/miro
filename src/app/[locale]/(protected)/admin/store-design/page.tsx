import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isLocale, withLocale } from "@/lib/i18n";

export default async function StoreDesignPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  await requireRole(safeLocale, ["admin", "ceo"]);
  redirect(
    withLocale(
      safeLocale,
      "admin/settings/website-images#store-website-images",
    ),
  );
}
