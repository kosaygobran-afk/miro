import "server-only";
import type {
  BusinessIdentitySnapshot,
  DocumentLanguage,
  FiscalDocumentSnapshot,
  FiscalDocumentType,
} from "./types";

/** Synthetic commercial input; optional identity is read separately, never saved. */
export function createDocumentSample(
  type: FiscalDocumentType,
  language: DocumentLanguage,
  now = new Date().toISOString(),
  identity?: BusinessIdentitySnapshot,
): FiscalDocumentSnapshot {
  const he = language === "he";
  const paid = type === "receipt" || type === "invoice_receipt";
  const document: FiscalDocumentSnapshot = {
    schema_version: 1,
    id: `SAMPLE-${type}-${language}`,
    type,
    state: "draft",
    created_at: now,
    identity_snapshot: {
      legal_name: he
        ? "עסק לדוגמה בלבד בע״מ"
        : "Fictional Sample Business Ltd.",
      trade_name: he
        ? "עסק הדגמה / Demo Business"
        : "Demo Business / עסק הדגמה",
      entity_kind: "company",
      registration_number: "EXAMPLE-REG",
      vat_number: "EXAMPLE-VAT",
      address: {
        street: he
          ? "רחוב לדוגמה 12, בניין א׳"
          : "12 Example Street, Building A",
        city: he ? "עיר לדוגמה" : "Example City",
        postal_code: "0000000",
        country: he ? "ישראל" : "Israel",
      },
      phone: "+972-00-000-0000",
      email: "business@example.invalid",
      document_language: language,
    },
    customer_snapshot: {
      name: he
        ? "לקוח לדוגמה / Sample Customer"
        : "Sample Customer / לקוח לדוגמה",
      company_name: he ? "חברת הדגמה" : "Example Customer Company",
      registration_number: "EXAMPLE-CUSTOMER",
      address: {
        street: he ? "שדרת בדיקה 34, קומה 2" : "34 Test Avenue, Floor 2",
        city: he ? "עיר לדוגמה" : "Example City",
        postal_code: "0000000",
        country: he ? "ישראל" : "Israel",
      },
      phone: "+972-00-000-0001",
      email: "customer@example.invalid",
    },
    currency: "ILS",
    items: [
      {
        description: he
          ? "מצלמת אבטחה לדוגמה - Camera IPC-42 (שחור)"
          : "Sample security camera - IPC-42 (שחור)",
        quantity: 2,
        unit_agorot: 12500,
        discount_agorot: 1000,
        net_agorot: 24000,
        vat_agorot: 4320,
        gross_agorot: 28320,
      },
      {
        description: he
          ? "התקנה וכיוון מערכת / Installation & setup"
          : "Installation & setup / התקנה וכיוון מערכת",
        quantity: 1,
        unit_agorot: 10000,
        net_agorot: 10000,
        vat_agorot: 1800,
        gross_agorot: 11800,
      },
    ],
    net_agorot: 34000,
    vat_agorot: 6120,
    total_agorot: 40120,
    payment_references: paid
      ? [
          {
            method: "card",
            amount_agorot: 40120,
            reference: "SAMPLE-PAYMENT-ONLY",
            collected_at: now,
          },
        ]
      : [],
    ...(type === "credit_note" || type === "correction"
      ? { related_document_number: "SAMPLE-SOURCE-ONLY" }
      : {}),
    note: he
      ? "נתוני דוגמה בלבד לבדיקת הפריסה. לא נוצר מסמך, לא הוקצה מספר ולא בוצעה גבייה.\nיש לבדוק את התצוגה וההדפסה לפני שימוש עסקי."
      : "Fictional data for layout testing only. No document is created, no number is assigned and no payment is collected.\nReview the preview and print output before business use.",
  };
  if (identity) {
    document.identity_snapshot = {
      ...identity,
      address: { ...identity.address },
      document_language: language,
    };
    document.note = he
      ? "פרטי העסק העדכניים מוצגים עם לקוח, מוצרים ותשלומים פיקטיביים לצורך בדיקת הפריסה בלבד. לא נוצר מסמך, לא הוקצה מספר ולא בוצעה גבייה."
      : "Current business details are shown with a fictional customer, items and payments for layout testing only. No document is created, no number is assigned and no payment is collected.";
    if (identity.entity_kind === "exempt") {
      document.items = document.items.map((item) => ({
        ...item,
        vat_agorot: 0,
        gross_agorot: item.net_agorot,
      }));
      document.vat_agorot = 0;
      document.total_agorot = document.net_agorot;
      document.payment_references = document.payment_references.map(
        (payment) => ({
          ...payment,
          amount_agorot: document.total_agorot,
        }),
      );
    }
  }
  return document;
}
