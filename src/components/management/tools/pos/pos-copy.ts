type LocaleCode = "he" | "en";
type CopyMap = Record<string, Record<LocaleCode, string>>;

export const posCopy = {
  // Title and basic actions
  title: { he: "קופה רושמת", en: "POS / Cash Register" },
  open: { he: "פתיחת קופה", en: "Open POS" },
  close: { he: "סגירת קופה", en: "Close POS" },
  minimize: { he: "צמצום קופה", en: "Minimize POS" },
  restore: { he: "שחזור קופה", en: "Restore POS" },
  drag: { he: "גרירת חלון הקופה", en: "Drag POS window" },

  // Customer section
  customerSectionTitle: { he: "פרטי לקוח", en: "Customer" },
  accountSearchLabel: {
    he: "חשבון לקוח (חיפוש)",
    en: "Customer account (search)",
  },
  accountSearchPlaceholder: {
    he: "חיפוש לפי שם, אימייל או טלפון…",
    en: "Search by name, email or phone…",
  },
  accountNoResults: { he: "לא נמצאו לקוחות", en: "No customers found" },
  accountLoading: { he: "מחפש לקוחות…", en: "Searching customers…" },
  accountClear: { he: "ניקוי חשבון מקושר", en: "Clear linked account" },
  accountLinkedNote: {
    he: "המכירה תשווי לחשבון זה",
    en: "The sale will be linked to this account",
  },
  guestNote: {
    he: "ללא חשבון — המכירה תירשם כאורח",
    en: "No account — the sale will be recorded as a guest",
  },
  fieldName: { he: "שם מלא", en: "Full name" },
  fieldEmail: { he: "אימייל", en: "Email" },
  fieldPhone: { he: "טלפון", en: "Phone" },
  nameEmailRequired: {
    he: "שם ואימייל נדרשים",
    en: "Name and email are required",
  },
  emailInvalid: { he: "כתובת אימייל לא תקינה", en: "Invalid email address" },

  // Items section
  itemsSectionTitle: { he: "פריטי הזמנה", en: "Order items" },
  productSearchLabel: { he: "מוצר", en: "Product" },
  productSearchPlaceholder: {
    he: "חיפוש לפי שם, SKU או ברקוד…",
    en: "Search by name, SKU or barcode…",
  },
  productNoResults: {
    he: "לא נמצאו מוצרים פעילים",
    en: "No active products found",
  },
  productLoading: { he: "מחפש מוצרים…", en: "Searching products…" },
  productClear: { he: "ניקוי מוצר", en: "Clear product" },
  qty: { he: "כמות", en: "Qty" },
  unitPrice: { he: "מחיר יחידה (ILS)", en: "Unit price (ILS)" },
  discountPerUnit: { he: "הנחה ליחידה (ILS)", en: "Discount per unit (ILS)" },
  removeItem: { he: "הסרת פריט", en: "Remove item" },
  addItem: { he: "הוספת פריט", en: "Add item" },
  stockAvailable: { he: "מלאי זמין", en: "Available stock" },
  stockUntracked: { he: "מלאי לא בניטור", en: "Stock not tracked" },
  variantRequired: { he: "בחר מוצר וגרסה", en: "Choose a product variant" },
  qtyPositive: {
    he: "הכמות חייבת להיות גדולה מ-0",
    en: "Quantity must be greater than 0",
  },
  discountExceedsPrice: {
    he: "הנחה ליחידה לא יכולה לעלות על מחיר היחידה",
    en: "Discount per unit cannot exceed the unit price",
  },
  itemRequired: {
    he: "הוסף לפחות פריט אחד תקין",
    en: "Add at least one valid item",
  },

  // Live totals
  liveGross: { he: "סכום לפני הנחה", en: "Gross before discount" },
  liveDiscounts: { he: "סה״כ הנחות", en: "Total discounts" },
  liveItems: { he: "פריטים", en: "Items" },
  liveTotal: { he: "סה״כ לתשלום", en: "Total due" },

  // Review section
  reviewButton: { he: "סקירת המכירה", en: "Review sale" },
  reviewTitle: {
    he: "סקירת מכירה לפני רישום",
    en: "Review sale before recording",
  },
  reviewDescription: {
    he: "בדוק את הפרטים והסיכומים — הרישום ביצוע אחד במסד הנתונים.",
    en: "Check the details and totals — recording is a single database transaction.",
  },
  reviewCustomerTitle: { he: "לקוח", en: "Customer" },
  reviewAccountGuest: { he: "אורח", en: "Guest" },
  reviewAccountLinked: { he: "חשבון מקושר", en: "Linked account" },
  reviewItemsTitle: { he: "פריטים", en: "Items" },
  colProduct: { he: "מוצר", en: "Product" },
  colSku: { he: "SKU", en: "SKU" },
  colQty: { he: "כמות", en: "Qty" },
  colUnitPrice: { he: "מחיר יחידה", en: "Unit price" },
  colDiscountUnit: { he: "הנחה/יחידה", en: "Discount/unit" },
  colLineDiscount: { he: "הנחה בשורה", en: "Line discount" },
  colGross: { he: "ברוטו", en: "Gross" },
  colVat: { he: 'מע"מ', en: "VAT" },
  colNet: { he: "נטו", en: "Net" },
  reviewSubtotalNet: { he: "סכום ביניים (נטו)", en: "Subtotal (net)" },
  reviewDiscount: { he: "הנחות", en: "Discounts" },
  reviewVat: { he: 'מע"מ', en: "VAT" },
  reviewTotal: { he: "סה״כ לתשלום", en: "Total" },
  cancelLabel: { he: "ביטול", en: "Cancel" },
  confirmRecord: { he: "רישום מכירה", en: "Record sale" },
  recording: { he: "רושם מכירה…", en: "Recording sale…" },
  recordFailed: { he: "רישום המכירה נכשל", en: "Failed to record sale" },
  insufficientStock: {
    he: "מלאי לא מספיק לאחד הפריטים",
    en: "Insufficient stock for one or more items",
  },
  invalidProduct: {
    he: "מוצר או גרסה לא תקינים",
    en: "Invalid product or variant",
  },
  connectionError: { he: "שגיאת חיבור", en: "Connection error" },
  saleRecorded: { he: "המכירה נרשמה", en: "Sale recorded" },
  orderNumberLabel: { he: "מספר הזמנה", en: "Order" },
  noticeDismiss: { he: "סגירת ההתראה", en: "Dismiss notice" },

  // Payment section
  paymentSectionTitle: { he: "תשלום", en: "Payment" },
  paymentMethod: { he: "שיטת תשלום", en: "Payment Method" },
  amount: { he: "סכום", en: "Amount" },
  installments: { he: "תשלומים", en: "Installments" },
  reference: { he: "הפניה (עד 120 תווים)", en: "Reference (up to 120 chars)" },
  addPayment: { he: "הוספת תשלום", en: "Add Payment" },
  removePayment: { he: "הסרת תשלום", en: "Remove Payment" },
  paymentsMustEqualTotal: {
    he: "סכום התשלומים חייב להשתוות לסכום הכולל",
    en: "Payment total must equal order total",
  },
  cashOnlyOneInstallment: {
    he: "תשלום מזומן מאפשר רק תשלום אחד",
    en: "Cash payment allows only one installment",
  },

  // Review step
  reviewStepTitle: { he: "סקירה לפני רישום", en: "Review before recording" },

  // Complete sale
  completeSale: { he: "הרשמת המכירה", en: "Complete Sale" },

  // Success
  successTitle: { he: "המכירה נרשמה בהצלחה", en: "Sale recorded successfully" },
  orderNumber: { he: "מספר הזמנה", en: "Order Number" },

  // Close confirmation
  closeConfirmTitle: { he: "אישור סגירה", en: "Confirm Close" },
  closeConfirmMessage: {
    he: "סגור את הקופה ואת כל הנתונים שלא נשמרו?",
    en: "Close POS and discard the current draft?",
  },
  closeConfirmYes: { he: "כן, סגור", en: "Yes, Close" },
  closeConfirmNo: { he: "לא, המשך", en: "No, Continue" },

  // VAT estimate note
  vatEstimateNote: {
    he: 'מע"מ משוער — הערך הסופי נקבע במסד הנתונים',
    en: "VAT is an estimate — the final value is set by the database",
  },
  vatRateUnavailable: {
    he: 'שיעור מע"מ אינו זמין',
    en: "VAT rate unavailable",
  },
  vatRateNotePrefix: {
    he: 'שיעור מע"מ',
    en: "VAT rate",
  },
} satisfies CopyMap;
