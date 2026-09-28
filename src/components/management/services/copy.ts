type LocaleCode = "he" | "en";

export const servicesCopy = {
  pageTitle: { he: "שירותים", en: "Services" },
  pageSubtitle: {
    he: "עמודי השירותים והפתרונות של האתר הציבורי.",
    en: "Service and solution pages on the public site.",
  },
  addService: { he: "הוספת שירות", en: "Add service" },
  searchPlaceholder: {
    he: "חיפוש לפי שם או slug…",
    en: "Search name or slug…",
  },
  searchLabel: { he: "חיפוש שירותים", en: "Search services" },
  emptyTitle: { he: "אין שירותים", en: "No services" },
  emptyDescription: {
    he: "צרו את עמוד השירות הראשון של האתר.",
    en: "Create the first service page of the site.",
  },
  loadErrorTitle: { he: "טעינת השירותים נכשלה", en: "Failed to load services" },
  retry: { he: "נסה שוב", en: "Try again" },

  colVisual: { he: "תצוגה", en: "Visual" },
  colNameHe: { he: "שם (עברית)", en: "Name (HE)" },
  colNameEn: { he: "שם (אנגלית)", en: "Name (EN)" },
  colSlug: { he: "Slug", en: "Slug" },
  colSort: { he: "סדר", en: "Order" },
  colStatus: { he: "סטטוס", en: "Status" },
  colActions: { he: "פעולות", en: "Actions" },
  tableCaption: { he: "טבלת עמודי השירותים", en: "Service pages table" },

  statusActive: { he: "פעיל", en: "Active" },
  statusInactive: { he: "מושבת", en: "Inactive" },
  sortUp: { he: "העלאה בסדר", en: "Move earlier" },
  sortDown: { he: "הורדה בסדר", en: "Move later" },
  edit: { he: "עריכה", en: "Edit" },
  deactivate: { he: "השבתה", en: "Deactivate" },
  reactivate: { he: "הפעלה מחדש", en: "Reactivate" },

  dialogCreateTitle: { he: "שירות חדש", en: "New service" },
  dialogEditTitle: { he: "עריכת שירות", en: "Edit service" },
  dialogDescription: {
    he: "השירות נשמר דרך רכיב upsert_service המאמת והמתעד בעל כתוב; עמודים לא פעילים מוסתרים מהאתר הציבורי.",
    en: "Saved via the validated upsert_service routine; inactive pages are hidden from the public site.",
  },

  sectionBasics: { he: "יסודות", en: "Basics" },
  sectionContent: { he: "תוכן", en: "Content" },
  sectionStructured: { he: "תוכן מובנה", en: "Structured content" },
  sectionSeo: { he: "SEO", en: "SEO" },

  fieldNameHe: { he: "שם בעברית", en: "Hebrew name" },
  fieldNameEn: { he: "שם באנגלית", en: "English name" },
  fieldSlug: {
    he: "Slug (באנגלית, באותיות קטנות)",
    en: "Slug (lowercase, latin)",
  },
  fieldSlugHint: {
    he: "אותיות לטיניות קטנות, ספרות ומקפים בלבד.",
    en: "Lowercase latin letters, digits and hyphens only.",
  },
  fieldShortHe: { he: "תיאור קצר בעברית", en: "Short description (HE)" },
  fieldShortEn: { he: "תיאור קצר באנגלית", en: "Short description (EN)" },
  fieldFullHe: { he: "תיאור מלא בעברית", en: "Full description (HE)" },
  fieldFullEn: { he: "תיאור מלא באנגלית", en: "Full description (EN)" },
  fieldVisual: { he: "תצוגה חזותית", en: "Visual" },
  fieldVisualHint: {
    he: "בשרותי תמונה/SVG שהועלו יש למלא גם כתובת תמונה.",
    en: "For uploaded image/SVG kinds, provide a hero image URL as well.",
  },
  fieldImageUrl: { he: "כתובת תמונת Hero", en: "Hero image URL" },
  fieldImageUrlHint: {
    he: "כתובת מלאה (https://…) או נתיב אובייקט ב-bucket.",
    en: "A full URL (https://…) or a storage object path.",
  },
  fieldSortOrder: { he: "סדר תצוגה", en: "Sort order" },
  fieldIsActive: { he: "שירות פעיל", en: "Service is active" },

  fieldSeoTitleHe: { he: "כותרת SEO בעברית", en: "SEO title (HE)" },
  fieldSeoTitleEn: { he: "כותרת SEO באנגלית", en: "SEO title (EN)" },
  fieldSeoDescHe: { he: "תיאור SEO בעברית", en: "SEO description (HE)" },
  fieldSeoDescEn: { he: "תיאור SEO באנגלית", en: "SEO description (EN)" },

  featuresTitle: { he: "יתרונות / תכונות", en: "Features" },
  featureTextHe: { he: "טקסט בעברית", en: "Text (HE)" },
  featureTextEn: { he: "טקסט באנגלית", en: "Text (EN)" },
  stepsTitle: { he: "שלבי תהליך", en: "Process steps" },
  stepTitleHe: { he: "כותרת בעברית", en: "Title (HE)" },
  stepTitleEn: { he: "כותרת באנגלית", en: "Title (EN)" },
  stepTextHe: { he: "תוכן בעברית", en: "Body (HE)" },
  stepTextEn: { he: "תוכן באנגלית", en: "Body (EN)" },
  faqTitle: { he: "שאלות נפוצות", en: "FAQ" },
  faqQuestionHe: { he: "שאלה בעברית", en: "Question (HE)" },
  faqQuestionEn: { he: "שאלה באנגלית", en: "Question (EN)" },
  faqAnswerHe: { he: "תשובה בעברית", en: "Answer (HE)" },
  faqAnswerEn: { he: "תשובה באנגלית", en: "Answer (EN)" },
  addItem: { he: "הוספת פריט", en: "Add item" },
  removeItem: { he: "הסרה", en: "Remove" },
  moveUp: { he: "העלאה", en: "Move up" },
  moveDown: { he: "הורדה", en: "Move down" },
  itemLabel: { he: "פריט", en: "Item" },

  errorNameRequired: {
    he: "נדרש שם בעברית ובאנגלית",
    en: "Hebrew and English names are required",
  },
  errorSlug: {
    he: "ה-slug חייב לכלול אותיות לטיניות קטנות, ספרות ומקפים בלבד.",
    en: "Slug must use lowercase latin letters, digits and hyphens only.",
  },
  errorImageUrl: {
    he: "כתובת התמונה לא תקינה. השאירו ריק או הזינו כתובת מלאה / נתיב אחסון תקין.",
    en: "Invalid image URL. Leave empty or enter a full URL / valid storage path.",
  },
  errorSortOrder: {
    he: "סדר התצוגה חייב להיות מספר שלם.",
    en: "Sort order must be an integer.",
  },
  actionSave: { he: "שמירה", en: "Save" },
  actionSaving: { he: "שומר…", en: "Saving…" },
  actionCancel: { he: "ביטול", en: "Cancel" },
  closeDialog: { he: "סגירה", en: "Close" },
  saved: { he: "השירות נשמר", en: "Service saved" },
  saveFailed: { he: "שמירה נכשלה", en: "Save failed" },
  duplicateSlug: {
    he: "ה-slug הזה כבר קיים. בחרו slug אחר.",
    en: "This slug already exists. Choose a different slug.",
  },

  statusChanged: { he: "הסטטוס עודכן", en: "Status updated" },
  sorted: { he: "סדר התצוגה עודכן", en: "Sort order updated" },

  dirtyConfirmTitle: { he: "שינויים שלא נשמרו", en: "Unsaved changes" },
  dirtyConfirmBody: {
    he: "יש שינויים שלא נשמרו בטופס. לסגור בלי שמירה?",
    en: "The form has unsaved changes. Close without saving?",
  },
  dirtyConfirmLeave: { he: "סגירה בלי שמירה", en: "Close without saving" },
  dirtyConfirmStay: { he: "המשך עריכה", en: "Keep editing" },
} satisfies Record<string, Record<LocaleCode, string>>;
