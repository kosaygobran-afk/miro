"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Globe,
  Landmark,
  Search,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import Link from "@/components/motion/motion-link";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  mgmtNavItemLabel,
  mgmtNavItems,
  type MgmtNavItemKey,
} from "./shell/nav-config";
import styles from "./settings-directory.module.css";

type Localized = Record<Locale, string>;
type Destination = {
  keywords: Localized;
  ceoOnly?: boolean;
} & (
  | { key: MgmtNavItemKey; label?: Localized; anchor?: never; path?: never }
  | { key?: never; label: Localized; anchor: string; path?: never }
  | { key?: never; label: Localized; anchor?: never; path: string }
);

const groups: {
  id: string;
  label: Localized;
  icon: typeof Globe;
  destinations: Destination[];
}[] = [
  {
    id: "website",
    label: { he: "האתר הציבורי", en: "Public website" },
    icon: Globe,
    destinations: [
      {
        path: "admin/settings/page-copy",
        label: { he: "טקסטים בעמודי האתר", en: "Website page text" },
        keywords: {
          he: "כותרות פתיחה תוכן בית חנות אודות שירותים יצירת קשר",
          en: "headings copy introduction hero home store about services contact",
        },
      },
      {
        key: "storeDesign",
        keywords: {
          he: "גלריות רקע בית תמונות שירותים סמלי חברות פריסה",
          en: "gallery photos home background store design service images brand logos layout",
        },
      },
      {
        key: "services",
        label: { he: "תוכן השירותים", en: "Service page content" },
        keywords: {
          he: "תיאור פתרונות שירות פרסום סדר",
          en: "solutions copy descriptions publish order",
        },
      },
      {
        anchor: "settings-contact",
        label: { he: "פרטי קשר באתר", en: "Public contact details" },
        keywords: {
          he: "טלפון דואר מייל וואטסאפ כתובת שעות",
          en: "phone email whatsapp address opening hours",
        },
      },
      {
        anchor: "settings-glass",
        label: { he: "מראה זכוכית", en: "Glass appearance" },
        keywords: {
          he: "עיצוב כהה שקיפות זכוכית",
          en: "theme dark visual transparency",
        },
      },
      {
        anchor: "settings-animation",
        label: {
          he: "הנפשות וגרסת עיצוב",
          en: "Animations and appearance version",
        },
        keywords: {
          he: "תנועה הנפשה מהירות ערכת נושא",
          en: "motion theme speed effects product preview gallery restore",
        },
      },
    ],
  },
  {
    id: "catalog",
    label: { he: "קטלוג וחנות", en: "Catalog and storefront" },
    icon: ShoppingBag,
    destinations: [
      {
        key: "products",
        label: {
          he: "מוצרים, וריאנטים ומחירים",
          en: "Products, variants and prices",
        },
        keywords: {
          he: "קטלוג מחיר אפשרויות תמונות מק״ט",
          en: "catalog pricing offers product images sku visibility",
        },
      },
      {
        key: "categories",
        keywords: {
          he: "קטלוג סידור קטגוריות משנה",
          en: "catalog hierarchy subcategories navigation",
        },
      },
      {
        path: "admin/categories#store-category-grid",
        label: {
          he: "עיצוב רשת הקטגוריות בחנות",
          en: "Store category grid artwork",
        },
        keywords: {
          he: "קטגוריות ראשיות שמות תמונות ציור אייקון סמל SVG",
          en: "main category names images photography illustration icon SVG artwork",
        },
        ceoOnly: true,
      },
      {
        key: "storefrontMerchandising",
        keywords: {
          he: "פס מוצרים בר מבצעים מדבקות קולקציה",
          en: "featured products promotions stickers collection badges",
        },
      },
      {
        anchor: "settings-inventory",
        label: { he: "ברירות מחדל למלאי", en: "Inventory defaults" },
        keywords: {
          he: "מלאי נמוך סף אזל מוסתר",
          en: "stock threshold out of stock hide visibility",
        },
      },
      {
        key: "inventory",
        keywords: {
          he: "כמויות מלאי התראות תנועות",
          en: "stock levels counts movements thresholds",
        },
      },
    ],
  },
  {
    id: "business",
    label: { he: "עסק וכספים", en: "Business and finance" },
    icon: Landmark,
    destinations: [
      {
        anchor: "settings-tax",
        label: { he: "שיעורי מס", en: "Tax rates" },
        keywords: { he: "מע״מ מתוזמן", en: "VAT schedule rate" },
      },
      {
        anchor: "settings-finance",
        label: {
          he: "מדיניות מחירים ומטבע",
          en: "Pricing and currency policy",
        },
        keywords: { he: "שקל מטבע מע״מ", en: "ILS VAT inclusive" },
      },
      {
        key: "integrations",
        keywords: {
          he: "זהות עסקית תשלומים ספקים חשבוניות מוכנות",
          en: "legal business identity invoices pay payments fiscal providers readiness",
        },
      },
      {
        key: "documents",
        label: { he: "מסמכים ותצוגות מקדימות", en: "Documents and previews" },
        keywords: {
          he: "טיוטות תבניות חשבוניות קבלות",
          en: "template PDF invoice receipt drafts",
        },
      },
    ],
  },
  {
    id: "access",
    label: { he: "משתמשים והרשאות", en: "Users and access" },
    icon: ShieldCheck,
    destinations: [
      {
        key: "users",
        label: { he: "משתמשים, תפקידים וגישה", en: "Users, roles and access" },
        keywords: {
          he: "עובד לקוח מנהל הרשאות חסימה השעיה",
          en: "staff worker customer admin permissions block suspend",
        },
      },
      {
        anchor: "settings-ceo-security",
        label: { he: "אבטחת חשבון מנכ״ל", en: "CEO account security" },
        keywords: {
          he: "סיסמה דואר אלקטרוני הוספה מחיקה",
          en: "password email add promote delete",
        },
        ceoOnly: true,
      },
      {
        key: "audit",
        keywords: {
          he: "יומן שינויים פעילות",
          en: "settings changes activity history log",
        },
      },
    ],
  },
];

const navHref = new Map(mgmtNavItems.map(({ key, href }) => [key, href]));

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/["'״׳]/g, "")
    .trim();
}

export function SettingsDirectory({
  locale,
  isCeo,
}: {
  locale: Locale;
  isCeo: boolean;
}) {
  const he = locale === "he";
  const [query, setQuery] = useState("");
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const visible = groups
    .map((group) => ({
      ...group,
      destinations: group.destinations.flatMap((entry) => {
        if (entry.ceoOnly && !isCeo) return [];
        const label =
          entry.label?.[locale] ??
          (entry.key && mgmtNavItemLabel(entry.key, locale));
        const target = entry.key ? navHref.get(entry.key) : entry.path;
        if (!label || (!target && !entry.anchor)) return [];
        const searchable = normalizeSearch(
          [
            group.label.he,
            group.label.en,
            label,
            entry.key && mgmtNavItemLabel(entry.key, he ? "en" : "he"),
            entry.label?.[he ? "en" : "he"],
            entry.keywords.he,
            entry.keywords.en,
          ]
            .filter(Boolean)
            .join(" "),
        );
        if (!terms.every((term) => searchable.includes(term))) return [];
        const href = target ? withLocale(locale, target) : `#${entry.anchor}`;
        return [{ href, label, local: !target }];
      }),
    }))
    .filter((group) => group.destinations.length > 0);
  const resultCount = visible.reduce(
    (count, group) => count + group.destinations.length,
    0,
  );

  return (
    <nav
      className={styles.directory}
      aria-label={he ? "מדריך ההגדרות" : "Settings directory"}
    >
      <label className={styles.search}>
        <span>{he ? "חיפוש בהגדרות" : "Search settings"}</span>
        <span className={styles.searchField}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            className="mgmt-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>
      </label>
      <p role="status" className="mgmt-visually-hidden">
        {terms.length > 0 && resultCount > 0
          ? he
            ? `${resultCount} תוצאות`
            : `${resultCount} results`
          : ""}
      </p>
      {visible.length > 0 ? (
        <div className={styles.groups}>
          {visible.map(({ id, label, icon: Icon, destinations }) => (
            <section
              key={id}
              className={styles.group}
              aria-labelledby={`settings-directory-${id}`}
            >
              <h2 id={`settings-directory-${id}`}>
                <Icon size={20} aria-hidden="true" />
                {label[locale]}
              </h2>
              <ul>
                {destinations.map(({ href, label, local }) => (
                  <li key={href}>
                    {local ? (
                      <a href={href} className={styles.destination}>
                        <span>{label}</span>
                        <ArrowDown size={16} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link
                        href={href}
                        prefetch={false}
                        className={styles.destination}
                      >
                        <span>{label}</span>
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className={styles.empty} role="status">
          {he ? "לא נמצאו הגדרות תואמות." : "No settings match your search."}
        </p>
      )}
    </nav>
  );
}
