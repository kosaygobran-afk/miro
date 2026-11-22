import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartPageClient } from "@/features/cart/cart-page-client";
import { isLocale } from "@/lib/i18n";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "he" ? "סל הקניות" : "Cart",
    robots: { index: false, follow: false },
  };
}

export default async function CartPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CartPageClient locale={locale} />;
}
