import type { Viewport } from "next";
import { PosLauncher } from "@/components/management/tools/pos-launcher";
import { privateMetadata } from "@/components/auth/private-closed-page";
import { isLocale } from "@/lib/i18n";

export const generateMetadata = privateMetadata("admin");
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function PosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return <PosLauncher locale={safeLocale} />;
}
