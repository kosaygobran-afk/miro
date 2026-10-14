import { z } from "zod";
import { MAX_AGOROT } from "./money";

const id = z.string().uuid();
const short = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(1000).optional();
const revision = z.number().int().nonnegative();
export const agorotSchema = z.number().int().min(0).max(MAX_AGOROT);
export const effectKeySchema = z
  .string()
  .min(16)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");

export const customerSnapshotSchema = z
  .object({
    name: short,
    email: z.string().trim().email().max(254).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional(),
    customer_id: id.optional(),
    business_number: z.string().trim().max(30).optional(),
    address: z.string().trim().max(500).optional(),
  })
  .strict();

export const intentItemSchema = z
  .object({
    variant_id: id,
    quantity: z.number().int().min(1).max(10_000),
    discount_per_unit_agorot: agorotSchema.optional(),
  })
  .strict();

export const createIntentSchema = z
  .object({
    channel: z.enum(["pos", "website"]),
    idempotency_key: effectKeySchema,
    expected_revision: revision.optional(),
    customer_snapshot: customerSnapshotSchema,
    items: z.array(intentItemSchema).min(1).max(100),
  })
  .strict();

export const createPublicIntentSchema = createIntentSchema
  .omit({ channel: true })
  .extend({
    items: z
      .array(intentItemSchema.omit({ discount_per_unit_agorot: true }))
      .min(1)
      .max(100),
    customer_snapshot: customerSnapshotSchema.omit({ customer_id: true }),
    locale: z.enum(["he", "en"]).default("he"),
  })
  .strict();

const identitySchema = z
  .object({
    legal_name: short,
    trade_name: z.string().trim().max(200).nullable().optional(),
    entity_kind: z.enum(["exempt", "registered", "company"]).nullable(),
    registration_number: z.string().trim().max(30).nullable(),
    vat_number: z.string().trim().max(30).nullable().optional(),
    address: z
      .object({
        street: z.string().trim().max(300),
        city: z.string().trim().max(100),
        postal_code: z.string().trim().max(20),
        country: z.literal("IL"),
      })
      .strict(),
    phone: z.string().trim().max(30).nullable(),
    email: z.string().trim().email().max(254).nullable(),
    logo_storage_key: z.string().max(400).nullable().optional(),
    document_language: z.enum(["he", "en"]),
    prices_include_vat: z.boolean(),
    document_policy_version: z.string().trim().max(100),
  })
  .strict();

const expenseItem = z
  .object({
    description: short,
    quantity: z.number().int().min(1).max(10_000).default(1),
    net_agorot: agorotSchema,
    vat_agorot: agorotSchema,
    gross_agorot: agorotSchema,
  })
  .strict()
  .refine(
    (row) => row.net_agorot + row.vat_agorot === row.gross_agorot,
    "Gross must equal net plus VAT",
  );

const expenseSchema = z
  .object({
    id: id.optional(),
    expected_revision: revision.optional(),
    supplier: z
      .object({
        id: id.optional(),
        name: short,
        business_number: z.string().trim().max(30).optional(),
      })
      .strict(),
    document: z
      .object({
        reference: z.string().trim().max(200).optional(),
        document_date: date,
        expense_date: date,
        category: short,
        description: optionalText,
        currency: z.literal("ILS"),
        notes: optionalText,
        deductibility: z
          .enum(["pending", "allowed", "disallowed", "partial"])
          .default("pending"),
      })
      .strict(),
    items: z.array(expenseItem).min(1).max(100),
    // Uploaded objects are attached through their own checked server endpoint.
    attachments: z.array(z.never()).max(0).default([]),
  })
  .strict();

const tenderMethod = z.enum([
  "cash",
  "credit_card",
  "bit",
  "bank_transfer",
  "check",
  "other",
]);
const documentType = z.enum([
  "quote",
  "transaction_invoice",
  "tax_invoice",
  "receipt",
  "tax_invoice_receipt",
  "credit_note",
]);

export const commerceSections = [
  "settings",
  "integrations",
  "expenses",
  "documents",
  "drafts",
  "cash",
  "recurring",
  "intents",
  "payments",
  "report",
] as const;
export type CommerceSection = (typeof commerceSections)[number];

/** Closed action schemas: no arbitrary SQL/settings setter or monetary payload. */
export const commerceActionSchemas = {
  settings_save: z
    .object({ expected_revision: revision, patch: identitySchema.partial() })
    .strict(),
  expense_save: expenseSchema,
  expense_submit: z
    .object({ expense_id: id, expected_revision: revision })
    .strict(),
  expense_approve: z
    .object({
      expense_id: id,
      expected_revision: revision,
      decision: z.enum(["approve", "reject"]),
      note: optionalText,
    })
    .strict(),
  expense_pay: z
    .object({
      expense_id: id,
      amount_agorot: agorotSchema.refine((n) => n > 0),
      method: tenderMethod,
      effect_key: effectKeySchema,
    })
    .strict(),
  expense_void: z
    .object({ expense_id: id, expected_revision: revision, reason: short })
    .strict(),
  draft_save: z
    .object({
      id: id.optional(),
      name: short,
      expected_revision: revision.optional(),
      customer_snapshot: customerSnapshotSchema.optional(),
      items: z.array(intentItemSchema).min(1).max(100),
      expires_at: z.string().datetime({ offset: true }).optional(),
    })
    .strict(),
  draft_delete: z.object({ id, expected_revision: revision }).strict(),
  cash_open: z
    .object({ opening_float_agorot: agorotSchema, note: optionalText })
    .strict(),
  cash_movement: z
    .object({
      session_id: id,
      kind: z.enum(["cash_in", "cash_out", "correction"]),
      amount_agorot: agorotSchema.refine((n) => n > 0).optional(),
      signed_amount_agorot: z
        .number()
        .int()
        .min(-MAX_AGOROT)
        .max(MAX_AGOROT)
        .refine((n) => n !== 0)
        .optional(),
      reason: short,
      effect_key: effectKeySchema,
    })
    .strict()
    .refine(
      (value) =>
        value.kind === "correction"
          ? value.signed_amount_agorot !== undefined &&
            value.amount_agorot === undefined
          : value.amount_agorot !== undefined &&
            value.signed_amount_agorot === undefined,
      "Use one positive amount for cash in/out, or one signed correction",
    ),
  cash_close: z
    .object({
      session_id: id,
      expected_revision: revision,
      counted_cash_agorot: agorotSchema,
      note: optionalText,
    })
    .strict(),
  recurring_save: z
    .object({
      id: id.optional(),
      expected_revision: revision.optional(),
      name: short,
      customer_id: id.optional(),
      amount_agorot: agorotSchema.refine((n) => n > 0),
      currency: z.literal("ILS"),
      interval_months: z.number().int().min(1).max(12),
      next_charge_at: z.string().datetime({ offset: true }),
      consent_reference: short,
    })
    .strict(),
  recurring_pause: z
    .object({ id, expected_revision: revision, reason: short })
    .strict(),
  recurring_resume: z.object({ id, expected_revision: revision }).strict(),
  recurring_cancel: z
    .object({ id, expected_revision: revision, reason: short })
    .strict(),
  document_draft: z
    .object({
      order_id: id.optional(),
      intent_id: id.optional(),
      type: documentType,
      expected_business_revision: revision,
      customer_snapshot: customerSnapshotSchema.optional(),
    })
    .strict()
    .refine(
      (value) => !!value.order_id !== !!value.intent_id,
      "An order or intent is required",
    ),
  document_reserve: z
    .object({ document_id: id, expected_revision: revision })
    .strict(),
  document_correct: z
    .object({
      document_id: id,
      correction_type: z.enum(["credit_note", "receipt"]),
      reason: short,
    })
    .strict(),
} as const;

export type CommerceAction = keyof typeof commerceActionSchemas;
export const actionSections: Record<CommerceAction, CommerceSection> = {
  settings_save: "settings",
  expense_save: "expenses",
  expense_submit: "expenses",
  expense_approve: "expenses",
  expense_pay: "expenses",
  expense_void: "expenses",
  draft_save: "drafts",
  draft_delete: "drafts",
  cash_open: "cash",
  cash_movement: "cash",
  cash_close: "cash",
  recurring_save: "recurring",
  recurring_pause: "recurring",
  recurring_resume: "recurring",
  recurring_cancel: "recurring",
  document_draft: "documents",
  document_reserve: "documents",
  document_correct: "documents",
};

export const startAttemptSchema = z
  .object({
    intent_id: id,
    method: z.enum(["credit_card", "bit"]),
    idempotency_key: effectKeySchema,
    amount_agorot: agorotSchema.refine((n) => n > 0).optional(),
    installments: z.number().int().min(1).max(24).default(1),
    locale: z.enum(["he", "en"]).default("he"),
  })
  .strict()
  .refine(
    (value) => value.method !== "bit" || value.installments === 1,
    "Installments apply only to credit cards",
  );

export const manualTenderSchema = z
  .object({
    intent_id: id,
    method: tenderMethod,
    amount_agorot: agorotSchema.refine((n) => n > 0),
    cash_received_agorot: agorotSchema.optional(),
    reference: z.string().trim().max(120).optional(),
    confirmed_received: z.literal(true),
    idempotency_key: effectKeySchema,
  })
  .strict()
  .refine(
    (value) =>
      value.cash_received_agorot === undefined ||
      (value.method === "cash" &&
        value.cash_received_agorot >= value.amount_agorot),
    "Cash received applies only to cash and must cover the tender",
  );

export const refundSchema = z
  .object({
    attempt_id: id,
    amount_agorot: agorotSchema.refine((n) => n > 0),
    reason: short,
    idempotency_key: effectKeySchema,
  })
  .strict();
