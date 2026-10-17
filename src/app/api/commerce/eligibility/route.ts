import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { commerceReadiness } from "@/lib/commerce/config";
import { hasSameOrigin } from "@/lib/request-origin";
import {
  checkManagementRateLimit,
  getClientIp,
} from "@/app/api/management/_shared";
import {
  CommerceError,
  commerceFailure,
  commerceJson,
  readCommerceJson,
  checkRpcError,
} from "@/lib/commerce/http";
const inputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            product_id: z.string().uuid(),
            variant_id: z.string().uuid().nullable(),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) throw new CommerceError("forbidden", 403);
    const parsed = inputSchema.safeParse(await readCommerceJson(request));
    if (!parsed.success) throw new CommerceError("invalid_input");
    const readiness = commerceReadiness();
    if (
      process.env.COMMERCE_PUBLIC_CHECKOUT_ENABLED !== "true" ||
      !readiness.configured ||
      (readiness.capabilities.hostedCard !== "enabled" &&
        readiness.capabilities.bit !== "enabled")
    )
      return commerceJson({ eligible: false });
    const admin = createAdminClient();
    const rate = await checkManagementRateLimit(admin, getClientIp(request));
    if (rate !== "ok")
      throw new CommerceError(
        rate === "limited" ? "rate_limited" : "commerce_unavailable",
        rate === "limited" ? 429 : 503,
      );
    const result = await admin
      .from("products")
      .select(
        "id,status,sales_channel,price,product_variants(id,is_default,is_active,stock_qty),categories!products_category_id_fkey(is_active)",
      )
      .in("id", [...new Set(parsed.data.items.map((item) => item.product_id))]);
    checkRpcError(result.error);
    const items = [];
    for (const item of parsed.data.items) {
      const product = result.data?.find(
        (candidate) => candidate.id === item.product_id,
      );
      if (
        !product ||
        product.status !== "active" ||
        !["online_checkout", "pos_and_online"].includes(
          product.sales_channel,
        ) ||
        !Number.isFinite(Number(product.price)) ||
        Number(product.price) <= 0
      )
        return commerceJson({ eligible: false });
      const variants = product.product_variants.filter(
        (variant) => variant.is_active,
      );
      const variant = item.variant_id
        ? variants.find((candidate) => candidate.id === item.variant_id)
        : variants.find((candidate) => candidate.is_default);
      if (!variant) return commerceJson({ eligible: false });
      items.push({ variant_id: variant.id, quantity: item.quantity });
    }
    // Advisory only: intent RPC locks and rechecks price/channel/stock atomically.
    return commerceJson({ eligible: true, items });
  } catch (error) {
    return commerceFailure(error, "checkout_eligibility");
  }
}
