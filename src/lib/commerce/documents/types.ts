export type DocumentLanguage = "he" | "en";
export type BusinessEntityKind =
  "exempt" | "registered" | "company" | "unknown";
export type FiscalDocumentType =
  | "quote"
  | "proforma"
  | "transaction_invoice"
  | "tax_invoice"
  | "receipt"
  | "invoice_receipt"
  | "credit_note"
  | "correction";
export type FiscalDocumentState =
  | "draft"
  | "reserved"
  | "awaiting_allocation"
  | "awaiting_signature"
  | "issued"
  | "voided";

export interface AddressSnapshot {
  street: string;
  city: string;
  postal_code: string;
  country: string;
}

export interface BusinessIdentitySnapshot {
  legal_name: string;
  trade_name: string;
  entity_kind: BusinessEntityKind;
  registration_number: string;
  vat_number: string;
  address: AddressSnapshot;
  phone: string;
  email: string;
  document_language: DocumentLanguage;
}

export interface CustomerSnapshot {
  name: string;
  company_name?: string;
  registration_number?: string;
  address?: Partial<AddressSnapshot>;
  phone?: string;
  email?: string;
}

export interface DocumentItemSnapshot {
  description: string;
  quantity: number;
  unit_agorot?: number;
  discount_agorot?: number;
  net_agorot: number;
  vat_agorot: number;
  gross_agorot: number;
}

export interface DocumentPaymentReference {
  method: string;
  amount_agorot: number;
  reference?: string;
  collected_at?: string;
}

/** Immutable-at-issue canonical input. No live settings or catalog lookups belong here. */
export interface FiscalDocumentSnapshot {
  schema_version: 1;
  id: string;
  type: FiscalDocumentType;
  state: FiscalDocumentState;
  number?: string;
  created_at: string;
  issued_at?: string;
  identity_snapshot: BusinessIdentitySnapshot;
  customer_snapshot: CustomerSnapshot;
  items: DocumentItemSnapshot[];
  currency: "ILS";
  net_agorot: number;
  vat_agorot: number;
  total_agorot: number;
  allocation_number?: string;
  payment_references: DocumentPaymentReference[];
  related_document_number?: string;
  note?: string;
}

export interface ValidatedDocumentSnapshot {
  readonly document: Readonly<FiscalDocumentSnapshot>;
  readonly canonicalJson: string;
  readonly canonicalHash: string;
}
