import { getTranslations } from "next-intl/server";
import {
  HeaderClient,
  type HeaderLabels,
} from "@/components/layout/header-client";
import type { Locale } from "@/lib/i18n";

export async function Header({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "layout.header" });
  const pt = await getTranslations({ locale, namespace: "pages.products" });
  const labels: HeaderLabels = {
    logo: t("logo"),
    tagline: t("tagline"),
    homeLabel: t("homeLabel"),
    navLabel: t("navLabel"),
    nav: {
      home: t("nav.home"),
      services: t("nav.services"),
      homeServices: t("nav.homeServices"),
      business: t("nav.business"),
      products: t("nav.products"),
      about: t("nav.about"),
      contact: t("nav.contact"),
    },
    actions: {
      requestQuote: t("actions.requestQuote"),
      account: t("actions.account"),
      languageSwitch: t("actions.languageSwitch"),
      themeToggle: t("actions.themeToggle"),
      openMenu: t("actions.openMenu"),
      closeMenu: t("actions.closeMenu"),
    },
    products: {
      cameras: pt("categories.cameras"),
      servers: pt("categories.servers"),
      routers: pt("categories.routers"),
      cables: pt("categories.cables"),
      accessories: pt("categories.accessories"),
      networkGear: pt("categories.networkGear"),
    },
  };

  return <HeaderClient locale={locale} labels={labels} />;
}
