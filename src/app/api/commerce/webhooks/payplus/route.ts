import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { loadCommerceRuntime } from "@/lib/commerce/config";
import { ProviderProtocolError } from "@/lib/commerce/payments";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  readBoundedBody,
  checkRpcError,
} from "@/lib/commerce/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const configured = loadCommerceRuntime();
    const notification = configured.gateway.verifyNotification(
      await readBoundedBody(request),
      request.headers,
    );
    if (!z.string().uuid().safeParse(notification.attemptReference).success)
      throw new CommerceError("unbound_notification", 400);
    const admin = createAdminClient();
    const result = await admin.rpc("commerce_queue_notification", {
      p_attempt_id: notification.attemptReference,
      p_event_key: notification.fingerprint,
      p_reference: {
        signature_verified: true,
        provider: configured.gateway.provider,
        environment: configured.environment,
        merchant_ref: configured.merchantRef,
        event_type: "provider_notification",
        raw_body_hash: notification.fingerprint,
      },
    });
    checkRpcError(result.error);
    return commerceJson({ accepted: true }, 202);
  } catch (error) {
    if (error instanceof ProviderProtocolError)
      return commerceFailure(
        new CommerceError("invalid_notification", 401),
        "provider_notification",
      );
    return commerceFailure(error, "provider_notification");
  }
}
