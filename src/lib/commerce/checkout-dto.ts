import "server-only";
import { z } from "zod";
import { CommerceError } from "./http";
import { agorotSchema } from "./validation";

// SQL snapshots also hold internal costs. An explicit projection prevents
// newly added fiscal/provider fields from reaching public checkout clients.
const checkoutItemSchema = z.object({
  line_no: z.number().int().positive(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10_000),
  unit_price_agorot: agorotSchema,
  discount_per_unit_agorot: agorotSchema,
  discount_agorot: agorotSchema,
  gross_agorot: agorotSchema,
  net_agorot: agorotSchema,
  vat_agorot: agorotSchema,
  vat_rate: z.number().min(0).max(100),
  sku_snapshot: z.string().nullable(),
  product_name_he: z.string().nullable(),
  product_name_en: z.string().nullable(),
});

export function checkoutItemsDto(value: unknown) {
  const result = z.array(checkoutItemSchema).max(100).safeParse(value);
  if (!result.success) throw new CommerceError("commerce_unavailable", 503);
  return result.data;
}
