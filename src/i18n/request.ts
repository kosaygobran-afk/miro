import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { routing } from "@/i18n/routing";

export default getRequestConfig(async ({ locale }) => {
  let requestLocale = locale;

  if (!requestLocale) {
    requestLocale = await rootParams.locale();
  }

  if (!hasLocale(routing.locales, requestLocale)) {
    notFound();
  }

  return {
    locale: requestLocale,
    messages: getMessages(requestLocale),
  };
});
