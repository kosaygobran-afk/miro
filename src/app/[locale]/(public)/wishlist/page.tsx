import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WishlistPageClient } from "@/features/wishlist/wishlist-page-client";
import { isLocale } from "@/lib/i18n";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === "he" ? "רשימת משאלות" : "Wishlist",
    robots: { index: false, follow: false },
  };
}

export default async function WishlistPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <WishlistPageClient locale={locale} />;
}
