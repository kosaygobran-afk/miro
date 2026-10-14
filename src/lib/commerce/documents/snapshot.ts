import "server-only";
import { createHash } from "node:crypto";
import type {
  BusinessEntityKind,
  BusinessIdentitySnapshot,
  FiscalDocumentSnapshot,
  FiscalDocumentType,
  ValidatedDocumentSnapshot,
} from "./types";

export const MAX_DOCUMENT_AGOROT = 999_999_999_999;
const ENTITY_KINDS: BusinessEntityKind[] = [
  "exempt",
  "registered",
  "company",
  "unknown",
];
const DOCUMENT_TYPES: FiscalDocumentType[] = [
  "quote",
  "proforma",
  "transaction_invoice",
  "tax_invoice",
  "receipt",
  "invoice_receipt",
  "credit_note",
  "correction",
];

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  name: string,
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new TypeError(`${name} contains unsupported field: ${key}`);
  for (const key of required)
    if (!(key in value)) throw new TypeError(`${name}.${key} is required`);
}

function text(value: unknown, name: string, maximum = 500): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)
  ) {
    throw new TypeError(
      `${name} must be a valid string of at most ${maximum} characters`,
    );
  }
  return value.trim();
}

function nonBlank(value: unknown, name: string, maximum = 500): string {
  const cleaned = text(value, name, maximum);
  if (!cleaned) throw new TypeError(`${name} cannot be blank`);
  return cleaned;
}

function money(value: unknown, name: string, canBeZero = true): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < (canBeZero ? 0 : 1) ||
    (value as number) > MAX_DOCUMENT_AGOROT
  ) {
    throw new RangeError(
      `${name} must be an integer agorot amount within the document limit`,
    );
  }
  return value as number;
}

function isoDate(
  value: unknown,
  name: string,
  optional = false,
): string | undefined {
  if (value === undefined && optional) return undefined;
  const date = nonBlank(value, name, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      date,
    ) ||
    Number.isNaN(Date.parse(date))
  ) {
    throw new TypeError(
      `${name} must be a full ISO-8601 timestamp with timezone`,
    );
  }
  return date;
}

function address(
  value: unknown,
  name: string,
  optional = false,
): BusinessIdentitySnapshot["address"] | undefined {
  if (value === undefined && optional) return undefined;
  const source = record(value, name);
  onlyKeys(source, ["street", "city", "postal_code", "country"], [], name);
  return {
    street: text(source.street, `${name}.street`, 200),
    city: text(source.city, `${name}.city`, 100),
    postal_code: text(source.postal_code, `${name}.postal_code`, 30),
    country: text(source.country, `${name}.country`, 80),
  };
}

function identity(value: unknown): BusinessIdentitySnapshot {
  const source = record(value, "identity_snapshot");
  onlyKeys(
    source,
    [
      "legal_name",
      "trade_name",
      "entity_kind",
      "registration_number",
      "vat_number",
      "address",
      "phone",
      "email",
      "document_language",
    ],
    [],
    "identity_snapshot",
  );
  const kind = source.entity_kind;
  if (
    typeof kind !== "string" ||
    !ENTITY_KINDS.includes(kind as BusinessEntityKind)
  )
    throw new TypeError("identity_snapshot.entity_kind is invalid");
  if (source.document_language !== "he" && source.document_language !== "en")
    throw new TypeError("identity_snapshot.document_language must be he or en");
  return {
    legal_name: nonBlank(
      source.legal_name,
      "identity_snapshot.legal_name",
      200,
    ),
    trade_name: text(source.trade_name, "identity_snapshot.trade_name", 200),
    entity_kind: kind as BusinessEntityKind,
    registration_number: text(
      source.registration_number,
      "identity_snapshot.registration_number",
      50,
    ),
    vat_number: text(source.vat_number, "identity_snapshot.vat_number", 50),
    address: address(source.address, "identity_snapshot.address")!,
    phone: text(source.phone, "identity_snapshot.phone", 60),
    email: text(source.email, "identity_snapshot.email", 254),
    document_language: source.document_language,
  };
}

function customer(value: unknown) {
  const source = record(value, "customer_snapshot");
  onlyKeys(
    source,
    ["name"],
    ["company_name", "registration_number", "address", "phone", "email"],
    "customer_snapshot",
  );
  return {
    name: nonBlank(source.name, "customer_snapshot.name", 200),
    ...(source.company_name === undefined
      ? {}
      : {
          company_name: text(
            source.company_name,
            "customer_snapshot.company_name",
            200,
          ),
        }),
    ...(source.registration_number === undefined
      ? {}
      : {
          registration_number: text(
            source.registration_number,
            "customer_snapshot.registration_number",
            50,
          ),
        }),
    ...(source.address === undefined
      ? {}
      : {
          address: address(source.address, "customer_snapshot.address", true),
        }),
    ...(source.phone === undefined
      ? {}
      : { phone: text(source.phone, "customer_snapshot.phone", 60) }),
    ...(source.email === undefined
      ? {}
      : { email: text(source.email, "customer_snapshot.email", 254) }),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

export function validateDocumentSnapshot(
  input: unknown,
): ValidatedDocumentSnapshot {
  const source = record(input, "document");
  onlyKeys(
    source,
    [
      "schema_version",
      "id",
      "type",
      "state",
      "created_at",
      "identity_snapshot",
      "customer_snapshot",
      "items",
      "currency",
      "net_agorot",
      "vat_agorot",
      "total_agorot",
      "payment_references",
    ],
    [
      "number",
      "issued_at",
      "allocation_number",
      "related_document_number",
      "note",
    ],
    "document",
  );
  if (source.schema_version !== 1)
    throw new TypeError("Unsupported document snapshot version");
  const type = source.type;
  if (
    typeof type !== "string" ||
    !DOCUMENT_TYPES.includes(type as FiscalDocumentType)
  )
    throw new TypeError("Document type is invalid");
  const state = source.state;
  if (
    ![
      "draft",
      "reserved",
      "awaiting_allocation",
      "awaiting_signature",
      "issued",
      "voided",
    ].includes(String(state))
  )
    throw new TypeError("Document state is invalid");
  if (source.currency !== "ILS")
    throw new TypeError("Only ILS document snapshots are supported");
  const business = identity(source.identity_snapshot);
  if (
    ["tax_invoice", "invoice_receipt"].includes(type) &&
    !["registered", "company"].includes(business.entity_kind)
  ) {
    throw new TypeError(
      "A tax invoice requires a confirmed registered business entity",
    );
  }
  const rawItems = source.items;
  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0 ||
    rawItems.length > 500
  )
    throw new RangeError("Document must contain between 1 and 500 items");
  const items = rawItems.map((raw, index) => {
    const row = record(raw, `items[${index}]`);
    onlyKeys(
      row,
      ["description", "quantity", "net_agorot", "vat_agorot", "gross_agorot"],
      ["unit_agorot", "discount_agorot"],
      `items[${index}]`,
    );
    const quantity = row.quantity;
    if (
      !Number.isSafeInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > 100_000
    )
      throw new RangeError(`items[${index}].quantity is invalid`);
    const net = money(row.net_agorot, `items[${index}].net_agorot`);
    const vat = money(row.vat_agorot, `items[${index}].vat_agorot`);
    const gross = money(row.gross_agorot, `items[${index}].gross_agorot`);
    if (net + vat !== gross)
      throw new RangeError(`items[${index}] net plus VAT must equal gross`);
    const unit =
      row.unit_agorot === undefined
        ? undefined
        : money(row.unit_agorot, `items[${index}].unit_agorot`, false);
    const discount =
      row.discount_agorot === undefined
        ? undefined
        : money(row.discount_agorot, `items[${index}].discount_agorot`);
    return {
      description: nonBlank(
        row.description,
        `items[${index}].description`,
        2000,
      ),
      quantity: quantity as number,
      ...(unit === undefined ? {} : { unit_agorot: unit }),
      ...(discount === undefined ? {} : { discount_agorot: discount }),
      net_agorot: net,
      vat_agorot: vat,
      gross_agorot: gross,
    };
  });
  const net = money(source.net_agorot, "net_agorot");
  const vat = money(source.vat_agorot, "vat_agorot");
  const total = money(source.total_agorot, "total_agorot", false);
  const sums = items.reduce(
    (acc, item) => ({
      net: acc.net + item.net_agorot,
      vat: acc.vat + item.vat_agorot,
      total: acc.total + item.gross_agorot,
    }),
    { net: 0, vat: 0, total: 0 },
  );
  if (
    !Number.isSafeInteger(sums.net) ||
    !Number.isSafeInteger(sums.vat) ||
    !Number.isSafeInteger(sums.total) ||
    sums.net !== net ||
    sums.vat !== vat ||
    sums.total !== total ||
    net + vat !== total
  ) {
    throw new RangeError(
      "Document totals must exactly match the immutable line totals",
    );
  }
  if (
    !Array.isArray(source.payment_references) ||
    source.payment_references.length > 100
  )
    throw new TypeError(
      "payment_references must be an array of at most 100 entries",
    );
  const paymentReferences = source.payment_references.map((raw, index) => {
    const row = record(raw, `payment_references[${index}]`);
    onlyKeys(
      row,
      ["method", "amount_agorot"],
      ["reference", "collected_at"],
      `payment_references[${index}]`,
    );
    const amount = money(
      row.amount_agorot,
      `payment_references[${index}].amount_agorot`,
      false,
    );
    return {
      method: nonBlank(row.method, `payment_references[${index}].method`, 40),
      amount_agorot: amount,
      ...(row.reference === undefined
        ? {}
        : {
            reference: text(
              row.reference,
              `payment_references[${index}].reference`,
              160,
            ),
          }),
      ...(row.collected_at === undefined
        ? {}
        : {
            collected_at: isoDate(
              row.collected_at,
              `payment_references[${index}].collected_at`,
            ),
          }),
    };
  });
  if (type === "receipt" && paymentReferences.length === 0)
    throw new TypeError(
      "A receipt must reference at least one recorded payment",
    );
  const id = nonBlank(source.id, "id", 120);
  const document: FiscalDocumentSnapshot = {
    schema_version: 1,
    id,
    type: type as FiscalDocumentType,
    state: state as FiscalDocumentSnapshot["state"],
    ...(source.number === undefined
      ? {}
      : { number: nonBlank(source.number, "number", 80) }),
    created_at: isoDate(source.created_at, "created_at")!,
    ...(source.issued_at === undefined
      ? {}
      : { issued_at: isoDate(source.issued_at, "issued_at")! }),
    identity_snapshot: business,
    customer_snapshot: customer(source.customer_snapshot),
    items,
    currency: "ILS",
    net_agorot: net,
    vat_agorot: vat,
    total_agorot: total,
    ...(source.allocation_number === undefined
      ? {}
      : {
          allocation_number: nonBlank(
            source.allocation_number,
            "allocation_number",
            100,
          ),
        }),
    payment_references: paymentReferences,
    ...(source.related_document_number === undefined
      ? {}
      : {
          related_document_number: nonBlank(
            source.related_document_number,
            "related_document_number",
            80,
          ),
        }),
    ...(source.note === undefined
      ? {}
      : { note: text(source.note, "note", 4000) }),
  };
  if (document.state === "issued" && (!document.number || !document.issued_at))
    throw new TypeError(
      "Issued documents require their persisted number and issue timestamp",
    );
  const frozen = deepFreeze(document);
  const canonicalJson = JSON.stringify(canonicalize(frozen));
  const canonicalHash = createHash("sha256")
    .update(canonicalJson)
    .digest("hex");
  return Object.freeze({ document: frozen, canonicalJson, canonicalHash });
}
