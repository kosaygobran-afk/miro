import { z } from "zod";

/** Public, non-personal presentation settings. Keep this contract server-safe. */
export const ANIMATION_FEATURES = [
  {
    key: "themeReveal",
    en: "Theme reveal",
    he: "חשיפת ערכת נושא",
    noteEn:
      "Reveals the selected dark, medium or light theme from the theme button. Off applies the selected theme immediately.",
    noteHe:
      "חושף את ערכת הנושא הכהה, הבינונית או הבהירה מתוך כפתור הבחירה. בכיבוי, הערכה הנבחרת חלה מיד.",
  },
  {
    key: "themeIcon",
    en: "Theme icon",
    he: "סמל ערכת הנושא",
    noteEn:
      "Adds a small coordinated rotation and fade to the theme icon. Off keeps the icon change still.",
    noteHe:
      "מוסיף סיבוב קטן ומעבר עדין לסמל ערכת הנושא. בכיבוי, הסמל משתנה ללא תנועה.",
  },
  {
    key: "navigationProgress",
    en: "Navigation progress beam",
    he: "פס התקדמות ניווט",
    noteEn:
      "Shows a thin progress beam when an internal page navigation starts. Off hides the beam; links still navigate normally.",
    noteHe:
      "מציג פס התקדמות דק בתחילת מעבר לעמוד פנימי. בכיבוי, הפס מוסתר והקישורים ממשיכים לפעול כרגיל.",
  },
  {
    key: "pageReveal",
    en: "Page reveal",
    he: "חשיפת עמוד",
    noteEn:
      "Gently reveals incoming page content while shared navigation stays in place. Off displays the page without a reveal animation.",
    noteHe:
      "חושף בעדינות את תוכן העמוד החדש בזמן שהניווט המשותף נשאר במקומו. בכיבוי, העמוד מוצג ללא הנפשה.",
  },
  {
    key: "contentReveal",
    en: "Loaded content reveal",
    he: "חשיפת תוכן שנטען",
    noteEn:
      "Fades loaded tables and dynamic regions into view. Off displays their result immediately; loading, empty and error states still work.",
    noteHe:
      "מכניס בהדרגה טבלאות ואזורים דינמיים לאחר טעינה. בכיבוי, התוצאה מוצגת מיד; מצבי טעינה, ריק ושגיאה ממשיכים לפעול.",
  },
  {
    key: "skeletonShimmer",
    en: "Loading placeholder shimmer",
    he: "תנועה במצייני טעינה",
    noteEn:
      "Adds a soft brightness pulse to structured loading placeholders. Off keeps the placeholders visible and still until loading completes.",
    noteHe:
      "מוסיף פעימת בהירות עדינה למצייני הטעינה המותאמים לתוכן. בכיבוי, המציינים נשארים גלויים וסטטיים עד סיום הטעינה.",
  },
  {
    key: "imageReveal",
    en: "Image reveal",
    he: "חשיפת תמונות",
    noteEn:
      "Fades newly decoded product and service images into their reserved space. Off shows each ready image immediately.",
    noteHe:
      "מציג בהדרגה תמונות מוצר ושירות לאחר פענוחן, בתוך המקום השמור להן. בכיבוי, כל תמונה מוכנה מוצגת מיד.",
  },
  {
    key: "dialogs",
    en: "Dialogs and drawers",
    he: "חלוניות ומגירות",
    noteEn:
      "Adds short backdrop and panel transitions when dialogs or drawers open. Off opens them immediately; focus and dismissal behavior stay active.",
    noteHe:
      "מוסיף מעבר קצר לרקע ולתוכן בעת פתיחת חלוניות ומגירות. בכיבוי, הן נפתחות מיד; ניהול המיקוד והסגירה נשאר פעיל.",
  },
  {
    key: "menus",
    en: "Menus and dropdowns",
    he: "תפריטים ורשימות נפתחות",
    noteEn:
      "Adds a short fade or slide when navigation and account menus open. Off opens them immediately with the same keyboard controls.",
    noteHe:
      "מוסיף מעבר קצר בעת פתיחת תפריטי ניווט וחשבון. בכיבוי, הם נפתחים מיד עם אותן פעולות מקלדת.",
  },
  {
    key: "buttonFeedback",
    en: "Button feedback",
    he: "משוב בכפתורים",
    noteEn:
      "Animates button press and loading feedback. Off removes the motion; saving labels, disabled states and duplicate-submit protection remain.",
    noteHe:
      "מנפיש משוב לחיצה וטעינה בכפתורים. בכיבוי, התנועה מוסרת; הודעות שמירה, מצבי השבתה והגנה משליחה כפולה נשארים.",
  },
  {
    key: "microInteractions",
    en: "Small hover and press effects",
    he: "תגובות ריחוף ולחיצה קטנות",
    noteEn:
      "Adds subtle hover and press movement to cards and interactive controls. Off keeps color, focus and active-state feedback without movement.",
    noteHe:
      "מוסיף תנועה עדינה בריחוף ובלחיצה על כרטיסים ופקדים. בכיבוי, צבעים, מיקוד ומשוב למצב פעיל נשמרים ללא תנועה.",
  },
  {
    key: "ambientMotion",
    en: "Decorative background motion",
    he: "תנועה דקורטיבית ברקע",
    noteEn:
      "Allows decorative motion, store background rotation, product strips and the brand strip. Off keeps them still. Store-design settings separately control background rotation timing and strip speeds.",
    noteHe:
      "מאפשר תנועה דקורטיבית, החלפת רקעי החנות ותנועת רצועות מוצרים ומותגים. בכיבוי, הם נשארים סטטיים. הגדרות עיצוב החנות שולטות בנפרד בתזמון החלפת הרקעים ובמהירות הרצועות.",
  },
  {
    key: "textRails",
    en: "Long-label scrolling",
    he: "גלילה של כותרות ארוכות",
    noteEn:
      "Allows display-only long labels to scroll where space is limited. Off keeps labels still; their full accessible text is retained. Input values never animate.",
    noteHe:
      "מאפשר גלילה של תוויות תצוגה ארוכות במקום מוגבל. בכיבוי, התוויות נשארות סטטיות והטקסט הנגיש המלא נשמר. ערכים בשדות קלט לעולם אינם מונפשים.",
  },
] as const;

export const ANIMATION_DURATIONS = [
  {
    key: "theme",
    en: "Theme reveal",
    he: "חשיפת ערכת נושא",
    min: 300,
    max: 500,
    default: 420,
  },
  {
    key: "icon",
    en: "Theme icon",
    he: "סמל ערכת נושא",
    min: 150,
    max: 220,
    default: 180,
  },
  {
    key: "navigation",
    en: "Navigation completion",
    he: "סיום פס הניווט",
    min: 100,
    max: 300,
    default: 180,
  },
  {
    key: "page",
    en: "Page reveal",
    he: "חשיפת עמוד",
    min: 180,
    max: 280,
    default: 220,
  },
  {
    key: "content",
    en: "Loaded content",
    he: "תוכן שנטען",
    min: 120,
    max: 220,
    default: 160,
  },
  {
    key: "skeleton",
    en: "Placeholder shimmer cycle",
    he: "מחזור תנועת מציין טעינה",
    min: 800,
    max: 2400,
    default: 1400,
  },
  {
    key: "image",
    en: "Image reveal",
    he: "חשיפת תמונות",
    min: 120,
    max: 220,
    default: 160,
  },
  {
    key: "dialog",
    en: "Dialogs and drawers",
    he: "חלוניות ומגירות",
    min: 120,
    max: 300,
    default: 200,
  },
  { key: "menu", en: "Menus", he: "תפריטים", min: 120, max: 180, default: 150 },
  {
    key: "button",
    en: "Button feedback",
    he: "משוב בכפתורים",
    min: 100,
    max: 220,
    default: 160,
  },
  {
    key: "micro",
    en: "Small interactions",
    he: "תגובות קטנות",
    min: 100,
    max: 220,
    default: 150,
  },
] as const;

const duration = (key: (typeof ANIMATION_DURATIONS)[number]["key"]) => {
  const bounds = ANIMATION_DURATIONS.find((entry) => entry.key === key)!;
  return z.number().int().min(bounds.min).max(bounds.max);
};

export const animationSettingsSchema = z
  .object({
    appearanceVersion: z.enum(["1", "2"]),
    enabled: z.boolean(),
    features: z
      .object({
        themeReveal: z.boolean(),
        themeIcon: z.boolean(),
        navigationProgress: z.boolean(),
        pageReveal: z.boolean(),
        contentReveal: z.boolean(),
        skeletonShimmer: z.boolean(),
        imageReveal: z.boolean(),
        dialogs: z.boolean(),
        menus: z.boolean(),
        buttonFeedback: z.boolean(),
        microInteractions: z.boolean(),
        ambientMotion: z.boolean(),
        textRails: z.boolean(),
      })
      .strict(),
    durations: z
      .object({
        theme: duration("theme"),
        icon: duration("icon"),
        navigation: duration("navigation"),
        page: duration("page"),
        content: duration("content"),
        skeleton: duration("skeleton"),
        image: duration("image"),
        dialog: duration("dialog"),
        menu: duration("menu"),
        button: duration("button"),
        micro: duration("micro"),
      })
      .strict(),
    themeStyle: z.enum(["radial", "fade"]),
    pageStyle: z.enum(["lift", "fade"]),
    easing: z.enum(["standard", "snappy", "soft"]),
  })
  .strict();

export type AnimationSettings = z.infer<typeof animationSettingsSchema>;
export type AnimationFeature = keyof AnimationSettings["features"];
export type AnimationDuration = keyof AnimationSettings["durations"];

export const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  appearanceVersion: "2",
  enabled: true,
  features: {
    themeReveal: true,
    themeIcon: true,
    navigationProgress: true,
    pageReveal: true,
    contentReveal: true,
    skeletonShimmer: true,
    imageReveal: true,
    dialogs: true,
    menus: true,
    buttonFeedback: true,
    microInteractions: true,
    ambientMotion: true,
    textRails: true,
  },
  durations: {
    theme: 420,
    icon: 180,
    navigation: 180,
    page: 220,
    content: 160,
    skeleton: 1400,
    image: 160,
    dialog: 200,
    menu: 150,
    button: 160,
    micro: 150,
  },
  themeStyle: "radial",
  pageStyle: "lift",
  easing: "standard",
};

export function parseAnimationSettings(value: unknown): AnimationSettings {
  const parsed = animationSettingsSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : structuredClone(DEFAULT_ANIMATION_SETTINGS);
}
