import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { hasSameOrigin } from "@/lib/request-origin";
import {
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { checkRpcError, CommerceError } from "./http";
import { loadCommerceRuntime } from "./config";
import type { z } from "zod";
import type { startAttemptSchema } from "./validation";

export const capabilityCookie = (id: string) => `miro-commerce-${id}`;
export async function storeGuestCapability(id: string, capability: string) {
  (await cookies()).set(capabilityCookie(id), capability, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/commerce",
    maxAge: 1800,
  });
}

export async function authorizeCheckout(
  request: Request,
  intentId: string,
  write = false,
) {
  if (write && !hasSameOrigin(request))
    throw new CommerceError("forbidden", 403);
  const client = await createServerSupabaseClient();
  const actor = await getAuthContext(client);
  if (actor && actor.status !== "active")
    throw new CommerceError("forbidden", 403);
  const admin = createAdminClient();
  const rate = await checkManagementRateLimit(admin, getClientIp(request));
  if (rate !== "ok")
    throw new CommerceError(
      rate === "limited" ? "rate_limited" : "commerce_unavailable",
      rate === "limited" ? 429 : 503,
    );
  const { data: intent, error } = await admin
    .from("commerce_intents")
    .select(
      "id,channel,customer_id,status,revision,subtotal_agorot,discount_agorot,vat_agorot,total_agorot,currency,expires_at,finalized_order_id",
    )
    .eq("id", intentId)
    .maybeSingle();
  checkRpcError(error);
  if (!intent) throw new CommerceError("not_found", 404);
  let capability: string | null = null;
  const presentedCapability =
    (await cookies()).get(capabilityCookie(intentId))?.value ?? null;
  let scopedGuest = false;
  if (presentedCapability) {
    const checked = await client.rpc("commerce_guest_status", {
      p_intent_id: intentId,
      p_capability: presentedCapability,
    });
    if (!checked.error) {
      capability = presentedCapability;
      scopedGuest = true;
    }
  }
  if (intent.channel === "pos") {
    if (!scopedGuest && (!actor || !can(actor.role, "recordSale")))
      throw new CommerceError("not_found", 404);
  } else if (intent.customer_id) {
    if (!actor || actor.user.id !== intent.customer_id)
      throw new CommerceError("not_found", 404);
  } else {
    if (!scopedGuest) throw new CommerceError("not_found", 404);
  }
  return {
    actor: scopedGuest ? null : actor,
    client,
    admin,
    intent,
    capability,
    readOnlyExpired: Date.parse(intent.expires_at) <= Date.now(),
  };
}

export async function startHostedCheckout(
  request: Request,
  input: z.infer<typeof startAttemptSchema>,
) {
  if (input.method === "bit" && input.installments !== 1)
    throw new CommerceError("installments_unavailable", 409);
  const runtime = loadCommerceRuntime();
  if (
    runtime.gateway.capabilities[
      input.method === "bit" ? "bit" : "hostedCard"
    ] !== "enabled"
  )
    throw new CommerceError("payment_method_unavailable", 409);
  if (
    input.installments > 1 &&
    runtime.gateway.capabilities.installments !== "enabled"
  )
    throw new CommerceError("installments_unavailable", 409);
  const context = await authorizeCheckout(request, input.intent_id, true);
  const result = await context.admin.rpc("commerce_start_provider_attempt", {
    p_payload: {
      ...input,
      provider: "payplus",
      environment: runtime.environment,
      merchant_ref: runtime.merchantRef,
      collection_kind: "provider_collected",
    },
    p_actor_id: context.actor?.user.id ?? null,
    p_capability: context.capability,
  });
  checkRpcError(result.error);
  const attempt = result.data?.attempt;
  if (!attempt?.id || !Number.isSafeInteger(attempt.amount_agorot))
    throw new CommerceError("commerce_unavailable", 503);
  if (result.data.replayed) {
    const saved = await context.admin
      .from("payment_attempts")
      .select("state,request_uid,safe_metadata")
      .eq("id", attempt.id)
      .single();
    checkRpcError(saved.error);
    if (
      saved.data?.state === "pending" &&
      typeof saved.data.safe_metadata?.hosted_url === "string"
    )
      return {
        attempt_id: attempt.id,
        state: saved.data.state,
        redirect_url: saved.data.safe_metadata.hosted_url,
        replayed: true,
      };
    // Never create a second remote session after an uncertain request.
    return {
      attempt_id: attempt.id,
      state: saved.data?.state ?? "unknown",
      reconciliation_required: true,
      replayed: true,
    };
  }
  try {
    const session = await runtime.gateway.createHostedSession({
      attemptId: attempt.id,
      amountMinor: attempt.amount_agorot,
      currency: "ILS",
      method: input.method,
      locale: input.locale,
      installments: input.installments > 1 ? input.installments : undefined,
      callbackUrl: `${runtime.origin}/api/commerce/webhooks/payplus`,
      successUrl: `${runtime.origin}/${input.locale}/pay/${input.intent_id}`,
      failureUrl: `${runtime.origin}/${input.locale}/pay/${input.intent_id}`,
      cancelUrl: `${runtime.origin}/${input.locale}/pay/${input.intent_id}`,
    });
    const bound = await context.admin.rpc("commerce_bind_attempt", {
      p_attempt_id: attempt.id,
      p_request_uid: session.providerRequestId,
      p_metadata: { hosted_url: session.hostedUrl },
    });
    checkRpcError(bound.error);
    return {
      attempt_id: attempt.id,
      state: "pending",
      redirect_url: session.hostedUrl,
    };
  } catch {
    const marked = await context.admin.rpc("commerce_mark_attempt_unknown", {
      p_attempt_id: attempt.id,
      p_error_code: "session_outcome_unknown",
    });
    checkRpcError(marked.error);
    const queued = await context.admin.rpc("commerce_queue_reconciliation", {
      p_attempt_id: attempt.id,
      p_effect_key: `create-unknown-${attempt.id}`,
    });
    checkRpcError(queued.error);
    return {
      attempt_id: attempt.id,
      state: "unknown",
      reconciliation_required: true,
    };
  }
}

/** Query the server-side provider record; return URLs and webhook claims never mark paid. */
export async function reconcileAttempt(attemptId: string) {
  const runtime = loadCommerceRuntime();
  const admin = createAdminClient();
  const found = await admin
    .from("payment_attempts")
    .select(
      "id,provider,environment,merchant_ref,request_uid,transaction_uid,amount_agorot,currency,state",
    )
    .eq("id", attemptId)
    .single();
  checkRpcError(found.error);
  const attempt = found.data;
  if (
    !attempt ||
    attempt.provider !== runtime.gateway.provider ||
    attempt.environment !== runtime.environment ||
    attempt.merchant_ref !== runtime.merchantRef
  )
    throw new CommerceError("provider_binding_mismatch", 409);
  const snapshot = await runtime.gateway.queryPayment(
    attempt.request_uid
      ? { providerRequestId: attempt.request_uid }
      : { attemptReference: attempt.id },
  );
  if (
    ["unknown", "refunded", "partially_refunded"].includes(snapshot.state) ||
    snapshot.amountMinor !== attempt.amount_agorot ||
    snapshot.currency !== "ILS" ||
    snapshot.attemptReference !== attempt.id ||
    (snapshot.merchantReference &&
      snapshot.merchantReference !== runtime.providerMerchantId)
  )
    throw new CommerceError("payment_reconciliation_required", 409);
  if (snapshot.state === "captured" && !snapshot.transactionId)
    throw new CommerceError("payment_reconciliation_required", 409);
  const state = snapshot.state === "cancelled" ? "voided" : snapshot.state;
  const eventKey = createHash("sha256")
    .update(
      JSON.stringify({
        attemptId,
        state,
        transaction: snapshot.transactionId,
        amount: snapshot.amountMinor,
      }),
    )
    .digest("hex");
  const applied = await admin.rpc("commerce_provider_result", {
    p_attempt_id: attemptId,
    p_event_key: `query-${eventKey}`,
    p_result: {
      verified: true,
      verification_source: "server_query",
      provider: runtime.gateway.provider,
      environment: runtime.environment,
      merchant_ref: runtime.merchantRef,
      transaction_uid: snapshot.transactionId,
      amount_agorot: snapshot.amountMinor,
      currency: "ILS",
      state,
      transaction_kind: snapshot.transactionKind,
      safe_metadata: { query_reference: attempt.id },
    },
  });
  checkRpcError(applied.error);
  return applied.data;
}
