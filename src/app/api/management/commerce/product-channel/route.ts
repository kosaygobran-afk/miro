import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  requireCommerceActor,
  readCommerceJson,
  checkRpcError,
} from "@/lib/commerce/http";
const channels = z.enum([
  "contact_only",
  "pos_only",
  "online_checkout",
  "pos_and_online",
]);
export async function GET(request: Request) {
  try {
    await requireCommerceActor(request, "manageCatalog");
    const id = z
      .string()
      .uuid()
      .safeParse(new URL(request.url).searchParams.get("product_id"));
    if (!id.success) throw new CommerceError("invalid_input");
    const result = await createAdminClient()
      .from("products")
      .select("id,sales_channel,updated_at")
      .eq("id", id.data)
      .maybeSingle();
    checkRpcError(result.error);
    if (!result.data) throw new CommerceError("not_found", 404);
    return commerceJson(result.data);
  } catch (error) {
    return commerceFailure(error, "read_product_channel");
  }
}
export async function POST(request: Request) {
  try {
    const { client } = await requireCommerceActor(request, "manageSettings");
    const input = z
      .object({
        product_id: z.string().uuid(),
        channel: channels,
        expected_updated_at: z.string().datetime({ offset: true }),
      })
      .strict()
      .safeParse(await readCommerceJson(request));
    if (!input.success) throw new CommerceError("invalid_input");
    const result = await client.rpc("commerce_set_product_channel", {
      p_product_id: input.data.product_id,
      p_channel: input.data.channel,
      p_expected_updated_at: input.data.expected_updated_at,
    });
    checkRpcError(result.error);
    return commerceJson(result.data);
  } catch (error) {
    return commerceFailure(error, "save_product_channel");
  }
}
