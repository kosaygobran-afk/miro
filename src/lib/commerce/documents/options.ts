/** Rendering choices are independent of permission to create/issue a document. */
export const DOCUMENT_PREVIEW_TYPES = [
  "quote",
  "proforma",
  "transaction_invoice",
  "tax_invoice",
  "receipt",
  "invoice_receipt",
  "credit_note",
  "correction",
] as const;

export const DOCUMENT_PREVIEW_LABELS = {
  quote: { he: "הצעת מחיר", en: "Quote" },
  proforma: { he: "פרופורמה", en: "Proforma invoice" },
  transaction_invoice: { he: "חשבונית עסקה", en: "Transaction invoice" },
  tax_invoice: { he: "חשבונית מס", en: "Tax invoice" },
  receipt: { he: "קבלה", en: "Receipt" },
  invoice_receipt: { he: "חשבונית מס קבלה", en: "Tax invoice receipt" },
  credit_note: { he: "הודעת זיכוי", en: "Credit note" },
  correction: { he: "מסמך תיקון", en: "Correction document" },
} as const;
