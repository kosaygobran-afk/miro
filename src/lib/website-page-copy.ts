import { z } from "zod";
import { storeCopy } from "@/features/catalog/store-copy";

export const websitePageKeys = [
  "store",
  "home",
  "services",
  "about",
  "contact",
] as const;
export type WebsitePageKey = (typeof websitePageKeys)[number];

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]+$/u);

export const websitePageFieldLimits = {
  eyebrow: 100,
  title: 100,
  accent: 100,
  closing: 100,
  description: 500,
} as const;

const pageTextSchema = z.strictObject({
  eyebrow: text(websitePageFieldLimits.eyebrow),
  title: text(websitePageFieldLimits.title),
  accent: text(websitePageFieldLimits.accent),
  description: text(websitePageFieldLimits.description),
});

const pageSchema = z.strictObject({ he: pageTextSchema, en: pageTextSchema });
const homeTextSchema = pageTextSchema.extend({
  closing: text(websitePageFieldLimits.closing).optional(),
});

export const websitePageCopySchema = z.strictObject({
  store: pageSchema.optional(),
  home: z.strictObject({ he: homeTextSchema, en: homeTextSchema }).optional(),
  services: pageSchema.optional(),
  about: pageSchema.optional(),
  contact: pageSchema.optional(),
});

export type WebsitePageText = z.infer<typeof homeTextSchema>;
export type WebsitePageCopy = z.infer<typeof websitePageCopySchema>;

const storefrontText = ({
  eyebrow,
  title,
  titleAccent,
  intro,
}: typeof storeCopy.en | typeof storeCopy.he): WebsitePageText => ({
  eyebrow,
  title,
  accent: titleAccent,
  description: intro,
});

export const defaultWebsitePageCopy: Record<
  WebsitePageKey,
  Record<"he" | "en", WebsitePageText>
> = {
  store: { he: storefrontText(storeCopy.he), en: storefrontText(storeCopy.en) },
  home: {
    he: {
      eyebrow: "מירו גרופ · ציוד מיגון ותקשורת",
      title: "מצלמות, כניסה חכמה",
      accent: "ורשתות",
      closing: "לבית ולעסק.",
      description:
        "בחרו ציוד לפי מה שתרצו לראות, לחבר או לאבטח. כאן תוכלו להשוות בין סוגי הציוד ולהבין מה כדאי לבדוק לפני שמזמינים.",
    },
    en: {
      eyebrow: "MIRO Group · Security & communications",
      title: "Cameras, access",
      accent: "and networks",
      closing: "for your space.",
      description:
        "Choose equipment around the door you want to secure, the area you need to see or the room your Wi-Fi barely reaches.",
    },
  },
  services: {
    he: {
      eyebrow: "שירותי מירו גרופ",
      title: "מהציוד הראשון",
      accent: "ועד להתקנה.",
      description:
        "מעוניינים בהתקנה חדשה, בשדרוג או בתיקון? במדריך השירותים תמצאו הסבר על כל שירות ואת הפרטים שכדאי להכין לקראת הפנייה.",
    },
    en: {
      eyebrow: "MIRO Group services",
      title: "From equipment",
      accent: "to installation.",
      description:
        "Planning an installation, an upgrade or a repair? Find the service that fits, see what it covers and check which details to bring to your enquiry.",
    },
  },
  about: {
    he: {
      eyebrow: "נעים להכיר. מירו.",
      title: "טכנולוגיה שמחברת.",
      accent: "אנשים שבמרכז.",
      description:
        "הבית, העסק והדברים שחשובים לכם. מירו מחברת בין עולמות המיגון והתקשורת, עם גישה שמתחילה בהבנת המרחב וממשיכה לתכנון שלם.",
    },
    en: {
      eyebrow: "MEET MIRO",
      title: "Technology that connects.",
      accent: "People at the centre.",
      description:
        "Your home, your business and the things that matter to you. MIRO brings security and communications together, with an approach that starts by understanding the space.",
    },
  },
  contact: {
    he: {
      eyebrow: "מתחילים בחיבור אנושי",
      title: "המרחב שלכם.",
      accent: "בואו נדבר עליו.",
      description:
        "בית חדש, עסק בצמיחה או מערכת שצריכה שדרוג. ספרו לנו מה חשוב לכם, ונבנה את התמונה יחד.",
    },
    en: {
      eyebrow: "A GOOD CONNECTION STARTS WITH A CONVERSATION",
      title: "Your space.",
      accent: "Let’s talk about it.",
      description:
        "A new home, a growing business or a system that needs an upgrade. Tell us what matters to you and we can start shaping the picture.",
    },
  },
};
