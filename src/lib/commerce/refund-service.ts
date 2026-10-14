import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCommerceRuntime } from "./config";
import { CommerceError, checkRpcError } from "./http";

/** Read-only reconciliation of the same refund marker. Never submit a refund. */
export async function reconcileRefund(refundId: string) {
  const runtime = loadCommerceRuntime();
  const admin = createAdminClient();
  const found = await admin
    .from("payment_refunds")
    .select("id,attempt_id,amount_agorot,state,provider_refund_uid")
    .eq("id", refundId)
    .single();
  checkRpcError(found.error);
  const refund = found.data;
  if (!refund) throw new CommerceError("not_found", 404);
  if (refund.state === "succeeded")
    return { refund_id: refundId, state: "succeeded", replayed: true };
  const payment = await admin
    .from("payment_attempts")
    .select("provider,environment,merchant_ref")
    .eq("id", refund.attempt_id)
    .single();
  checkRpcError(payment.error);
  const attempt = payment.data;
  if (
    !attempt ||
    attempt.provider !== runtime.gateway.provider ||
    attempt.environment !== runtime.environment ||
    attempt.merchant_ref !== runtime.merchantRef
  )
    throw new CommerceError("provider_binding_mismatch", 409);
  const snapshot = await runtime.gateway.queryRefund({
    effectKey: refund.id,
    ...(refund.provider_refund_uid
      ? { providerRefundId: refund.provider_refund_uid }
      : {}),
  });
  if (
    snapshot.state === "unknown" ||
    snapshot.transactionKind !== "refund" ||
    snapshot.amountMinor !== refund.amount_agorot ||
    snapshot.currency !== "ILS" ||
    snapshot.requestReference !== refund.id ||
    !snapshot.refundId ||
    (snapshot.merchantReference &&
      snapshot.merchantReference !== runtime.providerMerchantId)
  )
    throw new CommerceError("refund_reconciliation_required", 409);
  const payload = {
    verified: true,
    verification_source: "server_query",
    provider: attempt.provider,
    environment: attempt.environment,
    merchant_ref: attempt.merchant_ref,
    amount_agorot: snapshot.amountMinor,
    refund_uid: snapshot.refundId,
    state: snapshot.state,
  };
  const eventKey = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const applied = await admin.rpc("commerce_refund_result", {
    p_refund_id: refundId,
    p_event_key: `query:${refundId}:${eventKey}`,
    p_result: payload,
  });
  checkRpcError(applied.error);
  return applied.data;
}
