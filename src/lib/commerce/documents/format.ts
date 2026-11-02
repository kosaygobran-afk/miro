import type { DocumentLanguage } from "./types";

/** Local calendar/time are formatted independently; machine values remain LTR. */
export function formatDocumentTimestamp(
  value: string,
  language: DocumentLanguage,
) {
  const date = new Date(value);
  const locale = language === "he" ? "he-IL" : "en-GB";
  const dateText = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const offset = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")!
    .value.replace("GMT", "UTC");
  return { date: dateText, time: `${time} (${offset})` };
}
