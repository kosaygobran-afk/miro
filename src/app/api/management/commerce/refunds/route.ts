import { createAdminClient } from "@/lib/supabase/admin";
import { loadCommerceRuntime } from "@/lib/commerce/config";
import { reconcileRefund } from "@/lib/commerce/refund-service";
import { z } from "zod";
import { refundSchema } from "@/lib/commerce/validation";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  requireCommerceActor,
  readCommerceJson,
  checkRpcError,
} from "@/lib/commerce/http";
export async function POST(request: Request) {
  try {
    const { client } = await requireCommerceActor(request, "refundPayments");
    const input = refundSchema.safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    const configured = loadCommerceRuntime();
    if (configured.gateway.capabilities.partialRefund !== "enabled")
      throw new CommerceError("refund_method_unavailable", 409);
    const admin = createAdminClient();
    const found = await admin
      .from("payment_attempts")
      .select("id,transaction_uid,provider,environment,merchant_ref")
      .eq("id", input.data.attempt_id)
      .single();
    checkRpcError(found.error);
    const attempt = found.data;
    if (
      !attempt ||
      !attempt.transaction_uid ||
      attempt.provider !== configured.gateway.provider ||
      attempt.environment !== configured.environment ||
      attempt.merchant_ref !== configured.merchantRef
    )
      throw new CommerceError("provider_binding_mismatch", 409);
    const reserved = await client.rpc("commerce_request_refund", {
      p_payload: input.data,
    });
    checkRpcError(reserved.error);
    if (reserved.data?.replayed) return commerceJson(reserved.data);
    const refundId = reserved.data?.refund_id;
    if (typeof refundId !== "string")
      throw new CommerceError("commerce_unavailable", 503);
    async function unknown() {
      const marked = await admin.rpc("commerce_mark_refund_unknown", {
        p_refund_id: refundId,
      });
      checkRpcError(marked.error);
      return commerceJson({
        refund_id: refundId,
        state: marked.data?.state ?? "unknown",
        reconciliation_required: true,
      });
    }
    try {
      const result = await configured.gateway.refund({
        transactionId: attempt.transaction_uid,
        amountMinor: input.data.amount_agorot,
        effectKey: refundId,
      });
      if (result.state !== "verified") return await unknown();
      const applied = await admin.rpc("commerce_refund_result", {
        p_refund_id: refundId,
        p_event_key: `server-response:${refundId}`,
        p_result: {
          verified: true,
          verification_source: "server_response",
          provider: attempt.provider,
          environment: attempt.environment,
          merchant_ref: attempt.merchant_ref,
          amount_agorot: result.amountMinor,
          refund_uid: result.providerTransactionId,
          state: "succeeded",
        },
      });
      checkRpcError(applied.error);
      return commerceJson(applied.data);
    } catch {
      // The durable request retains its balance reservation. Never resend a
      // potentially successful refund after losing the provider/DB response.
      return await unknown();
    }
  } catch (error) {
    return commerceFailure(error, "refund_payment");
  }
}

export async function PATCH(request: Request) {
  try {
    await requireCommerceActor(request, "refundPayments");
    const input = z
      .object({ refund_id: z.string().uuid() })
      .strict()
      .safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    return commerceJson(await reconcileRefund(input.data.refund_id));
  } catch (error) {
    return commerceFailure(error, "refund_reconcile");
  }
}
