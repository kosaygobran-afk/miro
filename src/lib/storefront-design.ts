import { z } from "zod";

// Shared public contract: no credentials, contact details, costs or private settings.
const imageUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    if (/^\/images\/[a-zA-Z0-9/_.,-]+$/.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a local /images/ path or an HTTPS image URL");
const slide = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(100),
    imageUrl,
    enabled: z.boolean(),
  })
  .strict();
const brand = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    imageUrl,
    enabled: z.boolean(),
  })
  .strict();
export const storefrontDesignSchema = z
  .object({
    version: z.literal(1),
    hero: z
      .object({
        enabled: z.boolean(),
        intervalSeconds: z.number().int().min(5).max(60),
        transition: z.enum(["fade", "slide", "zoom", "none"]),
        transitionMs: z.number().int().min(150).max(1500),
        slides: z.array(slide).min(1).max(20),
      })
      .strict(),
    brands: z
      .object({
        enabled: z.boolean(),
        durationSeconds: z.number().int().min(15).max(120),
        items: z.array(brand).max(24),
      })
      .strict(),
    products: z
      .object({
        pixelsPerSecond: z.number().int().min(15).max(60),
        hoverDelayMs: z.number().int().min(120).max(600),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [path, items] of [
      ["hero", value.hero.slides],
      ["brands", value.brands.items],
    ] as const) {
      if (new Set(items.map((item) => item.id)).size !== items.length)
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "IDs must be unique",
        });
    }
    if (!value.hero.slides.some((slide) => slide.enabled))
      ctx.addIssue({
        code: "custom",
        path: ["hero", "slides"],
        message: "Keep at least one background enabled",
      });
  });
export type StorefrontDesign = z.infer<typeof storefrontDesignSchema>;
export const defaultStorefrontDesign: StorefrontDesign = {
  version: 1,
  hero: {
    enabled: true,
    intervalSeconds: 10,
    transition: "fade",
    transitionMs: 650,
    slides: ["security", "network", "access", "infrastructure", "smart"].map(
      (id) => ({
        id,
        title: id[0].toUpperCase() + id.slice(1),
        imageUrl: `/images/store-design/hero-${id}.webp`,
        enabled: true,
      }),
    ),
  },
  brands: {
    enabled: true,
    durationSeconds: 38,
    items: [
      ["ibm", "IBM"],
      ["tplink", "TP-Link"],
      ["ubiquiti", "Ubiquiti"],
      ["hikvision", "Hikvision"],
      ["ajax", "Ajax"],
      ["seagate", "Seagate"],
      ["western-digital", "Western Digital"],
      ["dahua", "Dahua"],
    ].map(([id, name]) => ({
      id,
      name,
      imageUrl: `/images/brands/${id}.svg`,
      enabled: true,
    })),
  },
  products: { pixelsPerSecond: 32, hoverDelayMs: 200 },
};
