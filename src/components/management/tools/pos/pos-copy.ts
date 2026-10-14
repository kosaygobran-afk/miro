type LocaleCode = "he" | "en";
type CopyMap = Record<string, Record<LocaleCode, string>>;

export const posCopy = {
  // Title and basic actions
  title: { he: "קופה רושמת", en: "POS / Cash Register" },
  open: { he: "פתיחת קופה", en: "Open POS" },
  close: { he: "סגירת קופה", en: "Close POS" },
  minimize: { he: "צמצום קופה", en: "Minimize POS" },
  restore: { he: "שחזור קופה", en: "Restore POS" },
  maximize: { he: "הגדלה", en: "Maximize" },
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

  // Discovery tabs
  discoveryLabel: { he: "גילוי מוצרים", en: "Product Discovery" },
  catalogOnlyNote: {
    he: "הקופה רושמת רק גרסאות פעילות מהקטלוג. שירותים ופריטים שאינם בקטלוג מנוהלים בתהליך נפרד.",
    en: "POS records active catalog variants only. Services and non-catalog items use a separate workflow.",
  },
  productsTab: { he: "מוצרים", en: "Products" },
  categoriesTab: { he: "קטגוריות", en: "Categories" },
  servicesTab: { he: "שירותים", en: "Services" },
  manualTab: { he: "פריט ידני", en: "Manual Item" },
  allCategories: { he: "כל הקטגוריות", en: "All Categories" },
  categoriesListLabel: { he: "קטגוריות", en: "Categories" },
  noCategories: { he: "אין קטגוריות זמינות", en: "No categories available" },
  loadingCategories: { he: "טוען קטגוריות…", en: "Loading categories…" },
  productSingular: { he: "מוצר", en: "product" },
  productPlural: { he: "מוצרים", en: "products" },
  scannerHint: {
    he: "סרוק ברקוד או הקלד SKU — לחץ Enter להוספה מהירה",
    en: "Scan barcode or type SKU — press Enter for quick add",
  },

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
  noExactMatch: {
    he: 'לא נמצאה התאמה מדויקת לברקוד או למק"ט',
    en: "No exact SKU or barcode match. Select a search result below.",
  },
  productLoading: { he: "מחפש מוצרים…", en: "Searching products…" },
  productClear: { he: "ניקוי מוצר", en: "Clear product" },
  qty: { he: "כמות", en: "Qty" },
  unitPrice: { he: "מחיר יחידה (ILS)", en: "Unit price (ILS)" },
  discountPerUnit: { he: "הנחה ליחידה (ILS)", en: "Discount per unit (ILS)" },
  removeItem: { he: "הסרת פריט", en: "Remove item" },
  addItem: { he: "הוספת פריט", en: "Add item" },
  stockAvailable: { he: "מלאי זמין", en: "Available stock" },
  stockQuantityExceeded: {
    he: "הכמות גבוהה מהמלאי הזמין ({available})",
    en: "Quantity exceeds available stock ({available})",
  },
  stockLimitReached: {
    he: "הגעת למלאי הזמין ({available})",
    en: "Available stock limit reached ({available})",
  },
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
  decreaseQty: { he: "הקטנת כמות", en: "Decrease quantity" },
  increaseQty: { he: "הגדלת כמות", en: "Increase quantity" },

  // Services
  servicesSectionTitle: { he: "שירותים", en: "Services" },
  serviceSearchPlaceholder: {
    he: "חיפוש שירות לפי שם…",
    en: "Search service by name…",
  },
  serviceLoading: { he: "טוען שירותים…", en: "Loading services…" },
  serviceNoResults: {
    he: "לא נמצאו שירותים פעילים",
    en: "No active services found",
  },
  serviceBadge: { he: "שירות", en: "Service" },

  // Manual items
  manualTitle: { he: "פריט ידני", en: "Manual Item" },
  manualProduct: { he: "מוצר ידני", en: "Manual Product" },
  manualService: { he: "שירות ידני", en: "Manual Service" },
  manualBadge: { he: "ידני", en: "Manual" },
  manualNameLabel: { he: "שם הפריט", en: "Item name" },
  manualNamePlaceholder: {
    he: "לדוגמה: תיקון כבלים באתר",
    en: "E.g.: On-site cable repair",
  },
  manualNameRequired: {
    he: "שם הפריט נדרש",
    en: "Item name is required",
  },
  manualPriceLabel: { he: "מחיר (ILS)", en: "Price (ILS)" },
  manualPricePlaceholder: { he: "0.00", en: "0.00" },
  manualPriceRequired: {
    he: "מחיר תקין נדרש",
    en: "Valid price is required",
  },
  manualNoteLabel: { he: "הערה (אופציונלי)", en: "Note (optional)" },
  manualNotePlaceholder: {
    he: "לדוגמה: לקוח ביקש התקנה דחופה ביום ראשון",
    en: "E.g.: Customer requested urgent Sunday installation",
  },
  manualNotePrefix: { he: "הערה:", en: "Note:" },
  manualAddButton: { he: "הוספה לעגלה", en: "Add to cart" },

  // Live totals
  liveGross: { he: "סכום לפני הנחה", en: "Gross before discount" },
  liveDiscounts: { he: "סה״כ הנחות", en: "Total discounts" },
  liveItems: { he: "פריטים", en: "Items" },
  liveTotal: { he: "סה״כ לתשלום", en: "Total due" },

  // Cart section
  cartTitle: { he: "עגלת מכירה", en: "Sale Cart" },
  cartEmpty: {
    he: "העגלה ריקה. חפש מוצר או סרוק ברקוד כדי להתחיל.",
    en: "Your cart is empty. Search for a product or scan a barcode to start.",
  },
  subtotal: { he: "סכום ביניים", en: "Subtotal" },
  discounts: { he: "הנחות", en: "Discounts" },
  items: { he: "פריטים", en: "Items" },
  totalDue: { he: "סה״כ לתשלום", en: "Total Due" },

  // Payment section
  paymentSectionTitle: { he: "תשלום", en: "Payment" },
  paymentMethod: { he: "שיטת תשלום", en: "Payment Method" },
  amount: { he: "סכום", en: "Amount" },
  amountPlaceholder: { he: "סכום", en: "Amount" },
  installments: { he: "תשלומים", en: "Installments" },
  reference: { he: "הפניה (עד 120 תווים)", en: "Reference (up to 120 chars)" },
  referencePlaceholder: {
    he: "מספר אישור, 4 ספרות אחרונות…",
    en: "Auth code, last 4 digits…",
  },
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
  paidAmount: { he: "שולם", en: "Paid" },
  remaining: { he: "נותר לתשלום", en: "Remaining" },
  fillRemainingAmount: {
    he: "השלמת היתרה בתשלום הראשון",
    en: "Apply remaining amount to first payment",
  },

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
  idempotencyConflict: {
    he: "מפתח אידמפוטנטיות קיים — המכירה כבר נרשמה",
    en: "Idempotency key conflict — sale already recorded",
  },
  connectionError: { he: "שגיאת חיבור", en: "Connection error" },
  saleRecorded: { he: "המכירה נרשמה", en: "Sale recorded" },
  recordSale: { he: "רישום מכירה", en: "Record Sale" },
  orderNumberLabel: { he: "מספר הזמנה", en: "Order" },
  noticeDismiss: { he: "סגירת ההתראה", en: "Dismiss notice" },
  helpLabel: { he: "עזרה לקופה", en: "POS help" },
  helpClose: { he: "סגירת עזרה", en: "Close help" },
  helpTitle: { he: "איך לעבוד בבטחה בקופה", en: "Working safely in POS" },
  helpMoney: {
    he: "מחיר, הנחה ומלאי מאומתים מחדש בשרת. אם הסכום שחזר שונה מהסקירה, אין תשלום ויש לבדוק את פרטי הסל.",
    en: "The server revalidates price, discount, and stock. If its total differs from the review, no tender is recorded; inspect the cart.",
  },
  helpManual: {
    he: "רישום חיצוני מתעד כסף שכבר התקבל במזומן, העברה, המחאה, כרטיס או Bit. הוא אינו מחייב ספק תשלומים. אשרו רק אחרי קבלת הכסף.",
    en: "Manual recording documents money already received by cash, transfer, check, card, or Bit. It does not charge a provider. Confirm only after receiving funds.",
  },
  helpProvider: {
    he: "גבייה דרך ספק מוצגת רק כשהיכולת מופעלת. הקישור עובר לספק; סטטוס המכירה נקבע רק מאימות שרת.",
    en: "Provider collection appears only when enabled. The link opens the provider; server verification determines the sale status.",
  },
  helpDrafts: {
    he: "טיוטות שמורות מזהי גרסאות, כמויות והנחות בלבד. מחירים וזמינות יחושבו מחדש בעת יצירת מכירה.",
    en: "Parked drafts store variant IDs, quantities, and discounts only. Prices and availability are recalculated when creating a sale.",
  },
  helpUnknown: {
    he: "אם תוצאת שמירה או תשלום אינה ידועה, בדקו סטטוס והיסטוריה לפני ניסיון נוסף. אל תיצרו מפתח חדש כדי לחזור על אותה פעולה.",
    en: "If a save or payment result is unknown, check status and history before retrying. Do not create a new key to repeat the same action.",
  },

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

  // Close confirmation
  closeConfirmTitle: { he: "אישור סגירה", en: "Confirm Close" },
  closeConfirmMessage: {
    he: "סגור את הקופה ואת כל הנתונים שלא נשמרו?",
    en: "Close POS and discard the current draft?",
  },
  closeConfirmYes: { he: "כן, סגור", en: "Yes, Close" },
  closeConfirmNo: { he: "לא, המשך", en: "No, Continue" },

  // Success
  successTitle: { he: "המכירה נרשמה בהצלחה", en: "Sale recorded successfully" },
  orderNumber: { he: "מספר הזמנה", en: "Order Number" },
} satisfies CopyMap;
