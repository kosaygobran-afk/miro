import {
  mockProducts,
  productCategories,
} from "@/features/catalog/product-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { categoryLabels } from "@/features/catalog/store-copy";
import type { Product } from "@/features/catalog/product-data";

export type StoreCategory = {
  key: string;
  label: string;
  href: string;
};

export type StoreCatalog = {
  categories: StoreCategory[];
  products: Product[];
};

const hebrewProductNames: Record<string, string> = {
  "camera-dome-pro": "מצלמת כיפה Pro 4K",
  "camera-bullet-ai": "מצלמת צינור AI 5MP",
  "camera-ptz-outdoor": "מצלמה ממונעת 4K 25x",
  "camera-turret": "מצלמת צריח ColorNight 2K",
  "camera-fisheye": "מצלמה פנורמית 360° 12MP",
  "camera-doorbell": "פעמון וידאו חכם Pro",
  "nvr-8ch": "מקליט NVR עם 8 ערוצים",
  "nvr-16ch": "מקליט NVR AI עם 16 ערוצים",
  "nvr-32ch": "מקליט NVR עם 32 ערוצים",
  "server-storage": "שרת אחסון NAS עם 8 מפרצים",
  "nvr-poe-switch": "מתג PoE+ עם 16 חיבורים",
  "backup-appliance": "מערכת גיבוי 24TB",
  "router-wifi6-pro": "נתב Wi-Fi 6 Pro AX6000",
  "router-wifi7": "נתב Wi-Fi 7 BE11000",
  "router-edge": "נתב קצה 10G SFP+",
  "router-mesh": "מערכת Mesh Wi-Fi 6",
  "gateway-5g": "נתב חוץ 5G CPE",
  "router-vpn": "מערכת VPN לעסקים",
  "cable-cat6a": "כבל Cat6a מסוכך, 305 מטר",
  "cable-cat6": "כבל רשת Cat6, 305 מטר",
  "cable-fiber": "כבל סיב אופטי OM4, 10 מטר",
  "cable-fiber-os2": "כבל סיב אופטי OS2, 20 מטר",
  "connector-rj45": "מחברי Cat6a RJ45, מארז 50",
  "cable-hdmi": "כבל HDMI 2.1 8K, 3 מטר",
  "mount-wall": "זרוע קיר מתכווננת למצלמה",
  "mount-pole": "ערכת התקנה למצלמה על עמוד",
  "poe-injector": "מזריק מתח PoE++ 90W",
  "poe-splitter": "מפצל PoE למתח 12V / 24V",
  "ups-mini": "אל־פסק קומפקטי 650VA",
  "surge-protector": "מגן נחשולי מתח לרשת",
  "switch-24port": "מתג חכם עם 24 חיבורים",
  "switch-48port": "מתג PoE+ עם 48 חיבורים",
  "switch-8port": "מתג PoE+ עם 8 חיבורים",
  "ap-wifi6": "נקודת גישה לתקרה Wi-Fi 6",
  "ap-outdoor": "נקודת גישה לחוץ Wi-Fi 6",
  "media-converter": "זוג ממירי סיב אופטי לרשת",
};

const hebrewDescriptions: Record<string, string> = {
  cameras: "פתרון צילום לניטור המרחב, כחלק ממערכת מיגון המותאמת לבית או לעסק.",
  servers: "הקלטה ואחסון למערכות צילום, עם מקום לתכנון נפח ודרישות הרחבה.",
  routers: "תקשורת רציפה וחיבור בין המערכות, בתכנון המותאם למבנה ולמשתמשים.",
  cables: "תשתית חיבור לציוד מיגון ותקשורת, להתקנה מסודרת בהתאם למפרט הפרויקט.",
  accessories: "השלמה למערכת המיגון והתקשורת, עם התאמה לציוד ולתנאי ההתקנה.",
  networkGear: "תשתית רשת למצלמות, נקודות גישה ומכשירים מחוברים בבית ובעסק.",
};

export function getFallbackStoreCatalog(locale: "he" | "en"): StoreCatalog {
  return {
    categories: productCategories.map((category) => ({
      key: category.key,
      label: categoryLabels[category.key]?.[locale] ?? category.label,
      href: `/store/${category.key}`,
    })),
    products: mockProducts.map((product) => ({
      ...product,
      name:
        locale === "he"
          ? (hebrewProductNames[product.id] ?? product.name)
          : product.name,
      description:
        locale === "he"
          ? (hebrewDescriptions[product.category] ?? product.description)
          : product.description.replace(", lifetime warranty", ""),
      categoryLabel:
        categoryLabels[product.category]?.[locale] ?? product.category,
      badge: product.badge
        ? locale === "he"
          ? "מהקולקציה"
          : "Collection pick"
        : undefined,
      isFeatured: Boolean(product.badge),
    })),
  };
}

function mapCategoryLabel(
  locale: "he" | "en",
  rawCategory: { slug: string; name_he: string; name_en: string },
) {
  return locale === "he" ? rawCategory.name_he : rawCategory.name_en;
}

function getCategoryKeyFromSlug(slug: string) {
  const slugMap: Record<string, string> = {
    cameras: "cameras",
    "security-cameras": "cameras",
    servers: "servers",
    nvr: "servers",
    routers: "routers",
    network: "routers",
    cables: "cables",
    accessories: "accessories",
    "network-gear": "networkGear",
    networkgear: "networkGear",
    "alarm-systems": "alarms",
    "intercom-access": "intercom",
    "intercom-and-access": "intercom",
  };

  return slugMap[slug] ?? slug;
}

function getProductIcon(categoryKey: string) {
  const iconMap: Record<string, string> = {
    cameras: "camera",
    servers: "server",
    routers: "router",
    cables: "cable",
    accessories: "wrench",
    networkGear: "wifi",
    alarms: "siren",
    intercom: "key",
  };

  return iconMap[categoryKey] ?? "shieldCheck";
}

function normalizePrice(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getStoreCatalog(
  locale: "he" | "en",
): Promise<StoreCatalog> {
  try {
    const supabase = createAdminClient();

    const [categoriesResult, productsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, slug, name_he, name_en, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select(
          "id, slug, category_id, name_he, name_en, short_description_he, short_description_en, description_he, description_en, price, image_url, is_active, is_featured",
        )
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (categoriesResult.error || productsResult.error) {
      throw new Error(
        categoriesResult.error?.message ??
          productsResult.error?.message ??
          "Catalog fetch failed.",
      );
    }

    const categories = (categoriesResult.data ?? []).map((category) => {
      const key = getCategoryKeyFromSlug(category.slug as string);
      return {
        key,
        label: mapCategoryLabel(
          locale,
          category as { slug: string; name_he: string; name_en: string },
        ),
        href: `/store/${key}`,
      };
    });

    const products = (productsResult.data ?? []).map((product) => ({
      id: product.id as string,
      name:
        locale === "he"
          ? (product.name_he ?? product.name_en ?? "Product")
          : (product.name_en ?? product.name_he ?? "Product"),
      description:
        locale === "he"
          ? (product.short_description_he ??
            product.description_he ??
            product.short_description_en ??
            product.description_en ??
            "")
          : (product.short_description_en ??
            product.description_en ??
            product.short_description_he ??
            product.description_he ??
            ""),
      priceIls: normalizePrice(product.price),
      category: getCategoryKeyFromSlug(
        (product.category_id
          ? (categoriesResult.data ?? []).find(
              (category) => category.id === product.category_id,
            )?.slug
          : null) ?? "cameras",
      ),
      categoryLabel: categories.find(
        (category) =>
          category.key ===
          getCategoryKeyFromSlug(
            (categoriesResult.data ?? []).find(
              (row) => row.id === product.category_id,
            )?.slug ?? "cameras",
          ),
      )?.label,
      badge: product.is_featured
        ? locale === "he"
          ? "מהקולקציה"
          : "Collection pick"
        : undefined,
      icon: getProductIcon(
        getCategoryKeyFromSlug(
          (product.category_id
            ? (categoriesResult.data ?? []).find(
                (category) => category.id === product.category_id,
              )?.slug
            : null) ?? "cameras",
        ),
      ),
      isFeatured: Boolean(product.is_featured),
    }));

    // Keep categories and products from the same source; mixed fallback data can
    // otherwise produce empty category pages when the live catalog is unseeded.
    if (!categories.length || !products.length)
      return getFallbackStoreCatalog(locale);
    return { categories, products };
  } catch {
    return getFallbackStoreCatalog(locale);
  }
}
