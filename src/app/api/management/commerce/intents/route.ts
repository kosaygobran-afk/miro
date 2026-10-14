import { createIntentSchema } from "@/lib/commerce/validation";
import { GET as readCommerceSection } from "../[section]/route";
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
    const input = createIntentSchema.safeParse(await readCommerceJson(request));
    if (!input.success || input.data.channel !== "pos")
      throw new CommerceError("invalid_input");
    const result = await client.rpc("commerce_create_intent", {
      p_payload: input.data,
    });
    checkRpcError(result.error);
    return commerceJson(result.data);
  } catch (error) {
    return commerceFailure(error, "create_pos_intent");
  }
}
export async function GET(request: Request) {
  return readCommerceSection(request, {
    params: Promise.resolve({ section: "intents" }),
  });
}
