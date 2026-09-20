import { PrivateClosedPage, privateMetadata } from "@/components/auth/private-closed-page";
import { isLocale, type Locale } from "@/lib/i18n";

export const generateMetadata = privateMetadata("admin");

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PrivateClosedPage kind="admin" locale={(isLocale(locale) ? locale : "he") as Locale} />;
}
