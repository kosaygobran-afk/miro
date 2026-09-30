import {
  mockProducts,
  productCategories,
} from "@/features/catalog/product-data";
import { categoryLabels } from "@/features/catalog/store-copy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  Product,
  ProductVariant,
  ProductImage,
  PromoBadge,
} from "@/features/catalog/product-data";
import type {
  InventoryDefaults,
  TrackingMode,
  OutOfStockPolicy,
  ResolvedOutOfStockPolicy,
} from "@/features/catalog/inventory-types";
import { resolvePrice, type PublicPromotion } from "@/lib/catalog/pricing";

export type StoreCategory = {
  id: string;
  key: string;
  label: string;
  href: string;
  imageUrl: string | null;
};

export type StoreCatalog = {
  categories: StoreCategory[];
  products: Product[];
};

export type UserRole = "customer" | "worker" | "admin" | "ceo" | null;

export type StoreViewer = {
  role: UserRole;
  savedProductIds: string[];
};

/**
 * Global inventory defaults fetched from business_settings.
 * Cached for the request lifetime.
 */
let inventoryDefaultsCache: InventoryDefaults | null = null;

async function getInventoryDefaults(): Promise<InventoryDefaults> {
  if (inventoryDefaultsCache) return inventoryDefaultsCache;
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("business_settings")
      .select("value")
      .eq("key", "inventory_defaults")
      .maybeSingle();
    if (error || !data) {
      inventoryDefaultsCache = {
        low_stock_threshold: 3,
        out_of_stock_policy: "keep_visible_contact",
      };
      return inventoryDefaultsCache;
    }
    const value = data.value as Record<string, unknown>;
    inventoryDefaultsCache = {
      low_stock_threshold:
        typeof value.low_stock_threshold === "number"
          ? Math.max(0, Math.floor(value.low_stock_threshold))
          : 3,
      out_of_stock_policy:
        typeof value.out_of_stock_policy === "string" &&
        [
          "keep_visible_contact",
          "keep_visible_restock",
          "hide_from_public",
        ].includes(value.out_of_stock_policy)
          ? (value.out_of_stock_policy as ResolvedOutOfStockPolicy)
          : "keep_visible_contact",
    };
    return inventoryDefaultsCache;
  } catch {
    inventoryDefaultsCache = {
      low_stock_threshold: 3,
      out_of_stock_policy: "keep_visible_contact",
    };
    return inventoryDefaultsCache;
  }
}

function resolveOutOfStockPolicy(
  policy: OutOfStockPolicy,
  defaults: InventoryDefaults,
): ResolvedOutOfStockPolicy {
  if (policy === "inherit") return defaults.out_of_stock_policy;
  return policy as ResolvedOutOfStockPolicy;
}

function computeStockState(
  stockQty: number,
  lowStockThreshold: number,
): "in_stock" | "low" | "out" {
  if (stockQty <= 0) return "out";
  if (lowStockThreshold > 0 && stockQty <= lowStockThreshold) return "low";
  return "in_stock";
}

function shouldHideFromPublic(
  policy: ResolvedOutOfStockPolicy,
  stockQty: number,
): boolean {
  return policy === "hide_from_public" && stockQty <= 0;
}

export async function getStoreViewer(): Promise<StoreViewer> {
  const empty: StoreViewer = { role: null, savedProductIds: [] };
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const [roleResult, savedResult] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("saved_products")
        .select("product_id")
        .eq("user_id", user.id),
    ]);

    const rawRole = roleResult.data?.role;
    const role: UserRole =
      rawRole && ["customer", "worker", "admin", "ceo"].includes(rawRole)
        ? rawRole
        : null;
    return {
      role,
      savedProductIds: (savedResult.data ?? []).map((row) => row.product_id),
    };
  } catch {
    return empty;
  }
}

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

function normalizePrice(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function getFallbackStoreCatalog(locale: "he" | "en"): StoreCatalog {
  if (process.env.NODE_ENV === "production") {
    return { categories: [], products: [] };
  }
  return {
    categories: productCategories.map((category) => ({
      id: category.key,
      key: category.key,
      label: categoryLabels[category.key]?.[locale] ?? category.label,
      href: `/store/${category.key}`,
      imageUrl: null,
    })),
    products: mockProducts
      .slice(0, 10)
      .filter(
        (product) =>
          !shouldHideFromPublic(product.outOfStockPolicy, product.stockQty),
      )
      .map((product) => ({
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
        railSortOrder: product.badge ? 0 : null,
        rolePrice: undefined,
        promoBadges: [],
        publicPromotion: null,
        compareAtPrice: null,
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

export async function getStoreCatalog(
  locale: "he" | "en",
  role: UserRole = null,
): Promise<StoreCatalog> {
  try {
    const supabase = await createServerSupabaseClient();

    // Fetch inventory defaults first (needed for policy resolution)
    const inventoryDefaults = await getInventoryDefaults();

    const [
      categoriesResult,
      categoryIconsResult,
      productsResult,
      variantsResult,
      imagesResult,
      badgesResult,
      promotionsResult,
      railItemsResult,
    ] = await Promise.all([
      supabase
        .from("categories")
        .select("id, slug, name_he, name_en, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      // Storefront merchandising is deployed independently of the core
      // catalog. Keep this projection optional so an older database can still
      // serve products while the additive migration is being rolled out.
      supabase.from("categories").select("id, icon_image_url"),
      supabase
        .from("products")
        .select(
          "id, slug, category_id, name_he, name_en, short_description_he, short_description_en, description_he, description_en, price, image_url, is_active, is_featured, brand, model_number, specifications, warranty_he, warranty_en, status, out_of_stock_policy, expected_restock_date, tracking_mode, seo_title_he, seo_title_en, seo_description_he, seo_description_en, sort_order",
        )
        .eq("status", "active")
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select(
          "id, product_id, sku, barcode, color_he, color_en, color_hex, price_override, cost_override, is_default, is_active, stock_qty, low_stock_threshold",
        )
        .eq("is_active", true),
      supabase
        .from("product_images")
        .select("id, product_id, image_url, alt_he, alt_en, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_promo_badges")
        .select(
          "id, product_id, badge_type_id, priority, scheduled_from, scheduled_until, promo_badge_types(key, label_he, label_en, shape, tone, icon_name)",
        ),
      supabase
        .from("product_public_promotions")
        .select(
          "id, product_id, promotion_type, value, compare_at_price, is_active, scheduled_from, scheduled_until",
        ),
      supabase
        .from("storefront_rail_items")
        .select("product_id, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    if (
      categoriesResult.error ||
      productsResult.error ||
      variantsResult.error ||
      imagesResult.error
    ) {
      throw new Error(
        categoriesResult.error?.message ??
          productsResult.error?.message ??
          variantsResult.error?.message ??
          imagesResult.error?.message ??
          "Catalog fetch failed.",
      );
    }

    const variantsByProduct = new Map<string, ProductVariant[]>();
    for (const variant of variantsResult.data ?? []) {
      const list = variantsByProduct.get(variant.product_id) ?? [];
      list.push({
        id: variant.id,
        sku: variant.sku,
        colorHe: variant.color_he ?? "",
        colorEn: variant.color_en ?? "",
        colorHex: variant.color_hex ?? "#cccccc",
        price:
          variant.price_override !== null &&
          variant.price_override !== undefined
            ? Number(variant.price_override)
            : null,
        stockQty: variant.stock_qty ?? 0,
        lowStockThreshold: variant.low_stock_threshold ?? 0,
        isDefault: variant.is_default ?? false,
      });
      variantsByProduct.set(variant.product_id, list);
    }

    const imagesByProduct = new Map<string, ProductImage[]>();
    for (const image of imagesResult.data ?? []) {
      const list = imagesByProduct.get(image.product_id) ?? [];
      list.push({
        id: image.id,
        url: image.image_url,
        altHe: image.alt_he ?? undefined,
        altEn: image.alt_en ?? undefined,
        sortOrder: image.sort_order ?? 0,
      });
      imagesByProduct.set(image.product_id, list);
    }

    // Build badge map by product_id
    const badgesByProduct = new Map<string, PromoBadge[]>();
    const now = new Date().toISOString();
    for (const badge of badgesResult.data ?? []) {
      const bt = (
        badge.promo_badge_types as Array<{
          key: string;
          label_he: string;
          label_en: string;
          shape: "tag" | "burst" | "ticket" | "ribbon" | "hex";
          tone: "sale" | "best" | "new" | "hot" | "limited";
          icon_name: string | null;
          is_active: boolean;
        }>
      )[0];

      if (
        bt &&
        bt.is_active &&
        (badge.scheduled_from === null || badge.scheduled_from <= now) &&
        (badge.scheduled_until === null || badge.scheduled_until >= now)
      ) {
        const list = badgesByProduct.get(badge.product_id) ?? [];
        list.push({
          id: badge.id,
          key: bt.key,
          label: locale === "he" ? bt.label_he : bt.label_en,
          shape: bt.shape,
          tone: bt.tone,
          iconName: bt.icon_name,
        });
        badgesByProduct.set(badge.product_id, list);
      }
    }
    // Sort badges by priority (highest first)
    for (const [, badges] of badgesByProduct) {
      badges.sort((a, b) => {
        const aBadge = (badgesResult.data ?? []).find((bd) => bd.id === a.id);
        const bBadge = (badgesResult.data ?? []).find((bd) => bd.id === b.id);
        return (bBadge?.priority ?? 0) - (aBadge?.priority ?? 0);
      });
    }

    // Build promotion map by product_id
    const promotionsByProduct = new Map<string, PublicPromotion | null>();
    for (const promo of promotionsResult.data ?? []) {
      if (
        promo.is_active &&
        (promo.scheduled_from === null || promo.scheduled_from <= now) &&
        (promo.scheduled_until === null || promo.scheduled_until >= now)
      ) {
        promotionsByProduct.set(promo.product_id, {
          type: promo.promotion_type as "percent" | "fixed",
          value: Number(promo.value),
          compareAtPrice:
            promo.compare_at_price !== null
              ? Number(promo.compare_at_price)
              : null,
        });
      }
    }

    // Fetch role-based prices if role is provided
    let rolePrices: Map<string, number> = new Map();
    if (role) {
      const { data: pricesData } = await supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("role", role);

      if (pricesData) {
        rolePrices = new Map(
          pricesData.map((p) => [p.product_id, Number(p.price)]),
        );
      }
    }

    const categoryIconById = new Map(
      (categoryIconsResult.error ? [] : (categoryIconsResult.data ?? [])).map(
        (category) => [category.id, category.icon_image_url],
      ),
    );
    const categories = (categoriesResult.data ?? []).map((category) => {
      const key = getCategoryKeyFromSlug(category.slug as string);
      return {
        id: category.id as string,
        key,
        label: mapCategoryLabel(
          locale,
          category as { slug: string; name_he: string; name_en: string },
        ),
        href: `/store/${key}`,
        imageUrl: categoryIconById.get(category.id) ?? null,
      };
    });

    const categoryMap = new Map(
      (categoriesResult.data ?? []).map((c) => [c.id, c.slug]),
    );
    const railOrderByProduct = new Map(
      (railItemsResult.data ?? []).map((item) => [
        item.product_id,
        item.sort_order ?? 0,
      ]),
    );
    const managedRailAvailable = !railItemsResult.error;

    const products = (productsResult.data ?? [])
      .filter((product) => {
        const productVariants = variantsByProduct.get(product.id) ?? [];
        const stockQty = productVariants.reduce(
          (sum, v) => sum + v.stockQty,
          0,
        );
        const rawPolicy = (product.out_of_stock_policy ??
          "inherit") as OutOfStockPolicy;
        const resolvedPolicy = resolveOutOfStockPolicy(
          rawPolicy,
          inventoryDefaults,
        );
        return !shouldHideFromPublic(resolvedPolicy, stockQty);
      })
      .map((product) => {
        const productVariants = variantsByProduct.get(product.id) ?? [];
        const productImages = imagesByProduct.get(product.id) ?? [];
        const legacyImageUrl = product.image_url?.trim() || null;
        const resolvedImages = [...productImages];
        if (
          legacyImageUrl &&
          !resolvedImages.some((image) => image.url === legacyImageUrl)
        ) {
          resolvedImages.push({
            id: `${product.id}-legacy-main`,
            url: legacyImageUrl,
            altHe: undefined,
            altEn: undefined,
            sortOrder:
              resolvedImages.length > 0
                ? Math.max(...resolvedImages.map((image) => image.sortOrder)) +
                  1
                : 0,
          });
        }
        const productPrice = normalizePrice(product.price);
        const stockQty = productVariants.reduce(
          (sum, v) => sum + v.stockQty,
          0,
        );
        const maxThreshold = Math.max(
          0,
          ...productVariants.map((v) => v.lowStockThreshold ?? 0),
        );
        const stockState = computeStockState(stockQty, maxThreshold);
        const categorySlug = categoryMap.get(product.category_id) ?? "cameras";
        const categoryKey = getCategoryKeyFromSlug(categorySlug);

        // Resolve inventory settings server-side
        const rawPolicy = (product.out_of_stock_policy ??
          "inherit") as OutOfStockPolicy;
        const trackingMode = (product.tracking_mode ?? "none") as TrackingMode;
        const resolvedPolicy = resolveOutOfStockPolicy(
          rawPolicy,
          inventoryDefaults,
        );

        // Get role price if available
        const rolePrice = rolePrices.get(product.id);

        // Resolve pricing with public promotion
        const publicPromotion = promotionsByProduct.get(product.id) ?? null;
        const defaultVariant =
          productVariants.find((v) => v.isDefault) ?? productVariants[0];
        const defaultVariantId = defaultVariant?.id ?? null;

        const pricingResult = resolvePrice({
          basePrice: productPrice,
          variants: productVariants,
          selectedVariantId: null,
          defaultVariantId,
          roleOverride: rolePrice ?? null,
          variantOverride: null,
          publicPromotion,
        });

        const finalPrice = pricingResult.effectivePrice;
        const compareAtPrice = pricingResult.compareAtPrice;
        const hasPublicPromotion = pricingResult.publicPromotion !== null;

        // Get promo badges for this product
        const promoBadges = badgesByProduct.get(product.id) ?? [];

        return {
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
          shortDescription:
            locale === "he"
              ? (product.short_description_he ??
                product.short_description_en ??
                undefined)
              : (product.short_description_en ??
                product.short_description_he ??
                undefined),
          priceIls: finalPrice,
          basePriceIls: productPrice,
          category: categoryKey,
          categorySlug: categoryKey,
          categoryLabel: categories.find((c) => c.key === categoryKey)?.label,
          badge: product.is_featured
            ? locale === "he"
              ? "מהקולקציה"
              : "Collection pick"
            : undefined,
          icon: getProductIcon(categoryKey),
          isFeatured: Boolean(product.is_featured),
          railSortOrder:
            railOrderByProduct.get(product.id) ??
            (!managedRailAvailable && product.is_featured
              ? (product.sort_order ?? 0)
              : null),
          rolePrice: rolePrice,
          variants: productVariants,
          stockQty,
          stockState,
          outOfStockPolicy: resolvedPolicy, // Resolved, no "inherit"
          rawOutOfStockPolicy: rawPolicy, // Original value for admin reference
          trackingMode, // Expose tracking mode
          expectedRestockDate: product.expected_restock_date ?? null,
          slug: product.slug ?? product.id,
          brand: product.brand ?? undefined,
          modelNumber: product.model_number ?? undefined,
          specifications: product.specifications ?? undefined,
          warranty:
            locale === "he"
              ? (product.warranty_he ?? product.warranty_en ?? undefined)
              : (product.warranty_en ?? product.warranty_he ?? undefined),
          images: resolvedImages,
          seoTitle:
            locale === "he"
              ? (product.seo_title_he ?? product.seo_title_en ?? undefined)
              : (product.seo_title_en ?? product.seo_title_he ?? undefined),
          seoDescription:
            locale === "he"
              ? (product.seo_description_he ??
                product.seo_description_en ??
                undefined)
              : (product.seo_description_en ??
                product.seo_description_he ??
                undefined),
          promoBadges,
          publicPromotion: hasPublicPromotion ? publicPromotion : null,
          compareAtPrice,
        };
      });

    // Keep categories and products from the same source; mixed fallback data can
    // otherwise produce empty category pages when the live catalog is unseeded.
    if (!categories.length || !products.length)
      return getFallbackStoreCatalog(locale);
    return { categories, products };
  } catch (error) {
    console.error("Supabase catalog read failed.", error);
    return getFallbackStoreCatalog(locale);
  }
}

export type SavedProductItem = {
  productId: string;
  savedAt: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  category: string;
  categoryLabel: string | undefined;
};

/**
 * Fetches saved products with canonical public-safe data (images from product_images,
 * effective public pricing, stock state). Used by account dashboard.
 */
export async function getSavedProductsWithCanonicalData(
  locale: "he" | "en",
  userId: string,
  role: UserRole = null,
): Promise<SavedProductItem[]> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: savedProducts, error } = await supabase
      .from("saved_products")
      .select("product_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error || !savedProducts?.length) return [];

    const productIds = savedProducts.map((sp) => sp.product_id);

    const [productsResult, imagesResult, variantsResult] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, slug, category_id, name_he, name_en, short_description_he, short_description_en, description_he, description_en, price, image_url, is_active, is_featured, brand, model_number, specifications, warranty_he, warranty_en, status, out_of_stock_policy, expected_restock_date, seo_title_he, seo_title_en, seo_description_he, seo_description_en, sort_order",
        )
        .in("id", productIds)
        .eq("status", "active"),
      supabase
        .from("product_images")
        .select("id, product_id, image_url, alt_he, alt_en, sort_order")
        .in("product_id", productIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_variants")
        .select(
          "id, product_id, sku, barcode, color_he, color_en, color_hex, price_override, cost_override, is_default, is_active, stock_qty, low_stock_threshold",
        )
        .in("product_id", productIds)
        .eq("is_active", true),
    ]);

    if (productsResult.error || imagesResult.error || variantsResult.error) {
      return [];
    }

    const imagesByProduct = new Map<string, typeof imagesResult.data>();
    for (const img of imagesResult.data ?? []) {
      const list = imagesByProduct.get(img.product_id) ?? [];
      list.push(img);
      imagesByProduct.set(img.product_id, list);
    }

    const variantsByProduct = new Map<string, typeof variantsResult.data>();
    for (const variant of variantsResult.data ?? []) {
      const list = variantsByProduct.get(variant.product_id) ?? [];
      list.push(variant);
      variantsByProduct.set(variant.product_id, list);
    }

    const categoryResult = await supabase
      .from("categories")
      .select("id, slug, name_he, name_en, sort_order")
      .eq("is_active", true);

    const categoryMap = new Map(
      (categoryResult.data ?? []).map((c) => [c.id, c]),
    );

    // Fetch role-based prices if role is provided
    let rolePrices = new Map<string, number>();
    if (role) {
      const { data: pricesData } = await supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("role", role);

      if (pricesData) {
        rolePrices = new Map(
          pricesData.map((p) => [p.product_id, Number(p.price)]),
        );
      }
    }

    const result: SavedProductItem[] = [];

    for (const sp of savedProducts) {
      const product = productsResult.data?.find((p) => p.id === sp.product_id);
      if (!product) continue;

      const productImages = imagesByProduct.get(product.id) ?? [];
      const productVariants = variantsByProduct.get(product.id) ?? [];

      // Get primary image (lowest sort_order)
      const primaryImage = productImages[0] ?? null;

      // Compute effective price
      const productPrice =
        product.price !== null && product.price !== undefined
          ? Number(product.price)
          : null;
      const defaultVariant =
        productVariants.find((v) => v.is_default) ??
        productVariants.find(
          (v) => v.price_override !== null && v.price_override !== undefined,
        ) ??
        productVariants[0] ??
        null;
      const variantPrice =
        defaultVariant?.price_override !== null &&
        defaultVariant?.price_override !== undefined
          ? Number(defaultVariant.price_override)
          : null;
      const effectivePrice =
        rolePrices.get(product.id) ?? variantPrice ?? productPrice;

      const stockQty = productVariants.reduce(
        (sum, v) => sum + (v.stock_qty ?? 0),
        0,
      );
      const policy = product.out_of_stock_policy ?? "inherit";

      // Skip if should be hidden from public
      if (policy === "hide_from_public" && stockQty <= 0) {
        continue;
      }

      const category = categoryMap.get(product.category_id);
      const categorySlug = category?.slug ?? "cameras";
      const categoryKey = getCategoryKeyFromSlug(categorySlug);
      const categoryLabel =
        (locale === "he" ? category?.name_he : category?.name_en) ??
        categorySlug;

      result.push({
        productId: product.id,
        savedAt: sp.created_at,
        name:
          locale === "he"
            ? (product.name_he ?? product.name_en ?? "")
            : (product.name_en ?? product.name_he ?? ""),
        price: effectivePrice,
        imageUrl: primaryImage?.image_url ?? product.image_url ?? null,
        category: categoryKey,
        categoryLabel,
      });
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch saved products with canonical data.", error);
    return [];
  }
}
