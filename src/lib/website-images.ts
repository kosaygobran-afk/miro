import { z } from "zod";

export const WEBSITE_GALLERY_KEYS = [
  "home",
  "services",
  "serviceDetails",
] as const;
export const MAX_WEBSITE_GALLERY_IMAGES = 24;
export const HOME_HERO_IMAGE = "/images/security-studio.png";

export const websiteImageUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (/^\/(images|website-photos)\/[a-zA-Z0-9_/.,-]+$/.test(value)) {
      return value
        .slice(1)
        .split("/")
        .every((segment) => segment && segment !== "." && segment !== "..");
    }
    if (!/^https:\/\/[^\s\\]+$/i.test(value)) return false;
    try {
      const url = new URL(value);
      return (
        !url.username && !url.password && !value.split("/")[2]?.includes("@")
      );
    } catch {
      return false;
    }
  }, "Use a local website image or an HTTPS image URL")
  .transform((value) => (value.startsWith("/") ? value : new URL(value).href))
  .pipe(z.string().max(2048));

const galleryImageSchema = z.strictObject({
  url: websiteImageUrlSchema,
  altHe: z.string().trim().min(1).max(180),
  altEn: z.string().trim().min(1).max(180),
  fit: z.enum(["cover", "contain"]),
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
  zoom: z.number().min(1).max(2),
});

const gallerySchema = z.strictObject({
  images: z.array(galleryImageSchema).max(MAX_WEBSITE_GALLERY_IMAGES),
  animation: z.enum(["flip-up", "swipe-left", "fade", "none"]),
  effect: z.enum(["natural", "warm", "mono"]),
  autoplay: z.boolean(),
  interval: z.number().int().min(5).max(30),
  radius: z.number().int().min(0).max(32),
  border: z.number().int().min(0).max(6),
});

export const websiteImageSlotKeySchema = z
  .string()
  .max(100)
  .regex(/^(home-hero|service-[a-z0-9]+(?:-[a-z0-9]+)*)$/);

export const websiteImagesSchema = z.strictObject({
  galleries: z.strictObject({
    home: gallerySchema,
    services: gallerySchema,
    serviceDetails: gallerySchema,
  }),
  overrides: z
    .record(
      websiteImageSlotKeySchema,
      z.union([websiteImageUrlSchema, z.literal("")]),
    )
    .refine((value) => Object.keys(value).length <= 120),
});

export type WebsiteImages = z.infer<typeof websiteImagesSchema>;
export type WebsiteGallerySettings = z.infer<typeof gallerySchema>;
export type WebsiteGalleryImage = z.infer<typeof galleryImageSchema>;

function photo(
  number: number,
  altHe: string,
  altEn: string,
  y = 50,
): WebsiteGalleryImage {
  return {
    url: `/website-photos/img-${number}.webp`,
    altHe,
    altEn,
    fit: "contain",
    x: 50,
    y,
    zoom: 1,
  };
}

export const defaultWebsiteImages: WebsiteImages = {
  galleries: {
    home: {
      animation: "flip-up",
      effect: "natural",
      autoplay: true,
      interval: 8,
      border: 1,
      radius: 16,
      images: [
        photo(
          4808,
          "טכנאי מירו בעבודת התקנה",
          "MIRO technician at work on an installation",
          27,
        ),
        photo(
          4807,
          "כלי העבודה של מירו מוכנים באתר ההתקנה",
          "MIRO tools ready at an installation site",
          77,
        ),
        photo(
          4810,
          "טכנאי מירו מחבר ציוד תקשורת",
          "MIRO technician connecting network equipment",
          57,
        ),
        photo(
          4805,
          "ציוד מצלמות, אינטרקום ורשת לקראת התקנה",
          "Camera, intercom and network equipment ready for installation",
          64,
        ),
        photo(
          4804,
          "גרפיקה של מירו עם ציוד מיגון ותקשורת",
          "MIRO artwork featuring security and communications equipment",
          50,
        ),
      ],
    },
    services: {
      animation: "swipe-left",
      effect: "natural",
      autoplay: true,
      interval: 8,
      border: 1,
      radius: 16,
      images: [
        photo(
          4817,
          "שתי מצלמות אבטחה מותקנות מתחת לגג",
          "Two security cameras mounted below a roof",
          58,
        ),
        photo(
          4806,
          "מצלמות חוץ מותקנות על עמוד",
          "Outdoor cameras mounted on a post",
          75,
        ),
        photo(
          4816,
          "צג מצלמות אבטחה מותקן בקיר",
          "Wall-mounted security camera display",
          53,
        ),
        photo(
          4818,
          "עמדת צפייה של מערכת מצלמות אבטחה",
          "Security camera monitoring workstation",
          45,
        ),
        photo(
          4819,
          "גרפיקה של מירו עם מערכת אזעקה",
          "MIRO artwork featuring an alarm system",
          50,
        ),
      ],
    },
    serviceDetails: {
      animation: "flip-up",
      effect: "natural",
      autoplay: true,
      interval: 8,
      border: 1,
      radius: 16,
      images: [
        photo(
          4809,
          "טכנאי עובד על חיווט ארון תקשורת",
          "Technician wiring a network cabinet",
          55,
        ),
        photo(
          4813,
          "ארון תקשורת עם מתג וכבלי רשת",
          "Network cabinet with a switch and patch cables",
          77,
        ),
        photo(
          4814,
          "תשתיות תקשורת בתוך ארון קיר",
          "Communications equipment inside a wall cabinet",
          60,
        ),
        photo(
          4815,
          "נקודת חיבור בארון תשתיות תקשורת",
          "Connection point inside a communications cabinet",
          38,
        ),
        photo(
          4812,
          "מתגים וכבלי רשת מוכנים להבאה לאתר",
          "Network switches and cables packed for transport",
          66,
        ),
        photo(
          4811,
          "ציוד גיבוי חשמל ורשת לקראת התקנה",
          "Power backup and network equipment ready for installation",
          65,
        ),
      ],
    },
  },
  overrides: {},
};
