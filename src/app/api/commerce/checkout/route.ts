import { hasSameOrigin } from "@/lib/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import {
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import { createPublicIntentSchema } from "@/lib/commerce/validation";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  checkRpcError,
  readCommerceJson,
} from "@/lib/commerce/http";
import { storeGuestCapability } from "@/lib/commerce/checkout-service";
import { checkoutItemsDto } from "@/lib/commerce/checkout-dto";

export async function POST(request: Request) {
  try {
    if (process.env.COMMERCE_PUBLIC_CHECKOUT_ENABLED !== "true")
      throw new CommerceError("online_checkout_unavailable", 503);
    if (!hasSameOrigin(request)) throw new CommerceError("forbidden", 403);
    const parsed = createPublicIntentSchema.safeParse(
      await readCommerceJson(request),
    );
    if (!parsed.success) throw new CommerceError("invalid_input");
    const client = await createServerSupabaseClient();
    const actor = await getAuthContext(client);
    if (actor && (actor.status !== "active" || actor.role !== "customer"))
      throw new CommerceError("forbidden", 403);
    const admin = createAdminClient();
    const rate = await checkManagementRateLimit(admin, getClientIp(request));
    if (rate !== "ok")
      throw new CommerceError(
        rate === "limited" ? "rate_limited" : "commerce_unavailable",
        rate === "limited" ? 429 : 503,
      );
    const { locale, ...payload } = parsed.data;
    const result = await (actor ? client : admin).rpc(
      actor ? "commerce_create_intent" : "commerce_create_guest_intent",
      { p_payload: { ...payload, channel: "website" } },
    );
    checkRpcError(result.error);
    if (!result.data?.intent?.id)
      throw new CommerceError("commerce_unavailable", 503);
    if (!actor) {
      if (!result.data.guest_capability)
        throw new CommerceError("checkout_access_recovery_required", 409);
      await storeGuestCapability(
        result.data.intent.id,
        result.data.guest_capability,
      );
    }
    return commerceJson({
      intent: result.data.intent,
      items: checkoutItemsDto(result.data.items),
      next_url: `/${locale}/pay/${result.data.intent.id}`,
      replayed: result.data.replayed,
    });
  } catch (error) {
    return commerceFailure(error, "public_checkout");
  }
}
