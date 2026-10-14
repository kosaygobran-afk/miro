import { manualTenderSchema } from "@/lib/commerce/validation";
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
    const { client } = await requireCommerceActor(request, "recordSale");
    const input = manualTenderSchema.safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    if (
      input.data.method === "cash" &&
      (input.data.cash_received_agorot ?? input.data.amount_agorot) <
        input.data.amount_agorot
    )
      throw new CommerceError("insufficient_cash");
    const result = await client.rpc("commerce_start_attempt", {
      p_payload: { ...input.data, collection_kind: "manual_recorded" },
    });
    checkRpcError(result.error);
    return commerceJson({
      ...result.data,
      collection_kind: "manual_recorded",
      change_agorot:
        input.data.method === "cash"
          ? (input.data.cash_received_agorot ?? input.data.amount_agorot) -
            input.data.amount_agorot
          : 0,
    });
  } catch (error) {
    return commerceFailure(error, "record_tender");
  }
}
