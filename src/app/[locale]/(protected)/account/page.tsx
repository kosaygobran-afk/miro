import { PrivateClosedPage, privateMetadata } from "@/components/auth/private-closed-page";
import { isLocale, type Locale } from "@/lib/i18n";

export const generateMetadata = privateMetadata("account");

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PrivateClosedPage kind="account" locale={(isLocale(locale) ? locale : "he") as Locale} />;
}
