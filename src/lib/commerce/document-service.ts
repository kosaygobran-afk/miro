import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRpcError, CommerceError } from "./http";
import {
  renderDraftDocument,
  renderDraftHtml,
  type DocumentLayout,
} from "./documents/renderer";
import { pdfSha256 } from "./documents/renderer";
import { COMMERCE_PRIVATE_BUCKET } from "./attachments";
import type {
  FiscalDocumentSnapshot,
  FiscalDocumentType,
} from "./documents/types";

type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
/** Translate the stored immutable SQL snapshot, never current settings/catalog. */
export function documentSnapshotFromRow(row: Row): FiscalDocumentSnapshot {
  if (row.state !== "draft")
    throw new CommerceError("document_preview_unavailable", 409);
  const business = object(row.business_snapshot);
  if (!text(business.legal_name).trim())
    throw new CommerceError("business_identity_required", 409);
  const address = object(business.address);
  const customer = object(row.customer_snapshot);
  const customerAddress =
    typeof customer.address === "string"
      ? { street: customer.address }
      : object(customer.address);
  const snapshot = object(row.document_snapshot);
  const language = business.document_language === "en" ? "en" : "he";
  const kind = ["exempt", "registered", "company"].includes(
    text(business.entity_kind),
  )
    ? (business.entity_kind as "exempt" | "registered" | "company")
    : "unknown";
  const type =
    row.document_type === "invoice"
      ? "transaction_invoice"
      : (row.document_type as FiscalDocumentType);
  return {
    schema_version: 1,
    id: text(row.id),
    type,
    state: "draft",
    created_at: text(row.created_at),
    identity_snapshot: {
      legal_name: text(business.legal_name),
      trade_name: text(business.trade_name),
      entity_kind: kind,
      registration_number: text(business.registration_number),
      vat_number: text(business.vat_number),
      address: {
        street: text(address.street),
        city: text(address.city),
        postal_code: text(address.postal_code),
        country: text(address.country) || "IL",
      },
      phone: text(business.phone),
      email: text(business.email),
      document_language: language,
    },
    customer_snapshot: {
      name: text(customer.name),
      ...(customer.company_name
        ? { company_name: text(customer.company_name) }
        : {}),
      ...(Object.keys(customerAddress).length
        ? {
            address: {
              street: text(customerAddress.street),
              city: text(customerAddress.city),
              postal_code: text(customerAddress.postal_code),
              country: text(customerAddress.country),
            },
          }
        : {}),
      ...(customer.email ? { email: text(customer.email) } : {}),
      ...(customer.phone ? { phone: text(customer.phone) } : {}),
      ...(customer.business_number
        ? { registration_number: text(customer.business_number) }
        : {}),
    },
    currency: "ILS",
    net_agorot: Number(row.subtotal_agorot),
    vat_agorot: Number(row.vat_agorot),
    total_agorot: Number(row.total_agorot),
    items: (Array.isArray(snapshot.items) ? snapshot.items : []).map(
      (value) => {
        const item = object(value);
        return {
          description:
            text(item.description) ||
            text(
              language === "he"
                ? (item.product_name_he ?? item.name_he)
                : (item.product_name_en ?? item.name_en),
            ),
          quantity: Number(item.quantity),
          ...(item.unit_price_agorot
            ? { unit_agorot: Number(item.unit_price_agorot) }
            : {}),
          ...(item.discount_agorot
            ? { discount_agorot: Number(item.discount_agorot) }
            : {}),
          net_agorot: Number(item.net_agorot),
          vat_agorot: Number(item.vat_agorot),
          gross_agorot: Number(item.gross_agorot),
        };
      },
    ),
    payment_references: (Array.isArray(snapshot.payment_references)
      ? snapshot.payment_references
      : []
    )
      .filter((value) =>
        ["paid", "captured", "partially_refunded", "refunded"].includes(
          text(object(value).status),
        ),
      )
      .map((value) => {
        const item = object(value);
        return {
          method: text(item.method),
          amount_agorot: Number(item.amount_agorot),
          reference: `${item.collection_kind === "manual_recorded" ? (language === "he" ? "תשלום שנרשם ידנית · " : "Manually recorded · ") : ""}${text(item.reference)}`,
        };
      }),
    ...(snapshot.note ? { note: text(snapshot.note) } : {}),
  };
}

export async function readDraftDocument(id: string) {
  const admin = createAdminClient();
  const result = await admin
    .from("fiscal_documents")
    .select(
      "id,document_type,state,created_at,business_snapshot,customer_snapshot,subtotal_agorot,vat_agorot,total_agorot,document_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  checkRpcError(result.error);
  if (!result.data) throw new CommerceError("not_found", 404);
  return documentSnapshotFromRow(result.data);
}
export async function renderStoredDraft(id: string, layout: DocumentLayout) {
  return renderDraftDocument(await readDraftDocument(id), layout);
}
export async function renderStoredDraftHtml(id: string) {
  return renderDraftHtml(await readDraftDocument(id));
}

/** Idempotent private preview artifact; a render never assigns a fiscal number. */
export async function persistDraftArtifact(
  id: string,
  layout: DocumentLayout = "a4",
) {
  const admin = createAdminClient();
  const rendered = await renderStoredDraft(id, layout);
  const storageKey = `documents/${id}/${rendered.sourceHash}-${layout}.pdf`;
  const prior = await admin
    .from("fiscal_document_artifacts")
    .select("id,sha256,storage_key")
    .eq("document_id", id)
    .eq("storage_key", storageKey)
    .maybeSingle();
  checkRpcError(prior.error);
  if (prior.data) return prior.data;
  let bytes = rendered.pdfBytes;
  const uploaded = await admin.storage
    .from(COMMERCE_PRIVATE_BUCKET)
    .upload(storageKey, bytes, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false,
    });
  if (uploaded.error) {
    // A lost upload acknowledgement is reconciled by reading the same private
    // immutable key; an existing original is never overwritten.
    const existing = await admin.storage
      .from(COMMERCE_PRIVATE_BUCKET)
      .download(storageKey);
    if (existing.error || !existing.data)
      throw new CommerceError("document_artifact_unavailable", 503);
    bytes = new Uint8Array(await existing.data.arrayBuffer());
  }
  const registered = await admin.rpc("commerce_register_document_artifact", {
    p_payload: {
      document_id: id,
      artifact_kind: "preview_pdf",
      storage_key: storageKey,
      mime_type: "application/pdf",
      byte_size: bytes.length,
      sha256: pdfSha256(bytes),
    },
  });
  checkRpcError(registered.error);
  return registered.data;
}
