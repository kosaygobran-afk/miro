import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCommerceRuntime } from "@/lib/commerce/config";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  requireCommerceActor,
  readCommerceJson,
  checkRpcError,
} from "@/lib/commerce/http";
import { effectKeySchema } from "@/lib/commerce/validation";
export async function POST(request: Request) {
  try {
    const { actor } = await requireCommerceActor(request, "recordSale");
    const input = z
      .object({
        intent_id: z.string().uuid(),
        effect_key: effectKeySchema,
        locale: z.enum(["he", "en"]).default("he"),
      })
      .strict()
      .safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    const configured = loadCommerceRuntime();
    const result = await createAdminClient().rpc(
      "commerce_create_payment_link",
      {
        p_intent_id: input.data.intent_id,
        p_actor_id: actor.user.id,
        p_effect_key: input.data.effect_key,
      },
    );
    checkRpcError(result.error);
    if (!result.data?.token)
      throw new CommerceError("payment_link_recovery_required", 409);
    // The fragment never reaches HTTP/access logs or the Referer header.
    return commerceJson({
      id: result.data.id,
      amount_agorot: result.data.amount_agorot,
      expires_at: result.data.expires_at,
      url: `${configured.origin}/${input.data.locale}/pay/${input.data.intent_id}#token=${result.data.token}`,
    });
  } catch (error) {
    return commerceFailure(error, "create_payment_link");
  }
}
