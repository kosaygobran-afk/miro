import {
  BarChart3,
  Boxes,
  FolderTree,
  GripHorizontal,
  Inbox,
  Landmark,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";

export type MgmtNavSectionKey =
  "overview" | "commerce" | "operations" | "insights" | "governance";

export type MgmtNavItemKey =
  | "overview"
  | "products"
  | "categories"
  | "services"
  | "inventory"
  | "suppliers"
  | "sales"
  | "customers"
  | "requests"
  | "analytics"
  | "finance"
  | "users"
  | "audit"
  | "settings"
  | "storefrontMerchandising";

export type MgmtNavItem = {
  key: MgmtNavItemKey;
  /** Path after the locale prefix, e.g. "/admin/products". */
  href: string;
  section: MgmtNavSectionKey;
  icon: LucideIcon;
  /**
   * Items the CEO controls. Admin (non-CEO) users still see them in the nav,
   * but the shell marks them as read-only with a "CEO only" badge.
   */
  ceoOnly: boolean;
};

export type MgmtNavSection = {
  key: MgmtNavSectionKey;
  items: MgmtNavItem[];
};

/**
 * Canonical management navigation model. Section order and item order are
 * intentional and are shared by the sidebar, the mobile drawer and the top
 * bar (breadcrumbs and titles).
 */
export const mgmtNavSections: MgmtNavSection[] = [
  {
    key: "overview",
    items: [
      {
        key: "overview",
        href: "/admin",
        section: "overview",
        icon: LayoutDashboard,
        ceoOnly: false,
      },
    ],
  },
  {
    key: "commerce",
    items: [
      {
        key: "products",
        href: "/admin/products",
        section: "commerce",
        icon: Package,
        ceoOnly: false,
      },
      {
        key: "categories",
        href: "/admin/categories",
        section: "commerce",
        icon: FolderTree,
        ceoOnly: false,
      },
      {
        key: "services",
        href: "/admin/services",
        section: "commerce",
        icon: Wrench,
        ceoOnly: false,
      },
      {
        key: "inventory",
        href: "/admin/inventory",
        section: "commerce",
        icon: Boxes,
        ceoOnly: false,
      },
      {
        key: "suppliers",
        href: "/admin/suppliers",
        section: "commerce",
        icon: Truck,
        ceoOnly: false,
      },
      {
        key: "sales",
        href: "/admin/sales",
        section: "commerce",
        icon: ShoppingCart,
        ceoOnly: false,
      },
      {
        key: "customers",
        href: "/admin/customers",
        section: "commerce",
        icon: Users,
        ceoOnly: false,
      },
      {
        key: "storefrontMerchandising",
        href: "/admin/storefront-merchandising",
        section: "commerce",
        icon: GripHorizontal,
        ceoOnly: false,
      },
    ],
  },
  {
    key: "operations",
    items: [
      {
        key: "requests",
        href: "/admin/requests",
        section: "operations",
        icon: Inbox,
        ceoOnly: false,
      },
    ],
  },
  {
    key: "insights",
    items: [
      {
        key: "analytics",
        href: "/admin/analytics",
        section: "insights",
        icon: BarChart3,
        ceoOnly: false,
      },
      {
        key: "finance",
        href: "/admin/finance",
        section: "insights",
        icon: Landmark,
        ceoOnly: false,
      },
    ],
  },
  {
    key: "governance",
    items: [
      {
        key: "users",
        href: "/admin/users",
        section: "governance",
        icon: ShieldCheck,
        ceoOnly: true,
      },
      {
        key: "audit",
        href: "/admin/audit",
        section: "governance",
        icon: ScrollText,
        ceoOnly: false,
      },
      {
        key: "settings",
        href: "/admin/settings",
        section: "governance",
        icon: Settings,
        ceoOnly: true,
      },
    ],
  },
];

export const mgmtNavItems: MgmtNavItem[] = mgmtNavSections.flatMap(
  (section) => section.items,
);

type LocalizedText = Record<Locale, string>;

const sectionLabels: Record<MgmtNavSectionKey, LocalizedText> = {
  overview: { he: "סקירה", en: "Overview" },
  commerce: { he: "מסחר", en: "Commerce" },
  operations: { he: "תפעול", en: "Operations" },
  insights: { he: "תובנות", en: "Insights" },
  governance: { he: "ממשל", en: "Governance" },
};

const itemLabels: Record<MgmtNavItemKey, LocalizedText> = {
  overview: { he: "סקירה", en: "Overview" },
  products: { he: "מוצרים", en: "Products" },
  categories: { he: "קטגוריות", en: "Categories" },
  services: { he: "שירותים", en: "Services" },
  inventory: { he: "מלאי", en: "Inventory" },
  suppliers: { he: "ספקים", en: "Suppliers" },
  sales: { he: "מכירות", en: "Sales" },
  customers: { he: "לקוחות", en: "Customers" },
  requests: { he: "פניות", en: "Requests" },
  analytics: { he: "אנליטיקה", en: "Analytics" },
  finance: { he: "כספים", en: "Finance" },
  users: { he: "משתמשים", en: "Users" },
  audit: { he: "יומן פעולות", en: "Audit" },
  settings: { he: "הגדרות", en: "Settings" },
  storefrontMerchandising: { he: "מוצרים בבר הזז", en: "Moving product rail" },
};

const itemSubtitles: Record<MgmtNavItemKey, LocalizedText> = {
  overview: {
    he: "תמונת מצב חיה של החנות, המכירות והתפעול.",
    en: "Live picture of the store, sales and operations.",
  },
  products: {
    he: "פריטי קטלוג, סטטוסים, תמחור ופרסום.",
    en: "Catalog items, statuses, pricing and publishing.",
  },
  categories: {
    he: "עץ קטגוריות הקטלוג, היררכיה וסדר תצוגה.",
    en: "Catalog category tree, hierarchy and display order.",
  },
  services: {
    he: "עמודי השירותים והפתרונות של האתר הציבורי.",
    en: "Service and solution pages on the public site.",
  },
  inventory: {
    he: "רמות מלאי, ספי התראה ותנועות מלאי.",
    en: "Stock levels, thresholds and movements.",
  },
  suppliers: {
    he: "כרטיסי ספקים ואנשי קשר לרכש.",
    en: "Supplier records and purchasing contacts.",
  },
  sales: {
    he: "הזמנות, הצעות מחיר ופעילות הכנסות.",
    en: "Orders, quotes and revenue activity.",
  },
  customers: {
    he: "חשבונות לקוחות, היסטוריה ויצירת קשר.",
    en: "Customer accounts, history and contact.",
  },
  requests: {
    he: "פניות שירות וחנות נכנסות.",
    en: "Incoming service and store enquiries.",
  },
  analytics: {
    he: "מגמות תנועה, צפיות ופניות.",
    en: "Traffic, views and enquiry trends.",
  },
  finance: {
    he: "דיווח הכנסות, מע״מ ותשלומים.",
    en: "Revenue, VAT and payment reporting.",
  },
  users: {
    he: "חשבונות, תפקידים ובקרת גישה.",
    en: "Accounts, roles and access control.",
  },
  audit: {
    he: "יומן פעולות ניהוליות.",
    en: "Management activity log.",
  },
  settings: {
    he: "הגדרות סביבת העבודה והעסק.",
    en: "Workspace and business settings.",
  },
  storefrontMerchandising: {
    he: "בחירת המוצרים שיופיעו בפס המוצרים הזז בחנות, סדר ההצגה, מבצעים ומדבקות.",
    en: "Choose products for the moving Store rail, their order, promotions and stickers.",
  },
};

/** Shared shell strings that are not tied to a specific nav entry. */
export const mgmtShellCopy = {
  navLabel: { he: "ניווט ניהול", en: "Management navigation" },
  brandName: { he: "MIRO", en: "MIRO" },
  brandTagline: { he: "קונסולת ניהול", en: "Management console" },
  breadcrumbRoot: { he: "ניהול", en: "Management" },
  ceoOnlyBadge: { he: "מנכ״ל בלבד", en: "CEO only" },
  ceoOnlyHint: {
    he: "מוצג לצפייה בלבד. עריכה באזור זה מוגבלת למנכ״ל.",
    en: "Shown read-only. Editing in this area is limited to the CEO.",
  },
  openNavigation: { he: "פתיחת ניווט", en: "Open navigation" },
  closeNavigation: { he: "סגירת ניווט", en: "Close navigation" },
  collapseSidebar: { he: "כיווץ סרגל הצד", en: "Collapse sidebar" },
  expandSidebar: { he: "הרחבת סרגל הצד", en: "Expand sidebar" },
  storefrontLink: { he: "מעבר לחנות", en: "Switch to storefront" },
  accountMenuLabel: { he: "תפריט חשבון", en: "Account menu" },
  signedInAs: { he: "מחובר/ת כ:", en: "Signed in as" },
  logout: { he: "התנתקות", en: "Log out" },
} as const satisfies Record<string, LocalizedText>;

export function mgmtNavSectionLabel(
  section: MgmtNavSectionKey,
  locale: Locale,
): string {
  return sectionLabels[section][locale];
}

export function mgmtNavItemLabel(item: MgmtNavItemKey, locale: Locale): string {
  return itemLabels[item][locale];
}

export function mgmtNavItemSubtitle(
  item: MgmtNavItemKey,
  locale: Locale,
): string {
  return itemSubtitles[item][locale];
}

export type MgmtNavMatch = {
  section: MgmtNavSection;
  item: MgmtNavItem;
};

/**
 * Resolves the active nav entry for a pathname. Exact match wins, otherwise
 * the longest matching href prefix. Falls back to the overview entry.
 */
export function matchMgmtNav(pathname: string, locale: Locale): MgmtNavMatch {
  const prefix = `/${locale}`;
  const exact = mgmtNavItems.find(
    (item) => pathname === `${prefix}${item.href}`,
  );
  const matched =
    exact ??
    mgmtNavItems
      .filter((item) => pathname.startsWith(`${prefix}${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    mgmtNavItems[0];
  const section = mgmtNavSections.find(
    (entry) => entry.key === matched.section,
  ) as MgmtNavSection;
  return { section, item: matched };
}
