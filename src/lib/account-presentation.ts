import type { Locale } from "@/lib/i18n";

const labels: Record<string, [string, string]> = {
  pending: ["Pending", "ממתינה"],
  paid: ["Paid", "שולמה"],
  processing: ["Processing", "בטיפול"],
  shipped: ["Shipped", "נשלחה"],
  completed: ["Completed", "הושלמה"],
  cancelled: ["Cancelled", "בוטלה"],
  refunded: ["Refunded", "זוכתה"],
  new: ["New", "חדשה"],
  in_progress: ["In progress", "בטיפול"],
  waiting_customer: ["Waiting for your reply", "ממתינה לתשובתכם"],
  closed: ["Closed", "נסגרה"],
  spam: ["Marked as spam", "סומנה כדואר זבל"],
  draft: ["Draft", "טיוטה"],
  issued: ["Issued", "הופקה"],
  void: ["Voided", "בוטלה"],
};

export function accountStatusLabel(status: string, locale: Locale) {
  return (
    labels[status]?.[locale === "he" ? 1 : 0] ??
    (locale === "he" ? "סטטוס לא זמין" : "Status unavailable")
  );
}

export function accountDate(value: string, locale: Locale) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

export function accountAmount(value: number, currency: string, locale: Locale) {
  if (!Number.isFinite(value))
    return locale === "he" ? "סכום לא זמין" : "Amount unavailable";
  try {
    return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return locale === "he" ? "סכום לא זמין" : "Amount unavailable";
  }
}
