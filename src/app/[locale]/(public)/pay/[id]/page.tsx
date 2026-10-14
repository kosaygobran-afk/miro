import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/lib/i18n";
import { PaymentPageClient } from "@/features/commerce/payment-page-client";
export const metadata: Metadata = {
  title: "MIRO — Payment",
  robots: { index: false, follow: false },
};
export default async function PaymentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !z.string().uuid().safeParse(id).success) notFound();
  return <PaymentPageClient locale={locale} intentId={id} />;
}
