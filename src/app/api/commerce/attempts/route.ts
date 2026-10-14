import { startAttemptSchema } from "@/lib/commerce/validation";
import { startHostedCheckout } from "@/lib/commerce/checkout-service";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  readCommerceJson,
} from "@/lib/commerce/http";

export async function POST(request: Request) {
  try {
    const input = startAttemptSchema.safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    return commerceJson(await startHostedCheckout(request, input.data));
  } catch (error) {
    return commerceFailure(error, "start_payment");
  }
}
