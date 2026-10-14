import { z } from "zod";
import { reconcileAttempt } from "@/lib/commerce/checkout-service";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  requireCommerceActor,
  readCommerceJson,
} from "@/lib/commerce/http";
export async function POST(request: Request) {
  try {
    await requireCommerceActor(request, "viewCommerce");
    const input = z
      .object({ attempt_id: z.string().uuid() })
      .strict()
      .safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    return commerceJson(await reconcileAttempt(input.data.attempt_id));
  } catch (error) {
    return commerceFailure(error, "reconcile_payment");
  }
}
