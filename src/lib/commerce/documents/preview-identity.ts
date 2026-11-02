import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CommerceError, checkRpcError } from "../http";
import type {
  BusinessIdentitySnapshot,
  DocumentLanguage,
  FiscalDocumentType,
} from "./types";

const safeText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .refine(
      (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value),
    )
    .nullish()
    .transform((value) => value ?? "");

// Select only printable identity fields. Settings may contain unrelated metadata;
// none of it belongs in the sample, response, artifact or current-identity cache.
const printableIdentity = z.object({
  legal_name: safeText(200),
  trade_name: safeText(200),
  entity_kind: z
    .enum(["unknown", "exempt", "registered", "company"])
    .nullish()
    .transform((value) => value ?? "unknown"),
  registration_number: safeText(50),
  vat_number: safeText(50),
  address: z
    .object({
      street: safeText(300),
      city: safeText(100),
      postal_code: safeText(30),
      country: safeText(80),
    })
    .nullish(),
  phone: safeText(60),
  email: safeText(254),
});

/** Latest read-only settings projection; never substitute for a saved snapshot. */
export async function readCurrentPreviewIdentity(
  client: SupabaseClient,
  type: FiscalDocumentType,
  language: DocumentLanguage,
): Promise<BusinessIdentitySnapshot> {
  const { data, error } = await client.rpc("commerce_read", {
    p_section: "settings",
    p_filters: {},
  });
  checkRpcError(error);
  const envelope = z
    .object({ rows: z.array(z.object({ identity: z.unknown() })).min(1) })
    .safeParse(data);
  if (!envelope.success)
    throw new CommerceError("business_identity_required", 409);
  const parsed = printableIdentity.safeParse(envelope.data.rows[0].identity);
  if (!parsed.success)
    throw new CommerceError("business_identity_invalid", 409);
  const business = parsed.data;
  if (!business.legal_name)
    throw new CommerceError("business_identity_required", 409);
  if (
    ["tax_invoice", "invoice_receipt"].includes(type) &&
    !["registered", "company"].includes(business.entity_kind)
  )
    throw new CommerceError("business_identity_document_type_unavailable", 409);
  return {
    ...business,
    address: business.address ?? {
      street: "",
      city: "",
      postal_code: "",
      country: "",
    },
    document_language: language,
  };
}

/** Closed localized messages, never settings values or provider diagnostics. */
export function previewIdentityErrorHtml(
  code: string,
  language: DocumentLanguage,
): string {
  const he = language === "he";
  const message =
    code === "business_identity_document_type_unavailable"
      ? he
        ? "סוג העסק השמור אינו מתאים למסמך המס שנבחר. ניתן לבחור עסק פיקטיבי כדי לבדוק את התבנית."
        : "The saved business type is not eligible for this tax document. Choose a fictional business to review this template."
      : code === "business_identity_required"
        ? he
          ? "שמרו את פרטי העסק במסך זהות עסקית ושילובים, ולאחר מכן פתחו שוב את התצוגה. ניתן גם לבחור עסק פיקטיבי לבדיקה."
          : "Save your business details in Identity & integrations, then reopen this preview. You can also choose a fictional business for testing."
        : he
          ? "בדקו ועדכנו את פרטי העסק השמורים, ולאחר מכן פתחו שוב את התצוגה. לא בוצע שינוי בפרטים או במספור."
          : "Review and update the saved business details, then reopen this preview. No business details or numbering were changed.";
  return `<!doctype html><html lang="${language}" dir="${he ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${he ? "נדרשת בדיקת פרטי העסק" : "Review business details"}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#17202a;background:#f4f6f8;margin:0;padding:24px}main{max-width:640px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #d8dee6;border-radius:12px}h1{font-size:24px}a{color:#174d57}</style></head><body><main><h1>${he ? "נדרשת בדיקת פרטי העסק" : "Review business details"}</h1><p>${message}</p><a href="/${language}/admin/integrations">${he ? "פתיחת זהות עסקית ושילובים" : "Open Identity & integrations"}</a></main></body></html>`;
}
