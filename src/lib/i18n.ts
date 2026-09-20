import enMessages from "@/messages/en.json";
import heMessages from "@/messages/he.json";

export const locales = ["he", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "he";

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function getDirection(locale: Locale) {
  return locale === "he" ? "rtl" : "ltr";
}

export function getMessages(locale: Locale) {
  return locale === "en" ? enMessages : heMessages;
}

export function withLocale(locale: Locale, path = "") {
  const normalized = path === "/" ? "" : path.replace(/^\/+/, "");
  return `/${locale}${normalized ? `/${normalized}` : ""}`;
}

export function switchLocalePath(pathname: string, targetLocale: Locale) {
  const parts = pathname.split("/");
  if (isLocale(parts[1] ?? "")) {
    parts[1] = targetLocale;
    return parts.join("/") || `/${targetLocale}`;
  }

  return `/${targetLocale}`;
}
