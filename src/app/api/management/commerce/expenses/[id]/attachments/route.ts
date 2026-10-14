import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ATTACHMENT_MAX_BYTES,
  COMMERCE_PRIVATE_BUCKET,
  inspectExpenseAttachment,
} from "@/lib/commerce/attachments";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  requireCommerceActor,
  readBoundedBytes,
  checkRpcError,
} from "@/lib/commerce/http";

export const runtime = "nodejs";
const idSchema = z.string().uuid();
function checkedId(value: unknown) {
  const result = idSchema.safeParse(value);
  if (!result.success) throw new CommerceError("invalid_input");
  return result.data;
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { actor } = await requireCommerceActor(request, "manageExpenses");
    const expenseId = checkedId((await context.params).id);
    const bytes = await readBoundedBytes(
      request,
      ATTACHMENT_MAX_BYTES + 65_536,
    );
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body: bytes,
    }).formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      Array.from(form.keys()).some((key) => key !== "file")
    )
      throw new CommerceError("invalid_input");
    const payload = new Uint8Array(await file.arrayBuffer());
    const metadata = inspectExpenseAttachment(payload, file.name, file.type);
    const admin = createAdminClient();
    const expense = await admin
      .from("commerce_expenses")
      .select("id,state")
      .eq("id", expenseId)
      .maybeSingle();
    checkRpcError(expense.error);
    if (!expense.data || expense.data.state !== "draft")
      throw new CommerceError("expense_draft_required", 409);
    const storageKey = `${actor.user.id}/expenses/${expenseId}/${randomUUID()}.${metadata.extension}`;
    const upload = await admin.storage
      .from(COMMERCE_PRIVATE_BUCKET)
      .upload(storageKey, payload, {
        contentType: metadata.detected_mime,
        upsert: false,
        cacheControl: "0",
      });
    if (upload.error) throw new CommerceError("attachment_upload_failed", 503);
    const attached = await admin.rpc("commerce_expense_attachment_add", {
      p_expense_id: expenseId,
      p_actor_id: actor.user.id,
      p_metadata: { ...metadata, storage_key: storageKey },
    });
    if (attached.error) {
      // Keep uncertain writes: removing the object could break a committed record.
      checkRpcError(attached.error);
    }
    return commerceJson(attached.data);
  } catch (error) {
    return commerceFailure(error, "expense_attachment_upload");
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireCommerceActor(request, "viewCommerce");
    const expenseId = checkedId((await context.params).id);
    const attachmentId = checkedId(
      new URL(request.url).searchParams.get("attachment_id"),
    );
    const admin = createAdminClient();
    const attached = await admin
      .from("commerce_expense_attachments")
      .select("storage_key,original_name")
      .eq("expense_id", expenseId)
      .eq("id", attachmentId)
      .maybeSingle();
    checkRpcError(attached.error);
    if (!attached.data) throw new CommerceError("not_found", 404);
    const signed = await admin.storage
      .from(COMMERCE_PRIVATE_BUCKET)
      .createSignedUrl(attached.data.storage_key, 60, {
        download: attached.data.original_name,
      });
    if (signed.error) throw new CommerceError("attachment_unavailable", 503);
    return commerceJson({ url: signed.data.signedUrl, expires_in: 60 });
  } catch (error) {
    return commerceFailure(error, "expense_attachment_download");
  }
}
