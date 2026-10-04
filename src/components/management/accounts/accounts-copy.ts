import type { Locale } from "@/lib/i18n";

type Localized = Record<Locale, string>;

export const accountsCopy = {
  title: { he: "חשבונות קופה", en: "POS Accounts" },
  subtitle: {
    he: "קבלות קופה, תשלומים ופעילות מכירה.",
    en: "POS receipts, payments and register activity.",
  },
  // Summary cards
  posRevenue: { he: "הכנסות קופה", en: "POS Revenue" },
  posTransactions: { he: "עסקאות קופה", en: "POS Transactions" },
  posUnitsSold: { he: "יחידות שנמכרו בקופה", en: "POS Units Sold" },
  posAvgTicket: { he: "ממוצע חשבון בקופה", en: "POS Avg Ticket" },
  // Payment method breakdown
  paymentMethod: { he: "שיטת תשלום", en: "Payment Method" },
  amount: { he: "סכום", en: "Amount" },
  // Filter labels
  dateRange: { he: "טווח תאריכים", en: "Date Range" },
  paymentMethodFilter: { he: "שיטת תשלום", en: "Payment Method" },
  paymentStatusFilter: { he: "סטטוס תשלום", en: "Payment Status" },
  cashierSearch: { he: "חיפוש קופאי", en: "Cashier Search" },
  generalSearch: { he: "חיפוש כללי", en: "General Search" },
  // Table headers
  dateTime: { he: "תאריך ושעה", en: "Date & Time" },
  receiptNumber: { he: "מספר קבלה", en: "Receipt Number" },
  customer: { he: "לקוח", en: "Customer" },
  cashier: { he: "קופאי", en: "Cashier" },
  itemCount: { he: "פריטים", en: "Items" },
  total: { he: "סכום", en: "Total" },
  paymentSummary: { he: "סיכום תשלום", en: "Payment Summary" },
  status: { he: "סטטוס", en: "Status" },
  details: { he: "פרטים", en: "Details" },
  // Empty state
  emptyTitle: {
    he: "אין עסקאות קופה בטווח זה",
    en: "No POS transactions in this period",
  },
  emptyDescription: {
    he: "נסה להרחיב את טווח התאריכים או לשנות את המסננים.",
    en: "Try widening the date range or adjusting filters.",
  },
  // Dialog sections
  receipt: { he: "קבלה", en: "Receipt" },
  items: { he: "פריטים", en: "Items" },
  payments: { he: "תשלומים", en: "Payments" },
  inventory: { he: "מלאי", en: "Inventory" },
  // Receipt fields
  receiptNumberLabel: { he: "מספר קבלה", en: "Receipt Number" },
  dateLabel: { he: "תאריך", en: "Date" },
  cashierLabel: { he: "קופאי", en: "Cashier" },
  customerNameLabel: { he: "שם לקוח", en: "Customer Name" },
  customerEmailLabel: { he: "אימייל לקוח", en: "Customer Email" },
  // Items fields
  skuLabel: { he: "\u05DD\u05E7\u05F3\u05D8", en: "SKU" },
  nameLabel: { he: "שם", en: "Name" },
  qtyLabel: { he: "כמות", en: "Quantity" },
  unitPriceLabel: { he: "מחיר יחידה", en: "Unit Price" },
  discountLabel: { he: "הנחה", en: "Discount" },
  vatLabel: { he: "\u05DD\u05E1\u05F4\u05DD", en: "VAT" },
  lineTotalLabel: { he: "סכום שורה", en: "Line Total" }, // Payments fields
  methodLabel: { he: "שיטת תשלום", en: "Method" },
  amountLabel: { he: "סכום", en: "Amount" },
  installmentsLabel: { he: "תשלומים", en: "Installments" },
  statusLabel: { he: "סטטוס", en: "Status" },
  referenceLabel: { he: "הפניה", en: "Reference" },
  paidAtLabel: { he: "תאריך תשלום", en: "Paid At" }, // Inventory fields
  movementRefLabel: { he: "הפניה לתנועת מלאי", en: "Stock Movement Ref" },
} satisfies Record<string, Localized>;

export function t(locale: Locale, text: Localized): string {
  return locale === "he" ? text.he : text.en;
}

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL").format(
    value,
  );
}

export function formatCurrency(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}
