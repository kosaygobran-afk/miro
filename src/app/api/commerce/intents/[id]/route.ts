import { z } from "zod";
import { authorizeCheckout } from "@/lib/commerce/checkout-service";
import { commerceReadiness } from "@/lib/commerce/config";
import { checkoutItemsDto } from "@/lib/commerce/checkout-dto";
import { sumAgorot } from "@/lib/commerce/money";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  checkRpcError,
} from "@/lib/commerce/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .safeParse((await context.params).id);
    if (!id.success) throw new CommerceError("not_found", 404);
    const { admin, intent, actor, readOnlyExpired } = await authorizeCheckout(
      request,
      id.data,
    );
    const [attempts, items, order] = await Promise.all([
      admin
        .from("payment_attempts")
        .select("id,state,method,amount_agorot,collection_kind,idempotency_key")
        .eq("intent_id", intent.id)
        .order("created_at")
        .limit(501),
      admin
        .from("commerce_intent_items")
        .select(
          "line_no,product_id,variant_id,quantity,unit_price_agorot,discount_per_unit_agorot,discount_agorot,gross_agorot,net_agorot,vat_agorot,vat_rate,sku_snapshot,product_name_he,product_name_en",
        )
        .eq("intent_id", intent.id)
        .order("line_no")
        .limit(101),
      intent.finalized_order_id
        ? admin
            .from("orders")
            .select("order_number")
            .eq("id", intent.finalized_order_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    checkRpcError(attempts.error);
    checkRpcError(items.error);
    checkRpcError(order.error);
    if ((attempts.data?.length ?? 0) > 500)
      throw new CommerceError("payment_reconciliation_required", 409);
    const capturedAgorot = sumAgorot(
      (attempts.data ?? [])
        .filter((attempt) =>
          ["captured", "partially_refunded", "refunded"].includes(
            attempt.state,
          ),
        )
        .map((attempt) => attempt.amount_agorot),
    );
    return commerceJson({
      intent: {
        id: intent.id,
        channel: intent.channel,
        status: intent.status,
        total_agorot: intent.total_agorot,
        subtotal_agorot: intent.subtotal_agorot,
        discount_agorot: intent.discount_agorot,
        vat_agorot: intent.vat_agorot,
        revision: intent.revision,
        currency: intent.currency,
        expires_at: intent.expires_at,
        read_only_expired: readOnlyExpired === true,
        order_id: intent.finalized_order_id,
        order_number: order.data?.order_number ?? null,
        remaining_agorot: intent.finalized_order_id
          ? 0
          : Math.max(0, intent.total_agorot - capturedAgorot),
      },
      attempts: attempts.data,
      items: checkoutItemsDto(items.data),
      readiness: commerceReadiness(),
      // Only a signed-in cashier gets a console link. A verified customer
      // payment capability grants access to this intent, never console access.
      resume_pos_url: intent.channel === "pos" && actor ? "/admin/pos" : null,
    });
  } catch (error) {
    return commerceFailure(error, "checkout_status");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .safeParse((await context.params).id);
    if (!id.success) throw new CommerceError("not_found", 404);
    const { client, capability } = await authorizeCheckout(
      request,
      id.data,
      true,
    );
    const result = await client.rpc("commerce_cancel_intent", {
      p_intent_id: id.data,
      p_capability: capability,
    });
    checkRpcError(result.error);
    return commerceJson(result.data);
  } catch (error) {
    return commerceFailure(error, "cancel_checkout");
  }
}
