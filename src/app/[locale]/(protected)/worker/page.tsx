import {
  PrivateClosedPage,
  privateMetadata,
} from "@/components/auth/private-closed-page";
import { isLocale, type Locale } from "@/lib/i18n";

export const generateMetadata = privateMetadata("worker");

export default async function WorkerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <PrivateClosedPage
      kind="worker"
      locale={(isLocale(locale) ? locale : "he") as Locale}
    />
  );
}
