import { z } from "zod";

export const optionalOfferSchema = z
  .object({
    id: z.string().uuid().optional(),
    target_product_id: z.string().uuid(),
    target_variant_id: z.string().uuid(),
    kind: z.enum(["complementary", "accompanying"]),
    label_he: z.string().trim().max(160).nullable(),
    label_en: z.string().trim().max(160).nullable(),
    pricing_mode: z.enum(["catalog", "percent", "fixed"]),
    discount_bps: z.number().int().min(1).max(9500).nullable(),
    fixed_price_agorot: z.number().int().min(1).max(100_000_000).nullable(),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(2_147_483_647),
  })
  .strict()
  .superRefine((offer, context) => {
    const valid =
      offer.pricing_mode === "catalog"
        ? offer.discount_bps === null && offer.fixed_price_agorot === null
        : offer.pricing_mode === "percent"
          ? offer.discount_bps !== null && offer.fixed_price_agorot === null
          : offer.fixed_price_agorot !== null && offer.discount_bps === null;
    if (!valid)
      context.addIssue({
        code: "custom",
        message: "Invalid offer price configuration",
        path: ["pricing_mode"],
      });
  });

export const optionalOffersSchema = z
  .array(optionalOfferSchema)
  .superRefine((offers, context) => {
    const targets = new Set<string>();
    const ids = new Set<string>();
    offers.forEach((offer, index) => {
      const variantKey = offer.target_variant_id.toLowerCase();
      const idKey = offer.id?.toLowerCase();
      if (targets.has(variantKey) || (idKey && ids.has(idKey)))
        context.addIssue({
          code: "custom",
          message: "Duplicate linked variant or offer",
          path: [index],
        });
      targets.add(variantKey);
      if (idKey) ids.add(idKey);
    });
  });

export const optionalOffersProjectionSchema = z.object({
  revision: z.number().int().nonnegative(),
  offers: z.array(
    optionalOfferSchema
      .safeExtend({
        id: z.string().uuid(),
        parent_product_id: z.string().uuid().optional(),
        catalog_price_agorot: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .optional(),
        effective_price_agorot: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional(),
        target: z
          .object({
            id: z.string().uuid().optional(),
            name_he: z.string(),
            name_en: z.string(),
            slug: z.string(),
            status: z.string(),
            sku: z.string(),
          })
          .optional(),
      })
      .strip(),
  ),
});
