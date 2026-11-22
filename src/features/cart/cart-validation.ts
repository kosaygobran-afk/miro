import { z } from "zod";

const optionalCartOfferSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    kind: z.enum(["complementary", "accompanying"]),
    label: z.string().max(300),
    productId: z.string().uuid(),
    variantId: z.string().uuid(),
    name: z.string().min(1).max(300),
    sku: z.string().max(200),
    slug: z.string().min(1).max(200),
    category: z.string().max(200),
    imageUrl: z.string().max(2000).nullable(),
    unitPrice: z.number().finite().positive(),
  })
  .strict();

export const checkoutCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  unitPrice: z.number().finite().nonnegative(),
  quantity: z.number().int().min(1).max(99),
  lineId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9:_-]+$/)
    .optional(),
  optionalOffers: z.array(optionalCartOfferSchema).max(99).optional(),
});

export const cartItemSchema = checkoutCartItemSchema.extend({
  category: z.string().min(1).max(200),
  imageUrl: z.string().max(2000).nullable(),
});
