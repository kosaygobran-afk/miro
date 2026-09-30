import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartPageClient } from "@/features/cart/cart-page-client";
import { isLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CartPageClient locale={locale} />;
}
