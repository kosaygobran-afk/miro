import type { Locale } from "@/lib/i18n";

type Localized = Record<Locale, string>;

export const analyticsCopy = {
  title: { he: "אנליטיקה", en: "Analytics" },
  subtitle: {
    he: "מדדי מעורבות של החנות: צפיות, חיפושים, חשיפות ופניות.",
    en: "Storefront engagement metrics: views, searches, impressions and enquiries.",
  },
  loadFailedTitle: {
    he: "לא ניתן לטעון נתוני אנליטיקה",
    en: "Failed to load analytics data",
  },
  refreshFailed: {
    he: "הרענון נכשל — מוצגים הנתונים האחרונים שהתקבלו.",
    en: "Refresh failed — showing the last received data.",
  },
  retry: { he: "נסה שוב", en: "Try again" },
  updatedAt: { he: "עודכן", en: "Updated" },
  range: { he: "טווח", en: "Range" },
  // Header metric cards
  metricViews: { he: "צפיות בדפי מוצר", en: "Product detail views" },
  metricImpressions: {
    he: "חשיפות חיפוש/רשימה",
    en: "Search & listing impressions",
  },
  impressionsNote: {
    he: "הופעות מוצרים בקטלוג ובתוצאות חיפוש",
    en: "Product appearances in listings and search results",
  },
  metricUniqueSessions: {
    he: "צופים ייחודיים",
    en: "Unique viewers / sessions",
  },
  uniqueSessionsNote: {
    he: "מזהי סשן ייחודיים בטווח",
    en: "Distinct session ids in range",
  },
  uniqueViewersCapped: {
    he: "ספירת צופים ייחודיים למוצר מבוססת על עד 5,000 סשנים אחרונים",
    en: "Per-product unique viewer counts sample up to 5,000 recent sessions",
  },
  metricSearches: { he: "חיפושים", en: "Searches" },
  zeroResultNote: { he: "חיפושים ללא תוצאות", en: "no-result searches" },
  metricContactClicks: {
    he: "לחיצות על פנייה (CTA)",
    en: "Contact CTA clicks",
  },
  clickCall: { he: "שיחה", en: "Call" },
  clickWhatsapp: { he: "וואטסאפ", en: "WhatsApp" },
  clickEnquiry: { he: "כפתור פנייה", en: "Enquiry button" },
  metricEnquiriesSubmitted: { he: "פניות שנשלחו", en: "Submitted enquiries" },
  enquiriesSubmittedNote: {
    he: "בקשות שירות/פניות שנשמרו בטווח",
    en: "Service requests recorded in range",
  },
  metricConversion: {
    he: "יחס אירועי בקשת מידע לצפיות",
    en: "Enquiry click / view event ratio",
  },
  conversionNote: {
    he: "קליקי בקשת מידע חלקי אירועי צפייה; לא שיעור של לקוחות ייחודיים",
    en: "Enquiry click events divided by detail views; not a unique-customer rate",
  },
  enquiryClickCount: { he: "קליקי פנייה", en: "enquiry clicks" },
  activityTitle: { he: "פעילות יומית", en: "Daily activity" },
  activityDescription: {
    he: "כל אירועי המעורבות שנמדדו בחנות לפי יום.",
    en: "All measured storefront engagement events by day.",
  },
  topSearchesTitle: { he: "חיפושים מובילים", en: "Top searches" },
  topCategoriesTitle: { he: "קטגוריות נצפות", en: "Viewed categories" },
  noRankingData: { he: "אין נתונים בטווח הזה", en: "No data in this range" },
  events: { he: "אירועים", en: "events" },
  // Per-product table
  tableTitle: { he: "ביצועים לפי מוצר", en: "Per-product performance" },
  tableCaption: {
    he: "טבלת ביצועים למוצר בטווח שנבחר",
    en: "Per-product performance for the selected range",
  },
  searchPlaceholder: { he: "חיפוש מוצר בטבלה…", en: "Filter products…" },
  searchLabel: { he: "חיפוש מוצר בטבלה", en: "Filter products in table" },
  colProduct: { he: "מוצר", en: "Product" },
  colCategory: { he: "קטגוריה", en: "Category" },
  colViews: { he: "צפיות", en: "Views" },
  colUniqueViewers: { he: "צופים ייחודיים", en: "Unique viewers" },
  colContactClicks: { he: "לחיצות על פנייה", en: "Contact clicks" },
  colEnquiries: { he: "פניות", en: "Enquiries" },
  colConversion: { he: "יחס בקשת מידע לצפיות", en: "Enquiry / view ratio" },
  tableEmptyTitle: {
    he: "אין נתוני מוצרים לטווח שנבחר",
    en: "No product data for the selected range",
  },
  tableEmptyDescription: {
    he: "נסה להרחיב את טווח התאריכים.",
    en: "Try widening the date range.",
  },
  searchEmptyTitle: {
    he: "אין מוצרים שתואמים לחיפוש",
    en: "No products match the filter",
  },
  unknownProduct: { he: "מוצר לא ידוע", en: "Unknown product" },
  unknownCategory: { he: "ללא קטגוריה", en: "No category" },
} satisfies Record<string, Localized>;

export function t(locale: Locale, text: Localized): string {
  return locale === "he" ? text.he : text.en;
}

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL").format(
    value,
  );
}

export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}
