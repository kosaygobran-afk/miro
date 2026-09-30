"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Notice,
  PageHeader,
  StatusBadge,
  ConfirmationDialog,
  FormField,
} from "../ui";
import { PromoBadge } from "@/features/catalog/product-promo-badge";
import type { PromoBadge as StorePromoBadge } from "@/features/catalog/product-data";
import { storefrontMerchandisingCopy as copy } from "./copy";
import styles from "./storefront-merchandising.module.css";

type RailItem = {
  id: string;
  product_id: string;
  sort_order: number;
  is_active: boolean;
  scheduled_from: string | null;
  scheduled_until: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  products: {
    id: string;
    slug: string;
    name_he: string;
    name_en: string;
    price: number;
    image_url: string | null;
    status: string;
  } | null;
};

type ProductLookupResult = {
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    color_he: string | null;
    color_en: string | null;
    color_hex: string | null;
    price_override: number | null;
    is_default: boolean;
    is_active: boolean;
    stock_qty: number;
    low_stock_threshold: number | null;
  };
  product: {
    id: string;
    name_he: string;
    name_en: string;
    slug: string;
    status: string;
    price: number;
    sale_price: number | null;
    product_prices: Array<{ role: string; price: number }>;
  } | null;
};

type BadgeType = {
  id: string;
  key: string;
  label_he: string;
  label_en: string;
  shape: "tag" | "burst" | "ticket" | "ribbon" | "hex";
  tone: "sale" | "best" | "new" | "hot" | "limited";
  icon_name: string | null;
  sort_order: number;
  is_active: boolean;
};

type ProductBadge = {
  id: string;
  product_id: string;
  badge_type_id: string;
  priority: number;
  scheduled_from: string | null;
  scheduled_until: string | null;
  created_by: string;
  created_at: string;
  promo_badge_types?: BadgeType | null;
};

type Promotion = {
  id: string;
  product_id: string;
  promotion_type: "percent" | "fixed";
  value: number;
  compare_at_price: number | null;
  is_active: boolean;
  scheduled_from: string | null;
  scheduled_until: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type RailItemWithDetails = RailItem & {
  productBadges: ProductBadge[];
  promotion: Promotion | null;
};

type BadgeForm = Partial<BadgeType> & {
  _errors?: Record<string, string>;
};

type PromotionForm = Partial<Promotion> & {
  _errors?: Record<string, string>;
};

type RailForm = Pick<
  RailItem,
  "is_active" | "scheduled_from" | "scheduled_until"
>;

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function StorefrontMerchandising({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [railItems, setRailItems] = useState<RailItemWithDetails[]>([]);
  const [badgeTypes, setBadgeTypes] = useState<BadgeType[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const hasLoaded = useRef(false);
  const [productSearch, setProductSearch] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<
    ProductLookupResult[]
  >([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [editingRailItem, setEditingRailItem] =
    useState<RailItemWithDetails | null>(null);
  const [editingBadge, setEditingBadge] = useState<BadgeType | null>(null);
  const [badgeForm, setBadgeForm] = useState<BadgeForm>({});
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(
    null,
  );
  const [promotionForm, setPromotionForm] = useState<PromotionForm>({});
  const [railForm, setRailForm] = useState<RailForm>({
    is_active: true,
    scheduled_from: null,
    scheduled_until: null,
  });

  const [saving, setSaving] = useState(false);
  const [pendingDeleteBadge, setPendingDeleteBadge] =
    useState<BadgeType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  const [pendingDeleteRailItem, setPendingDeleteRailItem] =
    useState<RailItemWithDetails | null>(null);

  const [addProductDialogOpen, setAddProductDialogOpen] = useState(false);
  const [editRailItemDialogOpen, setEditRailItemDialogOpen] = useState(false);
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);

  const showNotice = useCallback((tone: "success" | "danger", text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice({ tone, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoadState("loading");
      const [railRes, badgesRes] = await Promise.all([
        fetch("/api/management/storefront/rail", { cache: "no-store" }),
        fetch("/api/management/storefront/badges", { cache: "no-store" }),
      ]);

      const [railData, badgesData] = await Promise.all([
        railRes.json(),
        badgesRes.json(),
      ]);

      if (!railRes.ok) throw new Error(railData.error || "load_failed");
      if (!badgesRes.ok) throw new Error(badgesData.error || "load_failed");

      const items = (railData.railItems ?? []) as RailItem[];
      const types = (badgesData.badgeTypes ?? []) as BadgeType[];

      // Fetch badges and promotions for each rail item
      const itemsWithDetails = await Promise.all(
        items.map(async (item) => {
          const [badgesRes, promoRes] = await Promise.all([
            fetch(
              `/api/management/storefront/product-badges?product_id=${item.product_id}`,
              {
                cache: "no-store",
              },
            ),
            fetch(
              `/api/management/storefront/promotions?product_id=${item.product_id}`,
              {
                cache: "no-store",
              },
            ),
          ]);
          const badgesData = await badgesRes.json();
          const promoData = await promoRes.json();
          if (!badgesRes.ok || !promoRes.ok) {
            throw new Error("product_merchandising_load_failed");
          }
          return {
            ...item,
            productBadges: badgesData.productBadges ?? [],
            promotion: promoData.promotions?.[0] ?? null,
          };
        }),
      );

      setRailItems(itemsWithDetails);
      setEditingRailItem((current) =>
        current
          ? (itemsWithDetails.find((item) => item.id === current.id) ?? current)
          : null,
      );
      setBadgeTypes(types);
      hasLoaded.current = true;
      setLoadState("ready");
    } catch {
      if (!hasLoaded.current) {
        setLoadState("error");
      } else {
        showNotice("danger", copy[locale].loadErrorTitle);
      }
    }
  }, [locale, showNotice]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // Debounced product search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!productSearch.trim()) {
        setProductSearchResults([]);
        return;
      }
      setProductSearchLoading(true);
      try {
        const res = await fetch(
          `/api/management/product-lookup?q=${encodeURIComponent(productSearch)}&limit=20`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (res.ok) {
          setProductSearchResults(data.results ?? []);
        }
      } catch {
        setProductSearchResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const productName = useCallback(
    (product: RailItem["products"]) => {
      if (!product) return "—";
      return he ? product.name_he : product.name_en;
    },
    [he],
  );

  const formatPrice = useCallback(
    (price: number) => {
      return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", {
        style: "currency",
        currency: "ILS",
      }).format(price);
    },
    [locale],
  );

  const toggleRailItemActive = useCallback(
    async (item: RailItemWithDetails, active: boolean) => {
      try {
        const response = await fetch("/api/management/storefront/rail", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, is_active: active }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        showNotice(
          "success",
          active ? copy[locale].reactivated : copy[locale].deactivated,
        );
        await load();
      } catch {
        showNotice("danger", copy[locale].saveFailed);
      }
    },
    [load, showNotice, locale],
  );

  const moveRailItem = useCallback(
    async (item: RailItemWithDetails, delta: number) => {
      const ordered = [...railItems].sort(
        (first, second) => first.sort_order - second.sort_order,
      );
      const currentIndex = ordered.findIndex((entry) => entry.id === item.id);
      const target = ordered[currentIndex + delta];
      if (!target) return;
      try {
        setReordering(true);
        const firstResponse = await fetch("/api/management/storefront/rail", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            sort_order: target.sort_order,
          }),
        });
        if (!firstResponse.ok) throw new Error("reorder_failed");

        const secondResponse = await fetch("/api/management/storefront/rail", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: target.id,
            sort_order: item.sort_order,
          }),
        });
        if (!secondResponse.ok) {
          await fetch("/api/management/storefront/rail", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, sort_order: item.sort_order }),
          });
          throw new Error("reorder_failed");
        }
        setRailItems((prev) =>
          prev
            .map((entry) =>
              entry.id === item.id
                ? { ...entry, sort_order: target.sort_order }
                : entry.id === target.id
                  ? { ...entry, sort_order: item.sort_order }
                  : entry,
            )
            .sort((a, b) => a.sort_order - b.sort_order),
        );
      } catch {
        showNotice("danger", copy[locale].saveFailed);
      } finally {
        setReordering(false);
      }
    },
    [railItems, showNotice, locale],
  );

  const removeRailItem = useCallback(
    async (item: RailItemWithDetails) => {
      try {
        const response = await fetch(
          `/api/management/storefront/rail?id=${item.id}`,
          {
            method: "DELETE",
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        showNotice("success", copy[locale].removed);
        await load();
      } catch {
        showNotice("danger", copy[locale].deleteFailed);
      }
    },
    [load, showNotice, locale],
  );

  const addProductToRail = useCallback(
    async (productId: string) => {
      const maxOrder = Math.max(0, ...railItems.map((i) => i.sort_order));
      try {
        const response = await fetch("/api/management/storefront/rail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            sort_order: maxOrder + 1,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        showNotice("success", copy[locale].added);
        setAddProductDialogOpen(false);
        setProductSearch("");
        await load();
      } catch {
        showNotice("danger", copy[locale].saveFailed);
      }
    },
    [railItems, load, showNotice, locale],
  );

  const handleBadgeFormChange = useCallback((key: string, value: unknown) => {
    setBadgeForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveBadgeType = useCallback(async () => {
    if (saving) return;
    const errors: Record<string, string> = {};
    if (!badgeForm.key?.trim()) errors.key = copy[locale].errorKeyRequired;
    if (!badgeForm.label_he?.trim() || !badgeForm.label_en?.trim()) {
      errors.label_he = copy[locale].errorLabelRequired;
    }
    if (Object.keys(errors).length > 0) {
      setBadgeForm((prev) => ({ ...prev, _errors: errors }));
      return;
    }

    setSaving(true);
    try {
      const { _errors: _ignoredErrors, ...payload } = badgeForm;
      void _ignoredErrors;
      const url = "/api/management/storefront/badges";
      const method = editingBadge ? "PATCH" : "POST";
      const body = editingBadge
        ? { id: editingBadge.id, ...payload }
        : payload;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice(
        "success",
        editingBadge ? copy[locale].badgeUpdated : copy[locale].badgeCreated,
      );
      setBadgeDialogOpen(false);
      await load();
    } catch {
      showNotice("danger", copy[locale].saveFailed);
    } finally {
      setSaving(false);
    }
  }, [badgeForm, editingBadge, load, showNotice, locale, saving]);

  const deleteBadgeType = useCallback(async () => {
    if (!pendingDeleteBadge || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/management/storefront/badges?id=${pendingDeleteBadge.id}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice("success", copy[locale].badgeDeleted);
      setPendingDeleteBadge(null);
      await load();
    } catch {
      showNotice("danger", copy[locale].deleteFailed);
    } finally {
      setDeleting(false);
    }
  }, [pendingDeleteBadge, load, showNotice, locale, deleting]);

  const addBadgeToRailItem = useCallback(
    async (productId: string, badgeTypeId: string) => {
      try {
        const response = await fetch(
          "/api/management/storefront/product-badges",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: productId,
              badge_type_id: badgeTypeId,
            }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        showNotice("success", copy[locale].badgeAssigned);
        await load();
      } catch {
        showNotice("danger", copy[locale].saveFailed);
      }
    },
    [load, showNotice, locale],
  );

  const removeBadgeFromRailItem = useCallback(
    async (badgeId: string) => {
      try {
        const response = await fetch(
          `/api/management/storefront/product-badges?id=${badgeId}`,
          {
            method: "DELETE",
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        showNotice("success", copy[locale].badgeRemoved);
        await load();
      } catch {
        showNotice("danger", copy[locale].saveFailed);
      }
    },
    [load, showNotice, locale],
  );

  const updateBadgePriority = useCallback(
    async (badgeId: string, priority: number) => {
      try {
        const response = await fetch(
          "/api/management/storefront/product-badges",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: badgeId, priority }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await load();
      } catch {
        showNotice("danger", copy[locale].saveFailed);
      }
    },
    [load, showNotice, locale],
  );

  const savePromotion = useCallback(async () => {
    if (saving) return;
    const errors: Record<string, string> = {};
    if (!promotionForm.promotion_type)
      errors.promotion_type = copy[locale].errorPromoType;
    if (promotionForm.value === undefined || promotionForm.value === null) {
      errors.value = copy[locale].errorPromoValue;
    }
    if (
      promotionForm.promotion_type === "percent" &&
      ((promotionForm.value as number) <= 0 ||
        (promotionForm.value as number) > 95)
    ) {
      errors.value = copy[locale].errorPromoPercent;
    }
    if (
      promotionForm.promotion_type === "fixed" &&
      (promotionForm.value as number) <= 0
    ) {
      errors.value = copy[locale].errorPromoValue;
    }
    if (Object.keys(errors).length > 0) {
      setPromotionForm((prev) => ({ ...prev, _errors: errors }));
      return;
    }

    setSaving(true);
    try {
      const { _errors: _ignoredErrors, ...payload } = promotionForm;
      void _ignoredErrors;
      const method = editingPromotion ? "PATCH" : "POST";
      const url = "/api/management/storefront/promotions";
      const body = editingPromotion
        ? { id: editingPromotion.id, ...payload }
        : { product_id: editingRailItem?.products?.id, ...payload };
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice(
        "success",
        editingPromotion
          ? copy[locale].promoUpdated
          : copy[locale].promoCreated,
      );
      setPromotionDialogOpen(false);
      await load();
    } catch {
      showNotice("danger", copy[locale].saveFailed);
    } finally {
      setSaving(false);
    }
  }, [
    promotionForm,
    editingPromotion,
    editingRailItem,
    load,
    showNotice,
    locale,
    saving,
  ]);

  const deletePromotion = useCallback(async () => {
    if (!editingPromotion) return;
    try {
      const response = await fetch(
        `/api/management/storefront/promotions?id=${editingPromotion.id}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice("success", copy[locale].promoDeleted);
      setPromotionDialogOpen(false);
      await load();
    } catch {
      showNotice("danger", copy[locale].deleteFailed);
    }
  }, [editingPromotion, load, showNotice, locale]);

  const openRailEditor = useCallback((item: RailItemWithDetails) => {
    setEditingRailItem(item);
    setRailForm({
      is_active: item.is_active,
      scheduled_from: item.scheduled_from,
      scheduled_until: item.scheduled_until,
    });
    setEditRailItemDialogOpen(true);
  }, []);

  const saveRailSettings = useCallback(async () => {
    if (!editingRailItem || saving) return;
    if (
      railForm.scheduled_from &&
      railForm.scheduled_until &&
      new Date(railForm.scheduled_from) >= new Date(railForm.scheduled_until)
    ) {
      showNotice(
        "danger",
        he
          ? "מועד הסיום חייב להיות מאוחר ממועד ההתחלה."
          : "The end date must be later than the start date.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/management/storefront/rail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingRailItem.id, ...railForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditRailItemDialogOpen(false);
      showNotice(
        "success",
        he ? "הגדרות הפס נשמרו." : "Rail settings saved.",
      );
      await load();
    } catch {
      showNotice("danger", copy[locale].saveFailed);
    } finally {
      setSaving(false);
    }
  }, [editingRailItem, he, load, locale, railForm, saving, showNotice]);

  const openPromotionEditor = useCallback((item: RailItemWithDetails) => {
    setEditingRailItem(item);
    setEditingPromotion(item.promotion);
    setPromotionForm(
      item.promotion
        ? {
            promotion_type: item.promotion.promotion_type,
            value: item.promotion.value,
            compare_at_price: item.promotion.compare_at_price,
            is_active: item.promotion.is_active,
            scheduled_from: item.promotion.scheduled_from,
            scheduled_until: item.promotion.scheduled_until,
          }
        : {
            promotion_type: "percent",
            value: 10,
            compare_at_price: null,
            is_active: true,
            scheduled_from: null,
            scheduled_until: null,
          },
    );
    setPromotionDialogOpen(true);
  }, []);

  const getBadgeType = useCallback(
    (badgeTypeId: string) => badgeTypes.find((b) => b.id === badgeTypeId),
    [badgeTypes],
  );

  const renderPreviewBadge = useCallback(
    (badgeType: BadgeType) => {
      const badge: StorePromoBadge = {
        id: badgeType.id,
        key: badgeType.key,
        label: he ? badgeType.label_he : badgeType.label_en,
        shape: badgeType.shape,
        tone: badgeType.tone,
        iconName: badgeType.icon_name,
      };
      return (
        <PromoBadge badge={badge} locale={locale} size="sm" />
      );
    },
    [he, locale],
  );

  const sortedRailItems = useMemo(
    () => [...railItems].sort((a, b) => a.sort_order - b.sort_order),
    [railItems],
  );
  const availableProducts = useMemo(() => {
    const existing = new Set(railItems.map((item) => item.product_id));
    const unique = new Map<string, ProductLookupResult["product"]>();
    for (const result of productSearchResults) {
      if (result.product && !existing.has(result.product.id)) {
        unique.set(result.product.id, result.product);
      }
    }
    return [...unique.values()].filter(
      (product): product is NonNullable<ProductLookupResult["product"]> =>
        product !== null,
    );
  }, [productSearchResults, railItems]);

  const ui = he
    ? {
        cancel: "ביטול",
        save: "שמירה",
        saving: "שומר…",
        search: "חיפוש לפי שם, מק״ט או ברקוד",
        searchHint: "הקלידו לפחות שני תווים כדי למצוא מוצר פעיל.",
        noResults: "לא נמצאו מוצרים זמינים להוספה.",
        editRail: "עריכת מוצר בפס",
        railDescription: "הפעלה ותזמון קובעים מתי המוצר יופיע בפס הציבורי.",
        start: "מועד התחלה",
        end: "מועד סיום",
        active: "פעיל בחנות",
        badges: "מדבקות למוצר",
        promotion: "מבצע ציבורי",
        addPromotion: "הגדרת מבצע",
        editPromotion: "עריכת מבצע",
        priority: "עדיפות",
        badgeTitle: editingBadge ? "עריכת סוג מדבקה" : "סוג מדבקה חדש",
        badgeDescription: "הגדירו טקסט דו־לשוני, צורה וצבע לשימוש חוזר.",
        key: "מפתח פנימי",
        labelHe: "תווית בעברית",
        labelEn: "תווית באנגלית",
        shape: "צורה",
        tone: "צבע",
        icon: "שם אייקון",
        sortOrder: "סדר",
        promoDescription: "המבצע יחושב על המחיר שנפתר עבור הלקוח והמוצר.",
        promoType: "סוג מבצע",
        percent: "אחוז הנחה",
        fixed: "סכום קבוע",
        value: "ערך",
        compareAt: "מחיר לפני מבצע (אופציונלי)",
        removePromotion: "מחיקת המבצע",
        deleteProductTitle: "הסרת מוצר מהפס?",
        deleteProductDescription: "המוצר יוסר מהפס בלבד ולא יימחק מהקטלוג.",
        deleteBadgeTitle: "מחיקת סוג המדבקה?",
        deleteBadgeDescription: "לא ניתן לשחזר את סוג המדבקה לאחר המחיקה.",
        confirmDelete: "מחיקה",
      }
    : {
        cancel: "Cancel",
        save: "Save",
        saving: "Saving…",
        search: "Search by name, SKU or barcode",
        searchHint: "Enter at least two characters to find an active product.",
        noResults: "No available products found.",
        editRail: "Edit rail product",
        railDescription: "Activation and scheduling control when this product appears publicly.",
        start: "Start date",
        end: "End date",
        active: "Active in store",
        badges: "Product stickers",
        promotion: "Public promotion",
        addPromotion: "Set promotion",
        editPromotion: "Edit promotion",
        priority: "Priority",
        badgeTitle: editingBadge ? "Edit badge type" : "New badge type",
        badgeDescription: "Define reusable bilingual copy, shape, and color.",
        key: "Internal key",
        labelHe: "Hebrew label",
        labelEn: "English label",
        shape: "Shape",
        tone: "Color",
        icon: "Icon name",
        sortOrder: "Order",
        promoDescription: "The promotion is calculated from the resolved customer and product price.",
        promoType: "Promotion type",
        percent: "Percentage off",
        fixed: "Fixed amount",
        value: "Value",
        compareAt: "Compare-at price (optional)",
        removePromotion: "Delete promotion",
        deleteProductTitle: "Remove product from rail?",
        deleteProductDescription: "This removes it from the rail only, not from the catalog.",
        deleteBadgeTitle: "Delete badge type?",
        deleteBadgeDescription: "The badge type cannot be restored after deletion.",
        confirmDelete: "Delete",
      };

  if (loadState === "loading") {
    return (
      <div className={styles.stack}>
        <PageHeader
          title={copy[locale].pageTitle}
          subtitle={copy[locale].pageSubtitle}
        />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className={styles.stack}>
        <PageHeader
          title={copy[locale].pageTitle}
          subtitle={copy[locale].pageSubtitle}
        />
        <ErrorState
          title={copy[locale].loadErrorTitle}
          onRetry={() => {
            setLoadState("loading");
            void load();
          }}
          retryLabel={copy[locale].retry}
        />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={copy[locale].pageTitle}
        subtitle={copy[locale].pageSubtitle}
        actions={
          <button
            type="button"
            className="mgmt-button mgmt-button--primary"
            onClick={() => setAddProductDialogOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            {copy[locale].addProduct}
          </button>
        }
      />

      {notice ? (
        <Notice
          tone={notice.tone}
          onDismiss={() => setNotice(null)}
          dismissLabel={copy[locale].closeDialog}
        >
          {notice.text}
        </Notice>
      ) : null}

      {/* Moving Rail Section */}
      <section className={styles.section} aria-labelledby="rail-heading">
        <h2 id="rail-heading" className={styles.sectionTitle}>
          {copy[locale].railSectionTitle}
        </h2>
        <p className={styles.sectionSubtitle}>
          {copy[locale].railSectionSubtitle}
        </p>

        <DataTable
          caption={copy[locale].railTableCaption}
          isEmpty={sortedRailItems.length === 0}
          emptyState={
            <EmptyState
              icon={<Package size={20} />}
              title={copy[locale].railEmptyTitle}
              description={copy[locale].railEmptyDescription}
              action={
                <button
                  type="button"
                  className="mgmt-button mgmt-button--primary"
                  onClick={() => setAddProductDialogOpen(true)}
                >
                  <Plus size={16} aria-hidden="true" />
                  {copy[locale].addProduct}
                </button>
              }
              compact
            />
          }
          minWidth="72rem"
          head={
            <tr>
              <th scope="col">{copy[locale].railColPosition}</th>
              <th scope="col">{copy[locale].railColProduct}</th>
              <th scope="col">{copy[locale].railColPrice}</th>
              <th scope="col">{copy[locale].railColStatus}</th>
              <th scope="col">{copy[locale].railColPromotion}</th>
              <th scope="col">{copy[locale].railColBadges}</th>
              <th scope="col">{copy[locale].railColSchedule}</th>
              <th scope="col">{copy[locale].railColActions}</th>
            </tr>
          }
        >
          {sortedRailItems.map((item, index) => (
            <tr key={item.id} className={styles.railRow}>
              <td className={styles.positionCell}>
                <span className={styles.positionValue}>{index + 1}</span>
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() => index > 0 && moveRailItem(item, -1)}
                  aria-label={copy[locale].moveUp}
                  disabled={index === 0 || reordering}
                >
                  <ChevronUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.stepperButton}
                  onClick={() =>
                    index < sortedRailItems.length - 1 && moveRailItem(item, 1)
                  }
                  aria-label={copy[locale].moveDown}
                  disabled={index === sortedRailItems.length - 1 || reordering}
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              </td>
              <td>
                <div className={styles.productCell}>
                  {item.products?.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.products.image_url}
                      alt=""
                      className={styles.productThumb}
                      loading="lazy"
                    />
                  )}
                  <div className={styles.productInfo}>
                    <span className={styles.productName} dir="auto">
                      {productName(item.products)}
                    </span>
                    <span className={styles.productMeta} dir="auto">
                      {item.products?.slug}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <span className={styles.priceCell}>
                  {item.products ? formatPrice(item.products.price) : "—"}
                </span>
              </td>
              <td>
                <StatusBadge
                  status={
                    item.products?.status === "active" ? "active" : "archived"
                  }
                  size="sm"
                >
                  {item.is_active
                    ? copy[locale].statusActive
                    : copy[locale].statusInactive}
                </StatusBadge>
              </td>
              <td>
                {item.promotion ? (
                  <div className={styles.promoCell}>
                    <span className={styles.promoBadge}>
                      {item.promotion.promotion_type === "percent"
                        ? `-${item.promotion.value}%`
                        : `-${formatPrice(item.promotion.value)}`}
                    </span>
                    {item.promotion.scheduled_from && (
                      <span className={styles.promoSchedule}>
                        {new Date(
                          item.promotion.scheduled_from,
                        ).toLocaleDateString(locale)}
                        {item.promotion.scheduled_until && (
                          <>
                            &nbsp;–&nbsp;
                            {new Date(
                              item.promotion.scheduled_until,
                            ).toLocaleDateString(locale)}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className={styles.noPromo}>
                    {copy[locale].noPromotion}
                  </span>
                )}
              </td>
              <td>
                <div className={styles.badgeChips}>
                  {item.productBadges.map((pb) => {
                    const bt =
                      pb.promo_badge_types || getBadgeType(pb.badge_type_id);
                    return bt ? (
                      <span key={pb.id} className={styles.badgeChip}>
                        {renderPreviewBadge(bt)}
                        <button
                          type="button"
                          className={styles.removeBadgeButton}
                          onClick={() => removeBadgeFromRailItem(pb.id)}
                          aria-label={copy[locale].removeBadge}
                        >
                          <X size={10} aria-hidden="true" />
                        </button>
                      </span>
                    ) : null;
                  })}
                  <button
                    type="button"
                    className={styles.addBadgeButton}
                    onClick={() => openRailEditor(item)}
                    aria-label={copy[locale].addBadge}
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </div>
              </td>
              <td>
                <div className={styles.scheduleCell}>
                  {item.scheduled_from && (
                    <span className={styles.scheduleItem}>
                      {copy[locale].from}:{" "}
                      {new Date(item.scheduled_from).toLocaleDateString(locale)}
                    </span>
                  )}
                  {item.scheduled_until && (
                    <span className={styles.scheduleItem}>
                      {copy[locale].until}:{" "}
                      {new Date(item.scheduled_until).toLocaleDateString(
                        locale,
                      )}
                    </span>
                  )}
                  {!item.scheduled_from && !item.scheduled_until && (
                    <span className={styles.noSchedule}>
                      {copy[locale].noSchedule}
                    </span>
                  )}
                </div>
              </td>
              <td>
                <div className={styles.actionsCell}>
                  <button
                    type="button"
                    className="mgmt-button mgmt-button--secondary mgmt-button--sm"
                    onClick={() => openRailEditor(item)}
                  >
                    {copy[locale].edit}
                  </button>
                  {item.is_active ? (
                    <button
                      type="button"
                      className="mgmt-button mgmt-button--secondary mgmt-button--sm"
                      onClick={() => toggleRailItemActive(item, false)}
                    >
                      {copy[locale].deactivate}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mgmt-button mgmt-button--secondary mgmt-button--sm"
                      onClick={() => toggleRailItemActive(item, true)}
                    >
                      {copy[locale].activate}
                    </button>
                  )}
                  <button
                    type="button"
                    className="mgmt-button mgmt-button--danger mgmt-button--sm"
                    onClick={() => setPendingDeleteRailItem(item)}
                    aria-label={copy[locale].delete}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>

        {/* Live Preview */}
        <div
          className={styles.previewSection}
          aria-labelledby="preview-heading"
        >
          <h3 id="preview-heading" className={styles.previewTitle}>
            {copy[locale].previewTitle}
          </h3>
          <div
            className={styles.previewRail}
            role="region"
            aria-label={copy[locale].previewAriaLabel}
          >
            {sortedRailItems.slice(0, 5).map(
              (item, _idx) => (
                void _idx,
                (
                  <div key={item.id} className={styles.previewCard}>
                    {item.products?.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.products.image_url}
                        alt=""
                        className={styles.previewImage}
                        loading="lazy"
                      />
                    )}
                    <div className={styles.previewContent}>
                      <span className={styles.previewName} dir="auto">
                        {productName(item.products)}
                      </span>
                      <span className={styles.previewPrice}>
                        {item.products ? formatPrice(item.products.price) : "—"}
                      </span>
                      {item.promotion && (
                        <span className={styles.previewPromo}>
                          {item.promotion.promotion_type === "percent"
                            ? `-${item.promotion.value}%`
                            : `-${formatPrice(item.promotion.value)}`}
                        </span>
                      )}
                      <div className={styles.previewBadges}>
                        {item.productBadges.map((pb) => {
                          const bt =
                            pb.promo_badge_types ||
                            getBadgeType(pb.badge_type_id);
                          return bt ? renderPreviewBadge(bt) : null;
                        })}
                      </div>
                    </div>
                  </div>
                )
              ),
            )}
            {sortedRailItems.length === 0 && (
              <div className={styles.previewEmpty}>
                {copy[locale].previewEmpty}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Badge Library Section */}
      <section className={styles.section} aria-labelledby="badges-heading">
        <div className={styles.sectionHeader}>
          <h2 id="badges-heading" className={styles.sectionTitle}>
            {copy[locale].badgeSectionTitle}
          </h2>
          <button
            type="button"
            className="mgmt-button mgmt-button--primary"
            onClick={() => {
              setEditingBadge(null);
              setBadgeForm({});
              setBadgeDialogOpen(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {copy[locale].addBadgeType}
          </button>
        </div>
        <p className={styles.sectionSubtitle}>
          {copy[locale].badgeSectionSubtitle}
        </p>

        <DataTable
          caption={copy[locale].badgeTableCaption}
          isEmpty={badgeTypes.length === 0}
          emptyState={
            <EmptyState
              icon={<Tag size={20} />}
              title={copy[locale].badgeEmptyTitle}
              description={copy[locale].badgeEmptyDescription}
              action={
                <button
                  type="button"
                  className="mgmt-button mgmt-button--primary"
                  onClick={() => {
                    setEditingBadge(null);
                    setBadgeForm({});
                    setBadgeDialogOpen(true);
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  {copy[locale].addBadgeType}
                </button>
              }
              compact
            />
          }
          minWidth="64rem"
          head={
            <tr>
              <th scope="col">{copy[locale].badgeColPreview}</th>
              <th scope="col">{copy[locale].badgeColLabelHe}</th>
              <th scope="col">{copy[locale].badgeColLabelEn}</th>
              <th scope="col">{copy[locale].badgeColShape}</th>
              <th scope="col">{copy[locale].badgeColTone}</th>
              <th scope="col">{copy[locale].badgeColIcon}</th>
              <th scope="col">{copy[locale].badgeColStatus}</th>
              <th scope="col">{copy[locale].badgeColAssigned}</th>
              <th scope="col">{copy[locale].badgeColActions}</th>
            </tr>
          }
        >
          {badgeTypes.map((badge) => {
            const assignedCount = railItems.reduce(
              (count, item) =>
                count +
                item.productBadges.filter((pb) => pb.badge_type_id === badge.id)
                  .length,
              0,
            );
            const canDelete = assignedCount === 0;
            return (
              <tr key={badge.id}>
                <td>{renderPreviewBadge(badge)}</td>
                <td dir="auto">{badge.label_he}</td>
                <td dir="ltr">{badge.label_en}</td>
                <td>
                  <StatusBadge
                    status={
                      badge.shape === "tag"
                        ? "active"
                        : badge.shape === "burst"
                          ? "pending"
                          : "info"
                    }
                    size="sm"
                  >
                    {badge.shape}
                  </StatusBadge>
                </td>
                <td>
                  <StatusBadge
                    status={
                      badge.tone === "sale"
                        ? "active"
                        : badge.tone === "best"
                          ? "pending"
                        : badge.tone === "hot"
                          ? "danger"
                          : badge.tone === "new"
                            ? "info"
                            : badge.tone === "limited"
                              ? "pending"
                              : "neutral"
                    }
                    size="sm"
                  >
                    {badge.tone}
                  </StatusBadge>
                </td>
                <td dir="ltr">{badge.icon_name || "—"}</td>
                <td>
                  <StatusBadge
                    status={badge.is_active ? "active" : "archived"}
                    size="sm"
                  >
                    {badge.is_active
                      ? copy[locale].statusActive
                      : copy[locale].statusInactive}
                  </StatusBadge>
                </td>
                <td>
                  <span className={styles.assignedCount}>
                    {assignedCount} {copy[locale].badgeAssignedCount}
                  </span>
                </td>
                <td>
                  <div className={styles.badgeActions}>
                    <button
                      type="button"
                      className="mgmt-button mgmt-button--secondary mgmt-button--sm"
                      onClick={() => {
                        setEditingBadge(badge);
                        setBadgeForm({
                          key: badge.key,
                          label_he: badge.label_he,
                          label_en: badge.label_en,
                          shape: badge.shape,
                          tone: badge.tone,
                          icon_name: badge.icon_name,
                          sort_order: badge.sort_order,
                          is_active: badge.is_active,
                        });
                        setBadgeDialogOpen(true);
                      }}
                    >
                      {copy[locale].edit}
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--danger mgmt-button--sm"
                        onClick={() => setPendingDeleteBadge(badge)}
                        aria-label={copy[locale].delete}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--secondary mgmt-button--sm"
                        disabled
                        title={copy[locale].badgeDeleteBlocked}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      <Dialog
        open={addProductDialogOpen}
        onClose={() => {
          setAddProductDialogOpen(false);
          setProductSearch("");
        }}
        title={copy[locale].addProduct}
        description={ui.searchHint}
        size="md"
        closeLabel={copy[locale].closeDialog}
      >
        <div className={styles.dialogStack}>
          <FormField label={ui.search}>
            {(control) => (
              <div className={styles.searchField}>
                <Search size={16} aria-hidden="true" />
                <input
                  {...control}
                  className={styles.fieldControl}
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  autoComplete="off"
                />
                {productSearchLoading ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-label={ui.saving}
                  />
                ) : null}
              </div>
            )}
          </FormField>
          {productSearch.trim().length >= 2 ? (
            <div className={styles.searchResults} role="list">
              {availableProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={styles.searchResult}
                  onClick={() => addProductToRail(product.id)}
                  role="listitem"
                >
                  <span>
                    <strong dir="auto">
                      {he ? product.name_he : product.name_en}
                    </strong>
                    <small dir="ltr">{product.slug}</small>
                  </span>
                  <span>{formatPrice(product.sale_price ?? product.price)}</span>
                  <Plus size={16} aria-hidden="true" />
                </button>
              ))}
              {!productSearchLoading && availableProducts.length === 0 ? (
                <p className={styles.emptySearch}>{ui.noResults}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={editRailItemDialogOpen}
        onClose={() => setEditRailItemDialogOpen(false)}
        title={ui.editRail}
        description={ui.railDescription}
        size="lg"
        closeLabel={copy[locale].closeDialog}
        footer={
          <div className="mgmt-dialog__actions">
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={() => setEditRailItemDialogOpen(false)}
              disabled={saving}
            >
              {ui.cancel}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--primary"
              onClick={() => void saveRailSettings()}
              disabled={saving}
            >
              {saving ? ui.saving : ui.save}
            </button>
          </div>
        }
      >
        {editingRailItem ? (
          <div className={styles.dialogStack}>
            <div className={styles.dialogProductHeader}>
              {editingRailItem.products?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editingRailItem.products.image_url}
                  alt=""
                  className={styles.dialogProductImage}
                />
              ) : null}
              <div>
                <strong dir="auto">
                  {productName(editingRailItem.products)}
                </strong>
                <span>{editingRailItem.products?.slug ?? "—"}</span>
              </div>
            </div>

            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={railForm.is_active}
                onChange={(event) =>
                  setRailForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              <span>{ui.active}</span>
            </label>

            <div className={styles.formGrid}>
              <FormField label={ui.start}>
                {(control) => (
                  <input
                    {...control}
                    type="datetime-local"
                    className={styles.fieldControl}
                    value={toLocalDateTime(railForm.scheduled_from)}
                    onChange={(event) =>
                      setRailForm((current) => ({
                        ...current,
                        scheduled_from: fromLocalDateTime(event.target.value),
                      }))
                    }
                  />
                )}
              </FormField>
              <FormField label={ui.end}>
                {(control) => (
                  <input
                    {...control}
                    type="datetime-local"
                    className={styles.fieldControl}
                    value={toLocalDateTime(railForm.scheduled_until)}
                    onChange={(event) =>
                      setRailForm((current) => ({
                        ...current,
                        scheduled_until: fromLocalDateTime(event.target.value),
                      }))
                    }
                  />
                )}
              </FormField>
            </div>

            <section className={styles.dialogSection}>
              <div className={styles.dialogSectionHeader}>
                <h3>{ui.badges}</h3>
                <select
                  className={styles.compactSelect}
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      void addBadgeToRailItem(
                        editingRailItem.product_id,
                        event.target.value,
                      );
                    }
                  }}
                  aria-label={copy[locale].addBadge}
                >
                  <option value="">{copy[locale].addBadge}</option>
                  {badgeTypes
                    .filter(
                      (badge) =>
                        badge.is_active &&
                        !editingRailItem.productBadges.some(
                          (assigned) => assigned.badge_type_id === badge.id,
                        ),
                    )
                    .map((badge) => (
                      <option key={badge.id} value={badge.id}>
                        {he ? badge.label_he : badge.label_en}
                      </option>
                    ))}
                </select>
              </div>
              <div className={styles.assignmentList}>
                {editingRailItem.productBadges.map((assigned) => {
                  const badge =
                    assigned.promo_badge_types ??
                    getBadgeType(assigned.badge_type_id);
                  return badge ? (
                    <div key={assigned.id} className={styles.assignmentRow}>
                      {renderPreviewBadge(badge)}
                      <label>
                        <span>{ui.priority}</span>
                        <input
                          type="number"
                          min={0}
                          max={999}
                          defaultValue={assigned.priority}
                          onBlur={(event) =>
                            void updateBadgePriority(
                              assigned.id,
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() =>
                          void removeBadgeFromRailItem(assigned.id)
                        }
                        aria-label={copy[locale].removeBadge}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            </section>

            <section className={styles.dialogSection}>
              <div className={styles.dialogSectionHeader}>
                <h3>{ui.promotion}</h3>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--secondary mgmt-button--sm"
                  onClick={() => {
                    setEditRailItemDialogOpen(false);
                    openPromotionEditor(editingRailItem);
                  }}
                >
                  {editingRailItem.promotion
                    ? ui.editPromotion
                    : ui.addPromotion}
                </button>
              </div>
              {editingRailItem.promotion ? (
                <span className={styles.promoBadge}>
                  {editingRailItem.promotion.promotion_type === "percent"
                    ? `-${editingRailItem.promotion.value}%`
                    : `-${formatPrice(editingRailItem.promotion.value)}`}
                </span>
              ) : (
                <span className={styles.noPromo}>
                  {copy[locale].noPromotion}
                </span>
              )}
            </section>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={badgeDialogOpen}
        onClose={() => setBadgeDialogOpen(false)}
        title={ui.badgeTitle}
        description={ui.badgeDescription}
        size="md"
        closeLabel={copy[locale].closeDialog}
        footer={
          <div className="mgmt-dialog__actions">
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={() => setBadgeDialogOpen(false)}
              disabled={saving}
            >
              {ui.cancel}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--primary"
              onClick={() => void saveBadgeType()}
              disabled={saving}
            >
              {saving ? ui.saving : ui.save}
            </button>
          </div>
        }
      >
        <div className={styles.dialogStack}>
          <div className={styles.badgePreviewStage}>
            {renderPreviewBadge({
              id: editingBadge?.id ?? "preview",
              key: badgeForm.key ?? "significant_sale",
              label_he: badgeForm.label_he || "מדבקה",
              label_en: badgeForm.label_en || "Badge",
              shape: badgeForm.shape ?? "tag",
              tone: badgeForm.tone ?? "sale",
              icon_name: badgeForm.icon_name ?? "percent",
              sort_order: badgeForm.sort_order ?? 0,
              is_active: badgeForm.is_active ?? true,
            })}
          </div>
          <div className={styles.formGrid}>
            <FormField
              label={ui.key}
              required
              error={badgeForm._errors?.key}
            >
              {(control) => (
                <input
                  {...control}
                  className={styles.fieldControl}
                  dir="ltr"
                  value={badgeForm.key ?? ""}
                  disabled={Boolean(editingBadge)}
                  onChange={(event) =>
                    handleBadgeFormChange(
                      "key",
                      event.target.value.toLowerCase().replace(/[^a-z_]/g, ""),
                    )
                  }
                />
              )}
            </FormField>
            <FormField
              label={ui.sortOrder}
              error={badgeForm._errors?.sort_order}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  className={styles.fieldControl}
                  value={badgeForm.sort_order ?? 0}
                  onChange={(event) =>
                    handleBadgeFormChange(
                      "sort_order",
                      Number(event.target.value),
                    )
                  }
                />
              )}
            </FormField>
            <FormField
              label={ui.labelHe}
              required
              error={badgeForm._errors?.label_he}
            >
              {(control) => (
                <input
                  {...control}
                  className={styles.fieldControl}
                  dir="rtl"
                  value={badgeForm.label_he ?? ""}
                  onChange={(event) =>
                    handleBadgeFormChange("label_he", event.target.value)
                  }
                />
              )}
            </FormField>
            <FormField
              label={ui.labelEn}
              required
              error={badgeForm._errors?.label_he}
            >
              {(control) => (
                <input
                  {...control}
                  className={styles.fieldControl}
                  dir="ltr"
                  value={badgeForm.label_en ?? ""}
                  onChange={(event) =>
                    handleBadgeFormChange("label_en", event.target.value)
                  }
                />
              )}
            </FormField>
            <FormField label={ui.shape}>
              {(control) => (
                <select
                  {...control}
                  className={styles.fieldControl}
                  value={badgeForm.shape ?? "tag"}
                  onChange={(event) =>
                    handleBadgeFormChange("shape", event.target.value)
                  }
                >
                  {(["tag", "burst", "ticket", "ribbon", "hex"] as const).map(
                    (shape) => (
                      <option key={shape} value={shape}>
                        {shape}
                      </option>
                    ),
                  )}
                </select>
              )}
            </FormField>
            <FormField label={ui.tone}>
              {(control) => (
                <select
                  {...control}
                  className={styles.fieldControl}
                  value={badgeForm.tone ?? "sale"}
                  onChange={(event) =>
                    handleBadgeFormChange("tone", event.target.value)
                  }
                >
                  {(["sale", "best", "new", "hot", "limited"] as const).map(
                    (tone) => (
                      <option key={tone} value={tone}>
                        {tone}
                      </option>
                    ),
                  )}
                </select>
              )}
            </FormField>
            <FormField label={ui.icon}>
              {(control) => (
                <input
                  {...control}
                  className={styles.fieldControl}
                  dir="ltr"
                  value={badgeForm.icon_name ?? ""}
                  onChange={(event) =>
                    handleBadgeFormChange("icon_name", event.target.value)
                  }
                />
              )}
            </FormField>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={badgeForm.is_active ?? true}
                onChange={(event) =>
                  handleBadgeFormChange("is_active", event.target.checked)
                }
              />
              <span>{ui.active}</span>
            </label>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={promotionDialogOpen}
        onClose={() => setPromotionDialogOpen(false)}
        title={editingPromotion ? ui.editPromotion : ui.addPromotion}
        description={ui.promoDescription}
        size="md"
        closeLabel={copy[locale].closeDialog}
        footer={
          <div className="mgmt-dialog__actions">
            {editingPromotion ? (
              <button
                type="button"
                className="mgmt-button mgmt-button--danger"
                onClick={() => void deletePromotion()}
                disabled={saving}
              >
                {ui.removePromotion}
              </button>
            ) : null}
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={() => setPromotionDialogOpen(false)}
              disabled={saving}
            >
              {ui.cancel}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--primary"
              onClick={() => void savePromotion()}
              disabled={saving}
            >
              {saving ? ui.saving : ui.save}
            </button>
          </div>
        }
      >
        <div className={styles.dialogStack}>
          <div className={styles.formGrid}>
            <FormField
              label={ui.promoType}
              required
              error={promotionForm._errors?.promotion_type}
            >
              {(control) => (
                <select
                  {...control}
                  className={styles.fieldControl}
                  value={promotionForm.promotion_type ?? "percent"}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      promotion_type: event.target.value as "percent" | "fixed",
                    }))
                  }
                >
                  <option value="percent">{ui.percent}</option>
                  <option value="fixed">{ui.fixed}</option>
                </select>
              )}
            </FormField>
            <FormField
              label={ui.value}
              required
              error={promotionForm._errors?.value}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  min="0.01"
                  max={
                    promotionForm.promotion_type === "percent" ? 95 : undefined
                  }
                  step="0.01"
                  className={styles.fieldControl}
                  value={promotionForm.value ?? ""}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      value: Number(event.target.value),
                    }))
                  }
                />
              )}
            </FormField>
            <FormField label={ui.compareAt}>
              {(control) => (
                <input
                  {...control}
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={styles.fieldControl}
                  value={promotionForm.compare_at_price ?? ""}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      compare_at_price: event.target.value
                        ? Number(event.target.value)
                        : null,
                    }))
                  }
                />
              )}
            </FormField>
            <FormField label={ui.start}>
              {(control) => (
                <input
                  {...control}
                  type="datetime-local"
                  className={styles.fieldControl}
                  value={toLocalDateTime(promotionForm.scheduled_from ?? null)}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      scheduled_from: fromLocalDateTime(event.target.value),
                    }))
                  }
                />
              )}
            </FormField>
            <FormField label={ui.end}>
              {(control) => (
                <input
                  {...control}
                  type="datetime-local"
                  className={styles.fieldControl}
                  value={toLocalDateTime(promotionForm.scheduled_until ?? null)}
                  onChange={(event) =>
                    setPromotionForm((current) => ({
                      ...current,
                      scheduled_until: fromLocalDateTime(event.target.value),
                    }))
                  }
                />
              )}
            </FormField>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={promotionForm.is_active ?? true}
                onChange={(event) =>
                  setPromotionForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              <span>{ui.active}</span>
            </label>
          </div>
        </div>
      </Dialog>

      <ConfirmationDialog
        open={pendingDeleteRailItem !== null}
        onCancel={() => setPendingDeleteRailItem(null)}
        onConfirm={() => {
          if (!pendingDeleteRailItem) return;
          setDeleting(true);
          void removeRailItem(pendingDeleteRailItem).finally(() => {
            setDeleting(false);
            setPendingDeleteRailItem(null);
          });
        }}
        title={ui.deleteProductTitle}
        description={ui.deleteProductDescription}
        confirmLabel={ui.confirmDelete}
        cancelLabel={ui.cancel}
        closeLabel={copy[locale].closeDialog}
        tone="danger"
        busy={deleting}
      />

      <ConfirmationDialog
        open={pendingDeleteBadge !== null}
        onCancel={() => setPendingDeleteBadge(null)}
        onConfirm={() => void deleteBadgeType()}
        title={ui.deleteBadgeTitle}
        description={ui.deleteBadgeDescription}
        confirmLabel={ui.confirmDelete}
        cancelLabel={ui.cancel}
        closeLabel={copy[locale].closeDialog}
        tone="danger"
        busy={deleting}
      />
    </div>
  );
}
