import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSameOrigin } from "@/lib/request-origin";
import {
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { storeGuestCapability } from "@/lib/commerce/checkout-service";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  readCommerceJson,
  checkRpcError,
} from "@/lib/commerce/http";
export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) throw new CommerceError("forbidden", 403);
    const input = z
      .object({
        intent_id: z.string().uuid(),
        token: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict()
      .safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    const admin = createAdminClient();
    const rate = await checkManagementRateLimit(admin, getClientIp(request));
    if (rate !== "ok")
      throw new CommerceError(
        rate === "limited" ? "rate_limited" : "commerce_unavailable",
        rate === "limited" ? 429 : 503,
      );
    const result = await admin.rpc("commerce_claim_payment_link", {
      p_intent_id: input.data.intent_id,
      p_token: input.data.token,
    });
    checkRpcError(result.error);
    if (!result.data?.guest_capability)
      throw new CommerceError("not_found", 404);
    await storeGuestCapability(
      input.data.intent_id,
      result.data.guest_capability,
    );
    return commerceJson({
      intent_id: input.data.intent_id,
      expires_at: result.data.expires_at,
    });
  } catch (error) {
    return commerceFailure(error, "claim_payment_request");
  }
}
