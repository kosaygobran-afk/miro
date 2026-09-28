import type { Locale } from "@/lib/i18n";

export type Localized = Record<Locale, string>;

const pick = (locale: Locale, text: Localized): string =>
  locale === "he" ? text.he : text.en;

export const overviewCopy = {
  title: { he: "סקירת מערכת", en: "Overview" },
  subtitle: {
    he: "תמונת מצב חיה של הזמנות, מלאי, פניות ופעילות מערכת.",
    en: "Live snapshot of orders, inventory, enquiries and system activity.",
  },
  kpisRow: { he: "מדדים מרכזיים", en: "Key metrics" },
  attentionRow: { he: "דורש טיפול", en: "Needs attention" },
  operationsRow: { he: "תפעול", en: "Operations" },
  activityRow: { he: "פעילות אחרונה", en: "Recent activity" },
  dataUnavailable: { he: "הנתונים אינם זמינים", en: "Data unavailable" },
  dataUnavailableHint: {
    he: "טעינת החלק הזה נכשלה. נסה לרענן את הדף.",
    en: "This section failed to load. Try refreshing the page.",
  },
  revenueToday: { he: "הכנסות היום", en: "Revenue today" },
  revenueMonth: { he: "הכנסות החודש", en: "Revenue this month" },
  salesCountToday: { he: "מכירות היום", en: "Sales today" },
  salesCountMonth: { he: "מכירות החודש", en: "Sales this month" },
  newEnquiries: { he: "פניות חדשות", en: "New enquiries" },
  staleEnquiries: {
    he: "פניות חדשות מעל 48 שעות",
    en: "New enquiries over 48h",
  },
  lowStock: { he: "וריאנטים במלאי נמוך", en: "Low-stock variants" },
  outOfStock: { he: "וריאנטים שאזלו מהמלאי", en: "Out-of-stock variants" },
  draftProducts: { he: "מוצרים בטיוטה", en: "Draft products" },
  openFiltered: { he: "צפה ברשימה", en: "View list" },
  inventoryUnits: { he: "יחידות במלאי", en: "Units in stock" },
  inventoryValue: { he: "שווי מלאי (עלות)", en: "Inventory value (cost)" },
  topMoversTitle: { he: "המוצרים הנמכרים", en: "Top moving products" },
  topMoversRange: { he: "בשבוע האחרון", en: "Last 7 days" },
  topMoversEmpty: {
    he: "אין תנועות מכירה בשבוע האחרון.",
    en: "No sales movements in the last 7 days.",
  },
  recentSalesTitle: { he: "מכירות אחרונות", en: "Recent sales" },
  recentSalesEmpty: { he: "אין מכירות עדיין.", en: "No sales yet." },
  colOrderNumber: { he: "מס׳ הזמנה", en: "Order no." },
  colCustomer: { he: "לקוח", en: "Customer" },
  colTotal: { he: "סכום", en: "Total" },
  colRecordedBy: { he: "נסרם על ידי", en: "Recorded by" },
  colWhen: { he: "מתי", en: "When" },
  activityEmpty: { he: "אין פעילות אחרונה.", en: "No recent activity." },
  actorSystem: { he: "המערכת", en: "System" },
  actorUnknown: { he: "משתמש לא מזוהה", en: "Unknown user" },
  now: { he: "הרגע", en: "just now" },
  unitsSold: { he: "יח׳ נמכרו", en: "units sold" },
} satisfies Record<string, Localized>;

export function t(locale: Locale, text: Localized): string {
  return pick(locale, text);
}

export function formatCurrency(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, locale: Locale): string {
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

export function formatDateTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(
  iso: string,
  nowIso: string,
  locale: Locale,
): string {
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) {
    return formatDateTime(iso, locale);
  }
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 90) return t(locale, overviewCopy.now);
  const rtf = new Intl.RelativeTimeFormat(locale === "he" ? "he-IL" : "en-IL", {
    numeric: "auto",
  });
  const minutes = Math.round(diffSec / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return formatDateTime(iso, locale);
}

type ActivityObject = { he: string; en: string };
const activityObjects = {
  product: { he: "מוצר", en: "a product" },
  category: { he: "קטגוריה", en: "a category" },
  variant: { he: "וריאנט", en: "a variant" },
  supplier: { he: "ספק", en: "a supplier" },
  order: { he: "הזמנה", en: "an order" },
  sale: { he: "מכירה", en: "a sale" },
  request: { he: "פנייה", en: "an enquiry" },
  setting: { he: "הגדרה", en: "a setting" },
  service: { he: "שירות", en: "a service" },
  taxRate: { he: "שיעור מע״מ", en: "a tax rate" },
  account: { he: "חשבון משתמש", en: "a user account" },
} satisfies Record<string, ActivityObject>;

type ActivityVerb = {
  he: string;
  en: string;
  /** Generic object used when no entity name resolves; omitted = verb only. */
  object?: keyof typeof activityObjects;
};

const activityActions: Record<string, ActivityVerb> = {
  product_created: { he: "יצר/ה", en: "created", object: "product" },
  product_updated: { he: "עדכן/ה", en: "updated", object: "product" },
  product_published: { he: "פרסם/ה", en: "published", object: "product" },
  product_unpublished: {
    he: "ביטל/ה פרסום של",
    en: "unpublished",
    object: "product",
  },
  product_auto_unpublished: {
    he: "בוטל הפרסום של",
    en: "auto-unpublished",
    object: "product",
  },
  product_archived: {
    he: "העביר/ה לארכיון את",
    en: "archived",
    object: "product",
  },
  product_deleted: { he: "מחק/ה", en: "deleted", object: "product" },
  product_price_set: {
    he: "עדכן/ה מחיר של",
    en: "set the price of",
    object: "product",
  },
  product_price_removed: {
    he: "הסיר/ה מחיר של",
    en: "removed the price of",
    object: "product",
  },
  product_price_deleted: {
    he: "מחק/ה מחיר של",
    en: "deleted the price of",
    object: "product",
  },
  product_image_added: {
    he: "הוסיף/ה תמונה ב",
    en: "added an image to",
    object: "product",
  },
  product_image_updated: {
    he: "עדכן/ה תמונה ב",
    en: "updated an image on",
    object: "product",
  },
  product_image_deleted: {
    he: "הסיר/ה תמונה ב",
    en: "removed an image from",
    object: "product",
  },
  category_created: { he: "יצר/ה", en: "created", object: "category" },
  category_updated: { he: "עדכן/ה", en: "updated", object: "category" },
  category_deleted: { he: "מחק/ה", en: "deleted", object: "category" },
  category_deactivated: {
    he: "השבית/ה",
    en: "deactivated",
    object: "category",
  },
  category_reactivated: {
    he: "הפעיל/ה מחדש",
    en: "reactivated",
    object: "category",
  },
  variant_created: { he: "יצר/ה", en: "created", object: "variant" },
  variant_updated: { he: "עדכן/ה", en: "updated", object: "variant" },
  variant_deleted: { he: "מחק/ה", en: "deleted", object: "variant" },
  variant_set_default: {
    he: "הגדיר/ה כוריאנט ברירת מחדל",
    en: "set as default",
    object: "variant",
  },
  supplier_created: { he: "יצר/ה", en: "created", object: "supplier" },
  supplier_updated: { he: "עדכן/ה", en: "updated", object: "supplier" },
  supplier_deactivated: {
    he: "השבית/ה",
    en: "deactivated",
    object: "supplier",
  },
  supplier_deleted: { he: "מחק/ה", en: "deleted", object: "supplier" },
  stock_movement: {
    he: "רשם/ה תזוזת מלאי ב",
    en: "recorded a stock movement on",
    object: "variant",
  },
  stock_adjustment: {
    he: "התאים/ה מלאי ל",
    en: "adjusted stock of",
    object: "variant",
  },
  sale_recorded: { he: "רשם/ה", en: "recorded", object: "sale" },
  order_created: { he: "יצר/ה", en: "created", object: "order" },
  order_updated: { he: "עדכן/ה", en: "updated", object: "order" },
  request_update: { he: "עדכן/ה", en: "updated", object: "request" },
  setting_changed: { he: "שינה/ה", en: "changed", object: "setting" },
  service_upserted: { he: "עדכן/ה", en: "updated", object: "service" },
  tax_rate_changed: { he: "שינה/ה את", en: "changed", object: "taxRate" },
  account_control: {
    he: "החיל/ה פקד על",
    en: "applied a control to",
    object: "account",
  },
  ceo_added: { he: "הוסיף/ה מנכ״ל/ית", en: "added a CEO" },
  ceo_self_deleted: {
    he: "מחק/ה את חשבון המנכ״ל/ית שלו/ה",
    en: "removed their own CEO account",
  },
};

/** Builds a readable bilingual sentence like `Ahmed published “4K Dome Camera”`. */
export function activitySentence(
  locale: Locale,
  action: string,
  actor: string,
  entityName: string | null,
): string {
  const verb = activityActions[action];
  if (!verb) {
    const fallback = action.replace(/_/g, " ");
    return `${actor} ${fallback}`;
  }
  const verbText = pick(locale, verb);
  if (entityName) return `${actor} ${verbText} “${entityName}”`;
  if (verb.object) {
    return `${actor} ${verbText} ${pick(locale, activityObjects[verb.object])}`;
  }
  return `${actor} ${verbText}`;
}
