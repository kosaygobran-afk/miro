type LocaleCode = "he" | "en";

export const categoriesCopy = {
  pageTitle: { he: "קטגוריות", en: "Categories" },
  pageSubtitle: {
    he: "עץ קטגוריות הקטלוג, היררכיה וסדר תצוגה.",
    en: "Catalog category tree, hierarchy and display order.",
  },
  addCategory: { he: "הוספת קטגוריה", en: "Add category" },
  searchPlaceholder: {
    he: "חיפוש לפי שם או slug…",
    en: "Search name or slug…",
  },
  searchLabel: { he: "חיפוש קטגוריות", en: "Search categories" },
  emptyTitle: { he: "אין קטגוריות", en: "No categories" },
  emptyDescription: {
    he: "צרו את הקטגוריה הראשונה של הקטלוג.",
    en: "Create the first catalog category.",
  },
  loadErrorTitle: {
    he: "טעינת הקטגוריות נכשלה",
    en: "Failed to load categories",
  },
  retry: { he: "נסה שוב", en: "Try again" },

  colVisual: { he: "תצוגה", en: "Visual" },
  colNameHe: { he: "שם (עברית)", en: "Name (HE)" },
  colNameEn: { he: "שם (אנגלית)", en: "Name (EN)" },
  colSlug: { he: "Slug", en: "Slug" },
  colParent: { he: "קטגוריית אב", en: "Parent" },
  colProducts: { he: "מוצרים", en: "Products" },
  colStatus: { he: "סטטוס", en: "Status" },
  colSort: { he: "סדר", en: "Order" },
  colActions: { he: "פעולות", en: "Actions" },
  tableCaption: { he: "טבלת קטגוריות הקטלוג", en: "Catalog categories table" },

  noParent: { he: "ללא (קטגוריית שורש)", en: "None (root category)" },
  statusActive: { he: "פעילה", en: "Active" },
  statusInactive: { he: "מושבתת", en: "Inactive" },

  sortUp: { he: "העלאה בסדר", en: "Move earlier" },
  sortDown: { he: "הורדה בסדר", en: "Move later" },
  edit: { he: "עריכה", en: "Edit" },
  deactivate: { he: "השבתה", en: "Deactivate" },
  reactivate: { he: "הפעלה מחדש", en: "Reactivate" },
  delete: { he: "מחיקה", en: "Delete" },
  deleteUnavailable: {
    he: "ניתן למחוק לצמיתות רק קטגוריה בלי מוצרים. השבתה זמינה תמיד.",
    en: "Hard delete is only available for categories with zero products. Deactivation is always available.",
  },

  dialogCreateTitle: { he: "קטגוריה חדשה", en: "New category" },
  dialogEditTitle: { he: "עריכת קטגוריה", en: "Edit category" },
  dialogDescription: {
    he: "שדות השם וה-slug הם חובה. קטגוריית אב לא יכולה להיות הקטגוריה עצמה או אחד הצאצאים שלה.",
    en: "Names and slug are required. A parent cannot be the category itself or one of its descendants.",
  },
  fieldSlug: {
    he: "Slug (באנגלית, באותיות קטנות)",
    en: "Slug (lowercase, latin)",
  },
  fieldSlugHint: {
    he: "אותיות לטיניות קטנות, ספרות ומקפים בלבד.",
    en: "Lowercase latin letters, digits and hyphens only.",
  },
  fieldNameHe: { he: "שם בעברית", en: "Hebrew name" },
  fieldNameEn: { he: "שם באנגלית", en: "English name" },
  fieldDescriptionHe: { he: "תיאור בעברית", en: "Hebrew description" },
  fieldDescriptionEn: { he: "תיאור באנגלית", en: "English description" },
  fieldParent: { he: "קטגוריית אב", en: "Parent category" },
  fieldSortOrder: { he: "סדר תצוגה", en: "Sort order" },
  fieldVisual: { he: "תצוגה חזותית", en: "Visual" },
  fieldVisualHint: {
    he: "בחרו תמונה מועלתית והזינו כתובת תמונה. בלי תמונה תוצג אייקון ברירת מחדל.",
    en: "Pick an uploaded visual and set an image URL. Without an image a default icon is shown.",
  },
  fieldImageUrl: { he: "כתובת תמונה (URL)", en: "Image URL" },
  fieldImageUrlHint: {
    he: "כתובת מלאה (https://…) של התמונה.",
    en: "A full image URL (https://…).",
  },
  fieldIsActive: { he: "קטגוריה פעילה", en: "Category is active" },

  errorNameRequired: {
    he: "נדרש שם בעברית ובאנגלית",
    en: "Hebrew and English names are required",
  },
  errorSlug: {
    he: "ה-slug חייב לכלול אותיות לטיניות קטנות, ספרות ומקפים בלבד.",
    en: "Slug must use lowercase latin letters, digits and hyphens only.",
  },
  errorImageUrl: {
    he: "כתובת התמונה לא תקינה. השאירו ריק או הזינו כתובת מלאה (https://…).",
    en: "Invalid image URL. Leave empty or enter a full URL (https://…).",
  },
  actionSave: { he: "שמירה", en: "Save" },
  actionSaving: { he: "שומר…", en: "Saving…" },
  actionCancel: { he: "ביטול", en: "Cancel" },
  closeDialog: { he: "סגירה", en: "Close" },
  saved: { he: "הקטגוריה נשמרה", en: "Category saved" },
  saveFailed: { he: "שמירה נכשלה", en: "Save failed" },
  duplicateSlug: {
    he: "ה-slug הזה כבר קיים. בחרו slug אחר.",
    en: "This slug already exists. Choose a different slug.",
  },
  cycleError: {
    he: "לא ניתן לבחור את הקטגוריה עצמה או צאצא שלה כאב.",
    en: "A category cannot be its own parent or be parented under its descendant.",
  },

  deactivateTitle: { he: "השבתת קטגוריה", en: "Deactivate category" },
  deactivateWarning: {
    he: "מוצרים שפורסמו בקטגוריה זו יוסתרו ולא יהיו זמינים לפי חוק הפרסום של מסד הנתונים.",
    en: "Products currently published in this category will become hidden/unavailable by the database publication invariant.",
  },
  deactivateConfirm: { he: "השבתה", en: "Deactivate" },
  reactivated: { he: "הקטגוריה הופעלה מחדש", en: "Category reactivated" },
  deactivated: { he: "הקטגוריה הושבתה", en: "Category deactivated" },

  deleteTitle: {
    he: "מחיקת קטגוריה לצמיתות",
    en: "Delete category permanently",
  },
  deleteWarning: {
    he: "הפעולה בלתי הפיכה. הקלידו DELETE כדי לאשר.",
    en: "This cannot be undone. Type DELETE to confirm.",
  },
  deleteConfirmPlaceholder: { he: "הקלידו DELETE", en: "Type DELETE" },
  deleted: { he: "הקטגוריה נמחקה", en: "Category deleted" },
  deleteFailed: { he: "מחיקה נכשלה", en: "Delete failed" },

  dirtyConfirmTitle: { he: "שינויים שלא נשמרו", en: "Unsaved changes" },
  dirtyConfirmBody: {
    he: "יש שינויים שלא נשמרו בטופס. לסגור בלי שמירה?",
    en: "The form has unsaved changes. Close without saving?",
  },
  dirtyConfirmLeave: { he: "סגירה בלי שמירה", en: "Close without saving" },
  dirtyConfirmStay: { he: "המשך עריכה", en: "Keep editing" },

  // Category icon upload
  fieldIcon: { he: "אייקון הקטגוריה", en: "Category icon" },
  fieldIconHint: {
    he: "אייקון שקוף לקטגוריה. עדיף SVG, PNG או WebP. עבור PNG/WebP מומלץ 512×512 פיקסלים ביחס 1:1. גודל קובץ מרבי 1MB. השאר שוליים פנימיים כדי שהאייקון לא ייגע במסגרת.",
    en: "Transparent category icon. SVG, PNG or WebP preferred. For PNG/WebP, 512×512 px at 1:1 is recommended. Maximum file size 1 MB. Keep internal padding so the icon does not touch the frame.",
  },
  uploadIcon: { he: "העלאת אייקון", en: "Upload icon" },
  removeIcon: { he: "הסרת אייקון", en: "Remove icon" },
  uploading: { he: "מעלה…", en: "Uploading…" },
  uploadSuccess: {
    he: "האייקון הועלה בהצלחה",
    en: "Icon uploaded successfully",
  },
  uploadFailed: { he: "העלאת האייקון נכשלה", en: "Icon upload failed" },
  noIcon: { he: "אין אייקון", en: "No icon" },
  currentIcon: { he: "אייקון נוכחי", en: "Current icon" },
  iconPreviewAlt: { he: "תצוגה מקדימה של האייקון", en: "Icon preview" },
} satisfies Record<string, Record<LocaleCode, string>>;
