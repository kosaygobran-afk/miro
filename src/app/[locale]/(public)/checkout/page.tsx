import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutPageClient } from "@/features/cart/checkout-page-client";
import { isLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CheckoutPageClient locale={locale} />;
}
