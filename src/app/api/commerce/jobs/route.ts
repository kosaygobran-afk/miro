import { randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileAttempt } from "@/lib/commerce/checkout-service";
import { reconcileRefund } from "@/lib/commerce/refund-service";
import { persistDraftArtifact } from "@/lib/commerce/document-service";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  checkRpcError,
} from "@/lib/commerce/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const secret = process.env.COMMERCE_JOB_AUTH_SECRET;
    const presented = request.headers.get("authorization") ?? "";
    const expected = secret ? `Bearer ${secret}` : "";
    if (
      !secret ||
      secret.length < 32 ||
      Buffer.byteLength(presented) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
    )
      throw new CommerceError("unauthorized", 401);
    const admin = createAdminClient();
    const expired = await admin.rpc("commerce_expire_intents", {
      p_limit: 500,
    });
    checkRpcError(expired.error);
    const claim = await admin.rpc("commerce_claim_outbox", {
      p_worker_id: randomUUID(),
      p_limit: 1,
      p_lease_seconds: 120,
    });
    checkRpcError(claim.error);
    const jobs = Array.isArray(claim.data)
      ? claim.data
      : (claim.data?.rows ?? []);
    let completed = 0;
    let deferred = 0;
    for (const job of jobs) {
      let success = false;
      let code = "unsupported_effect";
      try {
        if (job.effect_type === "payment.query") {
          const result = await reconcileAttempt(
            job.payload?.attempt_id ?? job.aggregate_id,
          );
          success = [
            "captured",
            "declined",
            "voided",
            "refunded",
            "partially_refunded",
          ].includes(result?.state);
          code = "payment_pending";
        } else if (job.effect_type === "payment.refund.reconcile") {
          const result = await reconcileRefund(
            job.payload?.refund_id ?? job.aggregate_id,
          );
          success = ["succeeded", "failed"].includes(result?.state);
          code = "refund_pending";
        } else if (
          job.effect_type === "document.render_preview" ||
          (job.effect_type === "document.create" &&
            job.aggregate_type === "fiscal_document")
        ) {
          await persistDraftArtifact(
            job.payload?.document_id ?? job.aggregate_id,
          );
          success = true;
        } else if (job.effect_type === "document.create") {
          const draft = await admin.rpc(
            "commerce_create_document_draft_for_order",
            { p_order_id: job.aggregate_id },
          );
          checkRpcError(draft.error);
          success = true;
        }
      } catch (error) {
        code =
          error instanceof CommerceError
            ? error.code
            : "effect_outcome_unknown";
      }
      const finished = await admin.rpc("commerce_finish_outbox", {
        p_outbox_id: job.id,
        p_lease_token: job.lease_token,
        p_success: success,
        p_error_code: success ? null : code,
      });
      checkRpcError(finished.error);
      if (success) completed++;
      else deferred++;
    }
    return commerceJson({ completed, deferred });
  } catch (error) {
    return commerceFailure(error, "outbox_worker");
  }
}
