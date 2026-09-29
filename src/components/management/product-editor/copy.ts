import type {
  Locale,
  OutOfStockPolicy,
  PriceRole,
  ProductStatus,
} from "./types";

type LocalizedText = Record<Locale, string>;

export const editorCopy = {
  breadcrumbProducts: { he: "מוצרים", en: "Products" },
  newProductTitle: { he: "מוצר חדש", en: "New product" },
  newProductSubtitle: {
    he: "צור טיוטת מוצר מינימלית. פרטים, תמונות ווריאנטים יתווספו בעורך המוצר.",
    en: "Create a minimal product draft. Details, media and variants are added in the product editor.",
  },
  back: { he: "חזרה למוצרים", en: "Back to products" },
  unsavedBadge: { he: "יש שינויים שלא נשמרו", en: "Unsaved changes" },
  save: { he: "שמור", en: "Save" },
  saving: { he: "שומר...", en: "Saving..." },
  saved: { he: "השינויים נשמרו.", en: "Changes saved." },
  savedButton: { he: "נשמר", en: "Saved" },
  noChanges: { he: "אין שינויים לשמירה.", en: "No changes to save." },
  saveFailed: { he: "שמירה נכשלה", en: "Save failed" },
  loadFailed: { he: "לא ניתן לטעון נתונים", en: "Failed to load data" },
  productNotFound: { he: "המוצר לא נמצא", en: "Product not found" },
  retry: { he: "נסה שוב", en: "Try again" },
  viewStorefront: { he: "צפה בחנות", en: "View storefront" },
  createProduct: { he: "צור מוצר", en: "Create product" },
  creating: { he: "יוצר...", en: "Creating..." },
  cancel: { he: "ביטול", en: "Cancel" },
  confirm: { he: "אישור", en: "Confirm" },
  sectionsNavLabel: { he: "מקטעי עריכת מוצר", en: "Product editor sections" },
  unsavedTitle: { he: "שינויים שלא נשמרו", en: "Unsaved changes" },
  unsavedDescription: {
    he: "יש שינויים שלא נשמרו. לצאת בלי לשמור?",
    en: "You have unsaved changes. Leave without saving?",
  },
  leaveWithoutSaving: { he: "צא בלי לשמור", en: "Leave without saving" },
  keepEditing: { he: "המשך בעריכה", en: "Keep editing" },
  dismiss: { he: "סגור", en: "Dismiss" },
  close: { he: "סגור", en: "Close" },
} as const satisfies Record<string, LocalizedText>;

export const sectionLabels = {
  general: { he: "כללי", en: "General" },
  content: { he: "תוכן", en: "Content" },
  media: { he: "מדיה", en: "Media" },
  variants: { he: "וריאנטים", en: "Variants" },
  inventory: { he: "מלאי", en: "Inventory" },
  pricing: { he: "תמחור", en: "Pricing" },
  seo: { he: "SEO", en: "SEO" },
  publishing: { he: "פרסום", en: "Publishing" },
} as const satisfies Record<string, LocalizedText>;

export type EditorSection = keyof typeof sectionLabels;

export const sectionDescriptions: Record<EditorSection, LocalizedText> = {
  general: {
    he: "שמות, קטגוריה, מותג, דגם ותגיות.",
    en: "Names, category, brand, model and tags.",
  },
  content: {
    he: "תיאורים קצרים ומלאים ותנאי אחריות בשני הדורות השפה.",
    en: "Short and full descriptions plus warranty text in both languages.",
  },
  media: {
    he: "גלריית תמונות: העלאה, טקסט חלופי, סידור ותמונה ראשית.",
    en: "Image gallery: upload, alt text, ordering and the primary image.",
  },
  variants: {
    he: "וריאנטי מוצר עם מק״ט, ברקוד, צבע ותמחור עקיף.",
    en: "Product variants with SKU, barcode, color and price overrides.",
  },
  inventory: {
    he: "מלאי נוכחי לכל וריאנט. שינויי מלאי מתבצעים בעמוד המלאי.",
    en: "Current stock per variant. Stock changes happen on the Inventory page.",
  },
  pricing: {
    he: "מחיר בסיס, מחירי מבצע ומחירים לפי תפקיד.",
    en: "Base price, sale pricing and per-role prices.",
  },
  seo: {
    he: "כותרות ותיאורי SEO בשתי השפות.",
    en: "SEO titles and descriptions in both languages.",
  },
  publishing: {
    he: "סטטוס פרסום, מדיניות חוסר מלאי וסידור בחנות.",
    en: "Publishing status, out-of-stock policy and storefront ordering.",
  },
};

export const statusLabels: Record<ProductStatus, LocalizedText> = {
  draft: { he: "טיוטה", en: "Draft" },
  active: { he: "פעיל", en: "Active" },
  hidden: { he: "מוסתר", en: "Hidden" },
  archived: { he: "מאורכב", en: "Archived" },
};

export const policyLabels: Record<OutOfStockPolicy, LocalizedText> = {
  inherit: { he: "ברירת מחדל של החנות", en: "Inherit store default" },
  keep_visible_contact: {
    he: "הצג + פנייה ליצירת קשר",
    en: "Show + contact call-to-action",
  },
  keep_visible_restock: {
    he: "הצג + תאריך חידוש מלאי",
    en: "Show + restock date",
  },
  hide_from_public: { he: "הסתר מהחנות", en: "Hide from storefront" },
};

export const roleLabels: Record<PriceRole, LocalizedText> = {
  customer: { he: "לקוח", en: "Customer" },
  worker: { he: "עובד", en: "Worker" },
  admin: { he: "מנהל", en: "Admin" },
  ceo: { he: "מנכ״ל", en: "CEO" },
};

export const fieldLabels = {
  category: { he: "קטגוריה", en: "Category" },
  selectCategory: { he: "בחר קטגוריה", en: "Select category" },
  slug: { he: "מזהה (Slug)", en: "Slug" },
  slugDescription: {
    he: "אותיות קטנות, ספרות ומקפים בלבד. משמש בכתובת החנות.",
    en: "Lowercase letters, digits and hyphens only. Used in the storefront URL.",
  },
  nameHe: { he: "שם בעברית", en: "Name (Hebrew)" },
  nameEn: { he: "שם באנגלית", en: "Name (English)" },
  brand: { he: "מותג", en: "Brand" },
  modelNumber: { he: "מספר דגם", en: "Model number" },
  tags: { he: "תגיות", en: "Tags" },
  tagsDescription: {
    he: "הקלד תגית והקש Enter או פסיק להוספה.",
    en: "Type a tag and press Enter or comma to add it.",
  },
  tagInputAria: { he: "הוסף תגית", en: "Add tag" },
  removeTag: { he: "הסר תגית", en: "Remove tag" },
  shortDescriptionHe: {
    he: "תיאור קצר (עברית)",
    en: "Short description (Hebrew)",
  },
  shortDescriptionEn: {
    he: "תיאור קצר (אנגלית)",
    en: "Short description (English)",
  },
  descriptionHe: { he: "תיאור מלא (עברית)", en: "Full description (Hebrew)" },
  descriptionEn: { he: "תיאור מלא (אנגלית)", en: "Full description (English)" },
  warrantyHe: { he: "אחריות (עברית)", en: "Warranty (Hebrew)" },
  warrantyEn: { he: "אחריות (אנגלית)", en: "Warranty (English)" },
  basePrice: { he: "מחיר בסיס (₪)", en: "Base price (₪)" },
  basePriceDescription: {
    he: "ריק = המוצר לא מתומחר. חובה מחיר גדול מ-0 לפרסום.",
    en: "Empty = unpriced. A price greater than 0 is required to publish.",
  },
  compareAtPrice: { he: "מחיר השוואה (₪)", en: "Compare-at price (₪)" },
  salePrice: { he: "מחיר מבצע (₪)", en: "Sale price (₪)" },
  purchaseCost: { he: "עלות רכישה (₪)", en: "Purchase cost (₪)" },
  seoTitleHe: { he: "כותרת SEO (עברית)", en: "SEO title (Hebrew)" },
  seoTitleEn: { he: "כותרת SEO (אנגלית)", en: "SEO title (English)" },
  seoDescriptionHe: { he: "תיאור SEO (עברית)", en: "SEO description (Hebrew)" },
  seoDescriptionEn: {
    he: "תיאור SEO (אנגלית)",
    en: "SEO description (English)",
  },
  status: { he: "סטטוס פרסום", en: "Publishing status" },
  statusDescription: {
    he: "פרסום (פעיל) מאומת מול שדות חובה: שמות, קטגוריה, מחיר ווריאנט פעיל עם מק״ט.",
    en: "Publishing (Active) is validated against required fields: names, category, price and an active variant with SKU.",
  },
  outOfStockPolicy: { he: "מדיניות חוסר מלאי", en: "Out-of-stock policy" },
  featured: { he: "מוצר מומלץ", en: "Featured product" },
  featuredDescription: {
    he: "מוצג באזורי תוכן מובילים בחנות.",
    en: "Shown in featured storefront placements.",
  },
  sortOrder: { he: "סדר מיון", en: "Sort order" },
} as const satisfies Record<string, LocalizedText>;

export const validationCopy = {
  nameHeRequired: {
    he: "שם בעברית הוא שדה חובה",
    en: "Hebrew name is required",
  },
  nameEnRequired: {
    he: "שם באנגלית הוא שדה חובה",
    en: "English name is required",
  },
  slugInvalid: {
    he: "Slug חייב להכיל אותיות קטנות, ספרות ומקפים בלבד",
    en: "Slug may contain lowercase letters, digits and hyphens only",
  },
  slugRequired: { he: "Slug הוא שדה חובה", en: "Slug is required" },
  slugDuplicate: {
    he: "מזהה זה כבר קיים. בחר מזהה אחר.",
    en: "This slug already exists. Choose a different one.",
  },
  priceMustBePositive: {
    he: "המחיר חייב להיות גדול מ-0",
    en: "Price must be greater than 0",
  },
  compareAtMustExceedSale: {
    he: "מחיר ההשוואה חייב להיות גדול ממחיר המבצע",
    en: "Compare-at price must be greater than the sale price",
  },
  categoryRequiredForPublish: {
    he: "לא ניתן לפרסם: יש לבחור קטגוריה",
    en: "Cannot publish: choose a category",
  },
  publishFailed: {
    he: "לא ניתן לפרסם",
    en: "Cannot publish",
  },
  invalidNumber: {
    he: "ערך מספרי לא תקין",
    en: "Invalid numeric value",
  },
} as const satisfies Record<string, LocalizedText>;

export const mediaCopy = {
  title: { he: "תמונות מוצר", en: "Product images" },
  uploadLabel: { he: "העלאת תמונות", en: "Upload images" },
  addByUrlLabel: { he: "הוסף מכתובת", en: "Add by URL" },
  uploadHint: {
    he: "PNG, JPG, WebP או SVG עד 5MB לקובץ. ניתן לבחור מספר קבצים.",
    en: "PNG, JPG, WebP or SVG up to 5 MB per file. Multiple files allowed.",
  },
  empty: { he: "אין תמונות עדיין", en: "No images yet" },
  emptyDescription: {
    he: "העלה תמונה ראשונה. התמונה הראשונה היא תמונת הברירת מחדל בחנות.",
    en: "Upload the first image. The first image is the storefront primary.",
  },
  primary: { he: "ראשית", en: "Primary" },
  setPrimary: { he: "הגדר כראשית", en: "Set as primary" },
  moveUp: { he: "הזז למעלה", en: "Move up" },
  moveDown: { he: "הזז למטה", en: "Move down" },
  editAlt: { he: "ערוך טקסט חלופי", en: "Edit alt text" },
  deleteImage: { he: "מחק תמונה", en: "Delete image" },
  deleteImageTitle: { he: "מחיקת תמונה", en: "Delete image" },
  deleteImageDescription: {
    he: "התמונה תימחק מהמוצר ומהאחסון. לא ניתן לשחזר.",
    en: "The image will be removed from the product and storage. This cannot be undone.",
  },
  deleteFailed: {
    he: "מחיקת התמונה נכשלה. התמונה נשארה במקומה.",
    en: "Failed to delete image. The image was kept.",
  },
  altHe: { he: "טקסט חלופי (עברית)", en: "Alt text (Hebrew)" },
  altEn: { he: "טקסט חלופי (אנגלית)", en: "Alt text (English)" },
  altDialogTitle: { he: "טקסט חלופי לתמונה", en: "Image alt text" },
  saveAlt: { he: "שמור טקסט", en: "Save alt text" },
  uploading: { he: "מעלה...", en: "Uploading..." },
  uploadFailed: { he: "העלאה נכשלה", en: "Upload failed" },
  imageOperationFailed: { he: "הפעולה נכשלה", en: "Operation failed" },
  // URL upload
  urlDialogTitle: { he: "הוסף תמונה מכתובת", en: "Add image by URL" },
  urlLabel: { he: "כתובת תמונה (URL)", en: "Image URL" },
  urlPlaceholder: {
    he: "https://example.com/image.jpg",
    en: "https://example.com/image.jpg",
  },
  urlHint: {
    he: "הכתובת חייבת להיות HTTP או HTTPS.",
    en: "URL must be HTTP or HTTPS.",
  },
  urlInvalid: {
    he: "כתובת לא תקינה. נדרש HTTP או HTTPS.",
    en: "Invalid URL. HTTP or HTTPS required.",
  },
  urlFetchFailed: {
    he: "לא ניתן לטעון תצוגה מקדימה מהכתובת.",
    en: "Could not load preview from URL.",
  },
  previewAlt: { he: "תצוגה מקדימה", en: "Preview" },
  addButton: { he: "הוסף תמונה", en: "Add image" },
  adding: { he: "מוסיף...", en: "Adding..." },
  addFailed: { he: "הוספת תמונה נכשלה", en: "Failed to add image" },
  autoSaved: {
    he: "התמונה נשמרה ותופיע מיד ברשימת המוצרים ובחנות.",
    en: "Image saved. It now appears in the product list and storefront.",
  },
} as const satisfies Record<string, LocalizedText>;

export const variantCopy = {
  title: { he: "וריאנטים", en: "Variants" },
  addVariant: { he: "הוסף וריאנט", en: "Add variant" },
  editVariant: { he: "ערוך וריאנט", en: "Edit variant" },
  newVariant: { he: "וריאנט חדש", en: "New variant" },
  empty: { he: "אין וריאנטים עדיין", en: "No variants yet" },
  emptyDescription: {
    he: "כל מוצר צריך לפחות וריאנט פעיל אחד עם מק״ט כדי לפרסם.",
    en: "Every product needs at least one active variant with a SKU to publish.",
  },
  sku: { he: "מק״ט (SKU)", en: "SKU" },
  barcode: { he: "ברקוד", en: "Barcode" },
  colorHe: { he: "צבע (עברית)", en: "Color (Hebrew)" },
  colorEn: { he: "צבע (אנגלית)", en: "Color (English)" },
  colorHex: { he: "קוד צבע", en: "Color swatch" },
  priceOverride: { he: "מחיר עקיף (₪)", en: "Price override (₪)" },
  priceOverrideDescription: {
    he: "ריק = מחיר הבסיס של המוצר.",
    en: "Empty = the product base price.",
  },
  costOverride: { he: "עלות (₪)", en: "Cost (₪)" },
  supplier: { he: "ספק", en: "Supplier" },
  noSupplier: { he: "ללא ספק", en: "No supplier" },
  supplierSku: { he: "מק״ט ספק", en: "Supplier SKU" },
  lowStockThreshold: { he: "סף מלאי נמוך", en: "Low stock threshold" },
  isActive: { he: "וריאנט פעיל", en: "Active variant" },
  isDefault: { he: "וריאנט ברירת מחדל", en: "Default variant" },
  defaultBadge: { he: "ברירת מחדל", en: "Default" },
  activeBadge: { he: "פעיל", en: "Active" },
  inactiveBadge: { he: "לא פעיל", en: "Inactive" },
  stock: { he: "מלאי", en: "Stock" },
  deleteVariant: { he: "מחק וריאנט", en: "Delete variant" },
  deleteVariantTitle: { he: "מחיקת וריאנט", en: "Delete variant" },
  deleteVariantDescription: {
    he: "וריאנט עם תנועות מלאי יועבר לארכיון במקום מחיקה.",
    en: "A variant with stock movements is archived instead of deleted.",
  },
  skuRequired: { he: "מק״ט הוא שדה חובה", en: "SKU is required" },
  duplicateSku: { he: "מק״ט זה כבר קיים", en: "This SKU already exists" },
  duplicateBarcode: {
    he: "ברקוד זה כבר קיים",
    en: "This barcode already exists",
  },
  priceMustBePositive: {
    he: "מחיר עקיף חייב להיות גדול מ-0",
    en: "Price override must be greater than 0",
  },
  saveVariant: { he: "שמור וריאנט", en: "Save variant" },
  operationFailed: { he: "הפעולה נכשלה", en: "Operation failed" },
  tableCaption: { he: "טבלת וריאנטים", en: "Variants table" },
  lowStock: { he: "מלאי נמוך", en: "Low stock" },
  inStock: { he: "במלאי", en: "In stock" },
  outOfStock: { he: "אזל מהמלאי", en: "Out of stock" },
  inventoryNote: {
    he: "שינויי מלאי (קליטה/התאמה) מתבצעים בעמוד המלאי בלבד.",
    en: "Stock changes (receipts/adjustments) happen on the Inventory page only.",
  },
} as const satisfies Record<string, LocalizedText>;

export const priceCopy = {
  rolePricesTitle: { he: "מחירים לפי תפקיד", en: "Role prices" },
  rolePricesDescription: {
    he: "מחיר מפורש לתפקיד גובר על מחיר הבסיס. מחיר ריק = תפקיד ללא מחיר מפורסם.",
    en: "An explicit role price overrides the base price. Empty = no published price for the role.",
  },
  setPrice: { he: "הגדר מחיר", en: "Set price" },
  removePrice: { he: "הסר", en: "Remove" },
  saveFailed: { he: "שמירת מחיר נכשלה", en: "Price save failed" },
  removeFailed: { he: "הסרת מחיר נכשלה", en: "Price removal failed" },
  priceMustBePositive: {
    he: "המחיר חייב להיות גדול מ-0",
    en: "Price must be greater than 0",
  },
  noPriceSet: { he: "לא הוגדר", en: "Not set" },
} as const satisfies Record<string, LocalizedText>;
