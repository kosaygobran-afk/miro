import { getRequestConfig } from "next-intl/server";
import { getMessages } from "@/lib/i18n";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: getMessages(locale as Locale),
  };
});
