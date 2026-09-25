"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Plus,
  Edit,
  Trash2,
  ImageIcon,
  DollarSign,
  Save,
  X,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Package,
  Globe,
  Search,
  Tag,
  Archive,
  RotateCcw,
} from "lucide-react";
import { VariantsManager } from "./products/VariantsManager";
import { ImagesManager } from "./products/ImagesManager";
import { RolePricesManager } from "./products/RolePricesManager";
import { SpecificationsEditor } from "./products/SpecificationsEditor";
import { InventoryDisplay } from "./products/InventoryDisplay";

type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  color_he: string | null;
  color_en: string | null;
  color_hex: string | null;
  price_override: number | null;
  cost_override: number | null;
  supplier_id: string | null;
  supplier_sku: string | null;
  is_default: boolean;
  is_active: boolean;
  low_stock_threshold: number;
  reorder_point: number | null;
  reorder_qty: number | null;
  stock_qty: number;
  created_at: string;
  updated_at: string;
  suppliers?: { id: string; company_name: string } | null;
};

type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  alt_he: string | null;
  alt_en: string | null;
  sort_order: number;
};

type RolePrice = {
  product_id: string;
  role: string;
  price: number;
};

type Category = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
};

type Supplier = { id: string; company_name: string; is_active?: boolean };

type Product = {
  id: string;
  slug: string;
  category_id: string | null;
  name_he: string;
  name_en: string;
  short_description_he: string | null;
  short_description_en: string | null;
  description_he: string | null;
  description_en: string | null;
  price: number | null;
  compare_at_price: number | null;
  sale_price: number | null;
  inventory_count: number;
  is_active: boolean;
  is_featured: boolean;
  image_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  brand: string | null;
  model_number: string | null;
  tags: string[];
  specifications: Record<string, unknown>;
  warranty_he: string | null;
  warranty_en: string | null;
  seo_title_he: string | null;
  seo_title_en: string | null;
  seo_description_he: string | null;
  seo_description_en: string | null;
  sort_order: number;
  currency: string;
  purchase_cost: number | null;
  recommended_price: number | null;
  out_of_stock_policy:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public";
  expected_restock_date: string | null;
  tracking_mode: "none" | "serial" | "lot";
  supplier_id: string | null;
  status: "draft" | "active" | "hidden" | "archived";
  categories: Category | null;
  product_prices: RolePrice[];
  product_variants: ProductVariant[];
  product_images: ProductImage[];
  suppliers: Supplier | null;
};

const statusOptions = ["draft", "active", "hidden", "archived"] as const;
const outOfStockPolicies = [
  "inherit",
  "keep_visible_contact",
  "keep_visible_restock",
  "hide_from_public",
] as const;
const trackingModes = ["none", "serial", "lot"] as const;

function statusLabel(status: string, he: boolean) {
  const labels: Record<string, { he: string; en: string }> = {
    draft: { he: "טיוטה", en: "Draft" },
    active: { he: "פעיל", en: "Active" },
    hidden: { he: "מוסתר", en: "Hidden" },
    archived: { he: "מאורכב", en: "Archived" },
  };
  const l = labels[status] ?? { he: status, en: status };
  return he ? l.he : l.en;
}

function statusBadgeClass(status: string) {
  const variants: Record<string, string> = {
    draft: "status-badge--suspended",
    active: "status-badge--active",
    hidden: "status-badge--suspended",
    archived: "status-badge--blocked",
  };
  return `status-badge ${variants[status] ?? "status-badge--suspended"}`;
}

function outOfStockLabel(policy: string, he: boolean) {
  const labels: Record<string, { he: string; en: string }> = {
    inherit: { he: "ברירת מחדל", en: "Inherit" },
    keep_visible_contact: { he: "הצג + צור קשר", en: "Show + Contact" },
    keep_visible_restock: {
      he: "הצג + תאריך חידוש",
      en: "Show + Restock Date",
    },
    hide_from_public: { he: "הסתר מהציבור", en: "Hide from Public" },
  };
  const l = labels[policy] ?? { he: policy, en: policy };
  return he ? l.he : l.en;
}

function trackingLabel(mode: string, he: boolean) {
  const labels: Record<string, { he: string; en: string }> = {
    none: { he: "ללא מעקב", en: "No Tracking" },
    serial: { he: "מספר סידורי", en: "Serial" },
    lot: { he: "אצווה", en: "Lot" },
  };
  const l = labels[mode] ?? { he: mode, en: mode };
  return he ? l.he : l.en;
}

type FormData = {
  category_id: string;
  slug: string;
  name_he: string;
  name_en: string;
  short_description_he: string;
  short_description_en: string;
  description_he: string;
  description_en: string;
  price: number | null;
  compare_at_price: number | null;
  sale_price: number | null;
  purchase_cost: number | null;
  recommended_price: number | null;
  brand: string;
  model_number: string;
  tags: string[];
  specifications: Record<string, unknown>;
  warranty_he: string;
  warranty_en: string;
  seo_title_he: string;
  seo_title_en: string;
  seo_description_he: string;
  seo_description_en: string;
  sort_order: number;
  currency: string;
  out_of_stock_policy:
    | "inherit"
    | "keep_visible_contact"
    | "keep_visible_restock"
    | "hide_from_public";
  expected_restock_date: string;
  tracking_mode: "none" | "serial" | "lot";
  supplier_id: string;
  status: "draft" | "active" | "hidden" | "archived";
  is_featured: boolean;
  image_url: string;
};

const emptyFormData: FormData = {
  category_id: "",
  slug: "",
  name_he: "",
  name_en: "",
  short_description_he: "",
  short_description_en: "",
  description_he: "",
  description_en: "",
  price: null,
  compare_at_price: null,
  sale_price: null,
  purchase_cost: null,
  recommended_price: null,
  brand: "",
  model_number: "",
  tags: [],
  specifications: {},
  warranty_he: "",
  warranty_en: "",
  seo_title_he: "",
  seo_title_en: "",
  seo_description_he: "",
  seo_description_en: "",
  sort_order: 0,
  currency: "ILS",
  out_of_stock_policy: "inherit",
  expected_restock_date: "",
  tracking_mode: "none",
  supplier_id: "",
  status: "draft",
  is_featured: false,
  image_url: "",
};

export function ProductManagement({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<
    "basic" | "content" | "media" | "variants" | "pricing" | "publishing"
  >("basic");
  const [formData, setFormData] = useState(emptyFormData);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [rolePrices, setRolePrices] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productsRes, categoriesRes, suppliersRes] = await Promise.all([
        fetch("/api/management/products", { cache: "no-store" }),
        fetch("/api/management/categories", { cache: "no-store" }),
        fetch("/api/management/suppliers?activeOnly=true", {
          cache: "no-store",
        }),
      ]);

      if (!productsRes.ok || !categoriesRes.ok || !suppliersRes.ok)
        throw new Error("Failed to load data");

      const { products: productsData } = await productsRes.json();
      const { categories: categoriesData } = await categoriesRes.json();
      const { suppliers: suppliersData } = await suppliersRes.json();

      setProducts(productsData);
      setCategories(categoriesData);
      setSuppliers(suppliersData);
    } catch {
      setError(he ? "לא ניתן לטעון נתונים" : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [he]);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [productsRes, categoriesRes, suppliersRes] = await Promise.all([
          fetch("/api/management/products", { cache: "no-store" }),
          fetch("/api/management/categories", { cache: "no-store" }),
          fetch("/api/management/suppliers?activeOnly=true", {
            cache: "no-store",
          }),
        ]);
        if (!ignore && productsRes.ok && categoriesRes.ok && suppliersRes.ok) {
          const { products: productsData } = await productsRes.json();
          const { categories: categoriesData } = await categoriesRes.json();
          const { suppliers: suppliersData } = await suppliersRes.json();
          setProducts(productsData);
          setCategories(categoriesData);
          setSuppliers(suppliersData);
        }
      } catch {
        if (!ignore) {
          setError(he ? "לא ניתן לטעון נתונים" : "Failed to load data");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, [he]);

  function handleFormChange(
    field: string,
    value:
      string | number | boolean | null | string[] | Record<string, unknown>,
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setFormData(emptyFormData);
    setEditingProduct(null);
    setVariants([]);
    setImages([]);
    setRolePrices({});
    setActiveTab("basic");
    setPublishError("");
  }

  function openCreateForm() {
    resetForm();
    setShowEditor(true);
  }

  function openEditForm(product: Product) {
    const priceMap: Record<string, number> = {};
    product.product_prices.forEach((p) => {
      priceMap[p.role] = p.price;
    });

    setFormData({
      category_id: product.category_id ?? "",
      slug: product.slug,
      name_he: product.name_he,
      name_en: product.name_en,
      short_description_he: product.short_description_he ?? "",
      short_description_en: product.short_description_en ?? "",
      description_he: product.description_he ?? "",
      description_en: product.description_en ?? "",
      price: product.price,
      compare_at_price: product.compare_at_price,
      sale_price: product.sale_price,
      purchase_cost: product.purchase_cost,
      recommended_price: product.recommended_price,
      brand: product.brand ?? "",
      model_number: product.model_number ?? "",
      tags: product.tags ?? [],
      specifications: product.specifications ?? {},
      warranty_he: product.warranty_he ?? "",
      warranty_en: product.warranty_en ?? "",
      seo_title_he: product.seo_title_he ?? "",
      seo_title_en: product.seo_title_en ?? "",
      seo_description_he: product.seo_description_he ?? "",
      seo_description_en: product.seo_description_en ?? "",
      sort_order: product.sort_order,
      currency: product.currency,
      out_of_stock_policy: product.out_of_stock_policy,
      expected_restock_date: product.expected_restock_date ?? "",
      tracking_mode: product.tracking_mode,
      supplier_id: product.supplier_id ?? "",
      status: product.status,
      is_featured: product.is_featured,
      image_url: product.image_url ?? "",
    });
    setEditingProduct(product);
    setVariants(product.product_variants);
    setImages(product.product_images);
    setRolePrices(priceMap);
    setActiveTab("basic");
    setPublishError("");
    setShowEditor(true);
  }

  async function submitForm() {
    setSaving(true);
    setError("");
    setPublishError("");
    try {
      const method = editingProduct ? "PATCH" : "POST";
      const url = "/api/management/products";

      const body = {
        ...(editingProduct ? { id: editingProduct.id } : {}),
        ...formData,
        expected_restock_date: formData.expected_restock_date || null,
        tags: formData.tags,
        specifications: formData.specifications,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        if (err.code === "publish_incomplete") {
          setPublishError(
            he
              ? `לא ניתן לפרסם: ${err.details}. אנא השלם את השדות החסרים.`
              : `Cannot publish: ${err.details}. Please complete the missing fields.`,
          );
          setActiveTab("publishing");
          return;
        }
        throw new Error(err.error || "Failed to save product");
      }

      setShowEditor(false);
      resetForm();
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה בשמירה"
            : "Save failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(
    newStatus: "draft" | "active" | "hidden" | "archived",
  ) {
    if (!editingProduct) return;
    setSaving(true);
    setPublishError("");
    try {
      const response = await fetch("/api/management/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingProduct.id, status: newStatus }),
      });

      if (!response.ok) {
        const err = await response.json();
        if (err.code === "publish_incomplete") {
          setPublishError(
            he
              ? `לא ניתן לפרסם: ${err.details}. אנא השלם את השדות החסרים.`
              : `Cannot publish: ${err.details}. Please complete the missing fields.`,
          );
          return;
        }
        throw new Error(err.error || "Failed to update status");
      }

      setFormData((prev) => ({ ...prev, status: newStatus }));
      setEditingProduct((p) => (p ? { ...p, status: newStatus } : null));
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה בעדכון סטטוס"
            : "Status update failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    if (
      !confirm(
        he
          ? "האם אתה בטוח שברצונך למחוק מוצר זה?"
          : "Are you sure you want to delete this product?",
      )
    )
      return;

    setError("");
    try {
      const response = await fetch(`/api/management/products?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : he
            ? "שגיאה במחיקה"
            : "Delete failed",
      );
    }
  }

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return he ? "ללא קטגוריה" : "No category";
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? (he ? cat.name_he : cat.name_en) : categoryId;
  };

  const getDefaultVariant = (product: Product) => {
    return (
      product.product_variants.find((v) => v.is_default) ??
      product.product_variants[0]
    );
  };

  const getEffectivePrice = (product: Product) => {
    const defaultVariant = getDefaultVariant(product);
    if (
      defaultVariant?.price_override !== null &&
      defaultVariant?.price_override !== undefined
    ) {
      return defaultVariant.price_override;
    }
    return product.price;
  };

  const getTotalStock = (product: Product) => {
    return product.product_variants
      .filter((v) => v.is_active)
      .reduce((sum, v) => sum + v.stock_qty, 0);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined)
      return he ? "לא פורסם" : "Unpublished";
    return new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const tabs = [
    { id: "basic", label: he ? "בסיסי" : "Basic", icon: Tag },
    { id: "content", label: he ? "תוכן" : "Content", icon: Search },
    { id: "media", label: he ? "מדיה" : "Media", icon: ImageIcon },
    { id: "variants", label: he ? "וריאנטים" : "Variants", icon: Package },
    { id: "pricing", label: he ? "תמחור" : "Pricing", icon: DollarSign },
    { id: "publishing", label: he ? "פרסום" : "Publishing", icon: Globe },
  ] as const;

  if (loading) {
    return (
      <div className="miro-card p-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">
          {he ? "טוען מוצרים..." : "Loading products..."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">
            {he ? "ניהול מוצרים" : "Product Management"}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {he
              ? "הוסף, ערוך ומחק מוצרים, נהל וריאנטים, תמונות, מחירים ופרסום"
              : "Add, edit, delete products and manage variants, images, prices and publishing"}
          </p>
        </div>
        <button
          className="miro-button miro-button-primary"
          onClick={openCreateForm}
        >
          <Plus className="mr-2 h-4 w-4" />
          {he ? "הוסף מוצר" : "Add Product"}
        </button>
      </div>

      {(error || publishError) && (
        <div className="miro-card border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-destructive">{error || publishError}</span>
          </div>
        </div>
      )}

      <div className="miro-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <caption className="sr-only">
              {he ? "טבלת ניהול מוצרים" : "Product management table"}
            </caption>
            <thead>
              <tr className="border-b border-border-subtle bg-surface-muted text-left">
                <th className="p-4">{he ? "תמונה" : "Image"}</th>
                <th className="p-4">{he ? "שמות" : "Names"}</th>
                <th className="p-4">{he ? "קטגוריה" : "Category"}</th>
                <th className="p-4">{he ? "SKU ברירת מחדל" : "Default SKU"}</th>
                <th className="p-4">
                  {he ? "מחיר אפקטיבי" : "Effective Price"}
                </th>
                <th className="p-4">{he ? "סטטוס" : "Status"}</th>
                <th className="p-4">{he ? "מומלץ" : "Featured"}</th>
                <th className="p-4">{he ? "סה״כ מלאי" : "Total Stock"}</th>
                <th className="p-4">{he ? "פעולות" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const defaultVariant = getDefaultVariant(product);
                const effectivePrice = getEffectivePrice(product);
                const totalStock = getTotalStock(product);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border-subtle hover:bg-surface-muted/50"
                  >
                    <td className="p-4">
                      {product.image_url && (
                        <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-surface-muted">
                          <Image
                            src={product.image_url}
                            alt={product.name_en || product.name_he}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div>
                        <p className="font-medium">
                          {he ? product.name_he : product.name_en}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {he ? product.name_en : product.name_he}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {product.slug}
                        </p>
                      </div>
                    </td>
                    <td className="p-4">
                      {getCategoryName(product.category_id)}
                    </td>
                    <td className="p-4 font-mono text-sm">
                      {defaultVariant?.sku ?? (he ? "—" : "—")}
                    </td>
                    <td className="p-4">
                      {product.price === null ? (
                        <span className="status-badge status-badge--suspended">
                          {he ? "לא פורסם" : "Unpublished"}
                        </span>
                      ) : (
                        <span className="font-medium">
                          {formatPrice(effectivePrice)}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={statusBadgeClass(product.status)}>
                        {statusLabel(product.status, he)}
                      </span>
                    </td>
                    <td className="p-4">
                      {product.is_featured && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {he ? "מומלץ" : "Featured"}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="font-mono font-medium">
                        {totalStock}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="miro-button miro-button-secondary text-xs"
                          onClick={() => openEditForm(product)}
                        >
                          <Edit className="mr-1 h-3 w-3" />
                          {he ? "עריכה" : "Edit"}
                        </button>
                        {product.status === "active" ? (
                          <>
                            <button
                              className="miro-button miro-button-secondary text-xs text-amber-600 hover:bg-amber-50"
                              onClick={() => handleStatusChange("hidden")}
                            >
                              <EyeOff className="mr-1 h-3 w-3" />
                              {he ? "הסתר" : "Hide"}
                            </button>
                            <button
                              className="miro-button miro-button-secondary text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => handleStatusChange("archived")}
                            >
                              <Archive className="mr-1 h-3 w-3" />
                              {he ? "ארכב" : "Archive"}
                            </button>
                          </>
                        ) : product.status === "hidden" ? (
                          <>
                            <button
                              className="miro-button miro-button-secondary text-xs"
                              onClick={() => handleStatusChange("active")}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              {he ? "פרסם" : "Publish"}
                            </button>
                            <button
                              className="miro-button miro-button-secondary text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => handleStatusChange("archived")}
                            >
                              <Archive className="mr-1 h-3 w-3" />
                              {he ? "ארכב" : "Archive"}
                            </button>
                          </>
                        ) : product.status === "draft" ? (
                          <button
                            className="miro-button miro-button-primary text-xs"
                            onClick={() => handleStatusChange("active")}
                          >
                            <Globe className="mr-1 h-3 w-3" />
                            {he ? "פרסם" : "Publish"}
                          </button>
                        ) : (
                          <button
                            className="miro-button miro-button-secondary text-xs"
                            onClick={() => handleStatusChange("draft")}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            {he ? "שחזר לטיוטה" : "Restore to Draft"}
                          </button>
                        )}
                        <button
                          className="miro-button miro-button-secondary text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => deleteProduct(product.id)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          {he ? "מחיקה" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {products.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            {he
              ? "אין מוצרים עדיין. לחץ על 'הוסף מוצר' כדי להתחיל."
              : "No products yet. Click 'Add Product' to get started."}
          </div>
        )}
      </div>

      {/* Product Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="border-b border-border-subtle p-4 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-black">
                {editingProduct
                  ? he
                    ? "ערוך מוצר"
                    : "Edit Product"
                  : he
                    ? "הוסף מוצר"
                    : "Add Product"}
              </h3>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowEditor(false)}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-border-subtle flex-shrink-0 overflow-x-auto">
              <nav
                className="flex gap-1 p-2"
                role="tablist"
                aria-label={he ? "לשוניות עריכת מוצר" : "Product editor tabs"}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    id={`tab-${tab.id}`}
                    className={`miro-button text-sm flex items-center gap-1.5 whitespace-nowrap ${
                      activeTab === tab.id
                        ? "miro-button-primary"
                        : "miro-button-secondary"
                    } ${tab.id === "variants" && !editingProduct ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => {
                      if (tab.id !== "variants" || editingProduct) {
                        setActiveTab(tab.id);
                        setPublishError("");
                      }
                    }}
                    disabled={tab.id === "variants" && !editingProduct}
                  >
                    <tab.icon className="h-4 w-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Panels */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitForm();
              }}
              className="flex-1 overflow-y-auto p-6 space-y-6"
            >
              <input type="hidden" name="id" value={editingProduct?.id ?? ""} />

              {/* Basic Tab */}
              <div
                role="tabpanel"
                id="panel-basic"
                aria-labelledby="tab-basic"
                hidden={activeTab !== "basic"}
              >
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "קטגוריה" : "Category"}
                      </label>
                      <select
                        name="category_id"
                        value={formData.category_id}
                        onChange={(e) =>
                          handleFormChange("category_id", e.target.value)
                        }
                        className="miro-input"
                        required
                      >
                        <option value="">
                          {he ? "בחר קטגוריה" : "Select category"}
                        </option>
                        {categories
                          .filter((c) => c.is_active)
                          .map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {he ? cat.name_he : cat.name_en}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מזהה (Slug)" : "Slug"}
                      </label>
                      <input
                        type="text"
                        name="slug"
                        value={formData.slug}
                        onChange={(e) =>
                          handleFormChange("slug", e.target.value)
                        }
                        className="miro-input"
                        required
                        placeholder="product-slug"
                        disabled={!!editingProduct}
                      />
                      {editingProduct && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {he
                            ? "לא ניתן לשנות את ה-Slug לאחר יצירה"
                            : "Slug cannot be changed after creation"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "שם בעברית *" : "Name (Hebrew) *"}
                      </label>
                      <input
                        type="text"
                        name="name_he"
                        value={formData.name_he}
                        onChange={(e) =>
                          handleFormChange("name_he", e.target.value)
                        }
                        className="miro-input"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "שם באנגלית *" : "Name (English) *"}
                      </label>
                      <input
                        type="text"
                        name="name_en"
                        value={formData.name_en}
                        onChange={(e) =>
                          handleFormChange("name_en", e.target.value)
                        }
                        className="miro-input"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מותג" : "Brand"}
                      </label>
                      <input
                        type="text"
                        name="brand"
                        value={formData.brand}
                        onChange={(e) =>
                          handleFormChange("brand", e.target.value)
                        }
                        className="miro-input"
                        placeholder={he ? "למשל: Hikvision" : "e.g., Hikvision"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מספר דגם" : "Model Number"}
                      </label>
                      <input
                        type="text"
                        name="model_number"
                        value={formData.model_number}
                        onChange={(e) =>
                          handleFormChange("model_number", e.target.value)
                        }
                        className="miro-input"
                        placeholder={
                          he ? "למשל: DS-2CD2085G1" : "e.g., DS-2CD2085G1"
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he
                          ? "תגיות (מופרדות בפסיק)"
                          : "Tags (comma separated)"}
                      </label>
                      <input
                        type="text"
                        value={formData.tags.join(", ")}
                        onChange={(e) =>
                          handleFormChange(
                            "tags",
                            e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          )
                        }
                        className="miro-input"
                        placeholder={
                          he ? "אבטחה, מצלמה, IP" : "security, camera, ip"
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "ספק ברירת מחדל" : "Default Supplier"}
                      </label>
                      <select
                        name="supplier_id"
                        value={formData.supplier_id}
                        onChange={(e) =>
                          handleFormChange("supplier_id", e.target.value)
                        }
                        className="miro-input"
                      >
                        <option value="">
                          {he ? "ללא ספק" : "No supplier"}
                        </option>
                        {suppliers
                          .filter((s) => s.is_active !== false)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.company_name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Tab */}
              <div
                role="tabpanel"
                id="panel-content"
                aria-labelledby="tab-content"
                hidden={activeTab !== "content"}
              >
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "תיאור קצר עברית" : "Short Description (Hebrew)"}
                      </label>
                      <textarea
                        name="short_description_he"
                        value={formData.short_description_he}
                        onChange={(e) =>
                          handleFormChange(
                            "short_description_he",
                            e.target.value,
                          )
                        }
                        className="miro-input"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he
                          ? "תיאור קצר אנגלית"
                          : "Short Description (English)"}
                      </label>
                      <textarea
                        name="short_description_en"
                        value={formData.short_description_en}
                        onChange={(e) =>
                          handleFormChange(
                            "short_description_en",
                            e.target.value,
                          )
                        }
                        className="miro-input"
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        {he ? "תיאור מלא עברית" : "Full Description (Hebrew)"}
                      </label>
                      <textarea
                        name="description_he"
                        value={formData.description_he}
                        onChange={(e) =>
                          handleFormChange("description_he", e.target.value)
                        }
                        className="miro-input"
                        rows={4}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        {he ? "תיאור מלא אנגלית" : "Full Description (English)"}
                      </label>
                      <textarea
                        name="description_en"
                        value={formData.description_en}
                        onChange={(e) =>
                          handleFormChange("description_en", e.target.value)
                        }
                        className="miro-input"
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "אחריות עברית" : "Warranty (Hebrew)"}
                      </label>
                      <textarea
                        name="warranty_he"
                        value={formData.warranty_he}
                        onChange={(e) =>
                          handleFormChange("warranty_he", e.target.value)
                        }
                        className="miro-input"
                        rows={2}
                        placeholder={
                          he
                            ? "למשל: שנתיים אחריות יבואן רשמי"
                            : "e.g., 2 years official importer warranty"
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "אחריות אנגלית" : "Warranty (English)"}
                      </label>
                      <textarea
                        name="warranty_en"
                        value={formData.warranty_en}
                        onChange={(e) =>
                          handleFormChange("warranty_en", e.target.value)
                        }
                        className="miro-input"
                        rows={2}
                        placeholder="e.g., 2 years official warranty"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border-subtle pt-6">
                    <SpecificationsEditor
                      locale={locale}
                      initialSpecs={formData.specifications}
                      onChange={(specs) =>
                        handleFormChange("specifications", specs)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Media Tab */}
              <div
                role="tabpanel"
                id="panel-media"
                aria-labelledby="tab-media"
                hidden={activeTab !== "media"}
              >
                <ImagesManager
                  locale={locale}
                  productId={editingProduct?.id ?? "new"}
                  initialImages={images}
                  onImagesChange={setImages}
                  disabled={!editingProduct}
                />
              </div>

              {/* Variants Tab */}
              <div
                role="tabpanel"
                id="panel-variants"
                aria-labelledby="tab-variants"
                hidden={activeTab !== "variants"}
              >
                {editingProduct ? (
                  <VariantsManager
                    locale={locale}
                    productId={editingProduct.id}
                    initialVariants={variants}
                    suppliers={suppliers}
                    onVariantsChange={setVariants}
                  />
                ) : (
                  <div className="miro-card p-8 text-center border-dashed border-border-subtle">
                    <Package
                      className="mx-auto h-12 w-12 text-muted-foreground mb-4"
                      aria-hidden="true"
                    />
                    <p className="text-muted-foreground mb-4">
                      {he
                        ? "שמור את המוצר תחילה כדי להוסיף וריאנטים. וריאנטים דורשים מזהה מוצר קיים."
                        : "Save the product first to add variants. Variants require an existing product ID."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {he
                        ? "לחץ על 'שמור' ולאחר מכן עבור ללשונית וריאנטים"
                        : "Click 'Save' then switch to the Variants tab"}
                    </p>
                  </div>
                )}
              </div>

              {/* Pricing Tab */}
              <div
                role="tabpanel"
                id="panel-pricing"
                aria-labelledby="tab-pricing"
                hidden={activeTab !== "pricing"}
              >
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מחיר בסיס (₪)" : "Base Price (₪)"}
                      </label>
                      <input
                        type="number"
                        name="price"
                        value={formData.price ?? ""}
                        onChange={(e) =>
                          handleFormChange(
                            "price",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="miro-input"
                        min="0"
                        step="0.01"
                        placeholder={
                          he
                            ? "השאר ריק = לא פורסם"
                            : "Leave empty = unpublished"
                        }
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {he
                          ? "ריק = המוצר לא יפורסם בחנות"
                          : "Empty = product won't be published in store"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מחיר השוואה (₪)" : "Compare At Price (₪)"}
                      </label>
                      <input
                        type="number"
                        name="compare_at_price"
                        value={formData.compare_at_price ?? ""}
                        onChange={(e) =>
                          handleFormChange(
                            "compare_at_price",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="miro-input"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מחיר מבצע (₪)" : "Sale Price (₪)"}
                      </label>
                      <input
                        type="number"
                        name="sale_price"
                        value={formData.sale_price ?? ""}
                        onChange={(e) =>
                          handleFormChange(
                            "sale_price",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="miro-input"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מחיר מומלץ (₪)" : "Recommended Price (₪)"}
                      </label>
                      <input
                        type="number"
                        name="recommended_price"
                        value={formData.recommended_price ?? ""}
                        onChange={(e) =>
                          handleFormChange(
                            "recommended_price",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="miro-input"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "עלות רכישה (₪)" : "Purchase Cost (₪)"}
                      </label>
                      <input
                        type="number"
                        name="purchase_cost"
                        value={formData.purchase_cost ?? ""}
                        onChange={(e) =>
                          handleFormChange(
                            "purchase_cost",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="miro-input"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "מטבע" : "Currency"}
                      </label>
                      <select
                        name="currency"
                        value={formData.currency}
                        onChange={(e) =>
                          handleFormChange("currency", e.target.value)
                        }
                        className="miro-input"
                      >
                        <option value="ILS">ILS</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "סדר מיון" : "Sort Order"}
                      </label>
                      <input
                        type="number"
                        name="sort_order"
                        value={formData.sort_order}
                        onChange={(e) =>
                          handleFormChange("sort_order", Number(e.target.value))
                        }
                        className="miro-input"
                        min="0"
                      />
                    </div>
                    <div></div>
                  </div>

                  <div className="border-t border-border-subtle pt-6">
                    <RolePricesManager
                      locale={locale}
                      productId={editingProduct?.id ?? "new"}
                      basePrice={formData.price}
                      initialPrices={Object.entries(rolePrices).map(
                        ([role, price]) => ({
                          product_id: editingProduct?.id ?? "new",
                          role,
                          price,
                        }),
                      )}
                      onPricesChange={(prices) => {
                        const newMap: Record<string, number> = {};
                        prices.forEach((p) => {
                          newMap[p.role] = p.price;
                        });
                        setRolePrices(newMap);
                      }}
                      disabled={!editingProduct}
                    />
                  </div>
                </div>
              </div>

              {/* Publishing Tab */}
              <div
                role="tabpanel"
                id="panel-publishing"
                aria-labelledby="tab-publishing"
                hidden={activeTab !== "publishing"}
              >
                <div className="space-y-6">
                  {/* Status */}
                  <div className="space-y-4">
                    <label className="block text-sm font-medium">
                      {he ? "סטטוס פרסום" : "Publishing Status"}
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {statusOptions.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`miro-button px-4 py-2 ${
                            formData.status === status
                              ? "miro-button-primary"
                              : "miro-button-secondary"
                          } ${status === "active" && formData.price === null ? "opacity-50 cursor-not-allowed" : ""}`}
                          onClick={() => {
                            if (
                              status !== "active" ||
                              formData.price !== null
                            ) {
                              handleFormChange("status", status);
                              setPublishError("");
                            }
                          }}
                          disabled={
                            status === "active" && formData.price === null
                          }
                        >
                          {statusLabel(status, he)}
                        </button>
                      ))}
                    </div>
                    {formData.price === null && (
                      <p className="text-xs text-amber-600">
                        {he
                          ? "יש להגדיר מחיר בסיס כדי לפרסם (סטטוס 'פעיל')"
                          : "Base price must be set to publish (Active status)"}
                      </p>
                    )}
                  </div>

                  {publishError && (
                    <div className="miro-card border-destructive/50 bg-destructive/5 p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        <span className="text-destructive text-sm">
                          {publishError}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Featured & Sort Order */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="is_featured"
                        checked={formData.is_featured}
                        onChange={(e) =>
                          handleFormChange("is_featured", e.target.checked)
                        }
                        className="rounded border-border-subtle"
                      />
                      <label className="text-sm font-medium cursor-pointer">
                        {he ? "מוצר מומלץ" : "Featured Product"}
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {he ? "סדר מיון" : "Sort Order"}
                      </label>
                      <input
                        type="number"
                        name="sort_order"
                        value={formData.sort_order}
                        onChange={(e) =>
                          handleFormChange("sort_order", Number(e.target.value))
                        }
                        className="miro-input"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* Out of Stock Policy */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">
                      {he ? "מדיניות חוסר מלאי" : "Out of Stock Policy"}
                    </label>
                    <select
                      name="out_of_stock_policy"
                      value={formData.out_of_stock_policy}
                      onChange={(e) =>
                        handleFormChange(
                          "out_of_stock_policy",
                          e.target.value as typeof formData.out_of_stock_policy,
                        )
                      }
                      className="miro-input"
                    >
                      {outOfStockPolicies.map((policy) => (
                        <option key={policy} value={policy}>
                          {outOfStockLabel(policy, he)}
                        </option>
                      ))}
                    </select>
                    {formData.out_of_stock_policy ===
                      "keep_visible_restock" && (
                      <div className="mt-2">
                        <label className="block text-sm font-medium mb-1">
                          {he
                            ? "תאריך חידוש מלאי צפוי"
                            : "Expected Restock Date"}
                        </label>
                        <input
                          type="date"
                          name="expected_restock_date"
                          value={formData.expected_restock_date}
                          onChange={(e) =>
                            handleFormChange(
                              "expected_restock_date",
                              e.target.value,
                            )
                          }
                          className="miro-input"
                        />
                      </div>
                    )}
                  </div>

                  {/* Tracking Mode */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">
                      {he ? "מצב מעקב מלאי" : "Inventory Tracking Mode"}
                    </label>
                    <select
                      name="tracking_mode"
                      value={formData.tracking_mode}
                      onChange={(e) =>
                        handleFormChange(
                          "tracking_mode",
                          e.target.value as typeof formData.tracking_mode,
                        )
                      }
                      className="miro-input"
                    >
                      {trackingModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {trackingLabel(mode, he)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* SEO Fields */}
                  <div className="border-t border-border-subtle pt-6 space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Globe className="h-5 w-5" aria-hidden="true" />
                      {he ? "הגדרות SEO" : "SEO Settings"}
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {he ? "כותרת SEO עברית" : "SEO Title (Hebrew)"}
                        </label>
                        <input
                          type="text"
                          name="seo_title_he"
                          value={formData.seo_title_he}
                          onChange={(e) =>
                            handleFormChange("seo_title_he", e.target.value)
                          }
                          className="miro-input"
                          maxLength={60}
                          placeholder={he ? "עד 60 תווים" : "Up to 60 chars"}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {he ? "כותרת SEO אנגלית" : "SEO Title (English)"}
                        </label>
                        <input
                          type="text"
                          name="seo_title_en"
                          value={formData.seo_title_en}
                          onChange={(e) =>
                            handleFormChange("seo_title_en", e.target.value)
                          }
                          className="miro-input"
                          maxLength={60}
                          placeholder="Up to 60 chars"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1">
                          {he ? "תיאור SEO עברית" : "SEO Description (Hebrew)"}
                        </label>
                        <textarea
                          name="seo_description_he"
                          value={formData.seo_description_he}
                          onChange={(e) =>
                            handleFormChange(
                              "seo_description_he",
                              e.target.value,
                            )
                          }
                          className="miro-input"
                          rows={2}
                          maxLength={160}
                          placeholder={he ? "עד 160 תווים" : "Up to 160 chars"}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-1">
                          {he
                            ? "תיאור SEO אנגלית"
                            : "SEO Description (English)"}
                        </label>
                        <textarea
                          name="seo_description_en"
                          value={formData.seo_description_en}
                          onChange={(e) =>
                            handleFormChange(
                              "seo_description_en",
                              e.target.value,
                            )
                          }
                          className="miro-input"
                          rows={2}
                          maxLength={160}
                          placeholder="Up to 160 chars"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inventory Display */}
                  {editingProduct && variants.length > 0 && (
                    <div className="border-t border-border-subtle pt-6">
                      <InventoryDisplay locale={locale} variants={variants} />
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 border-t border-border-subtle pt-6 flex-shrink-0">
                <button
                  type="button"
                  className="miro-button miro-button-secondary"
                  onClick={() => setShowEditor(false)}
                >
                  {he ? "ביטול" : "Cancel"}
                </button>
                <button
                  type="button"
                  className="miro-button miro-button-secondary"
                  onClick={() => {
                    const currentIndex = tabs.findIndex(
                      (t) => t.id === activeTab,
                    );
                    if (currentIndex > 0)
                      setActiveTab(tabs[currentIndex - 1].id);
                  }}
                  disabled={activeTab === "basic"}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {he ? "הקודם" : "Previous"}
                </button>
                <button
                  type="button"
                  className="miro-button miro-button-secondary"
                  onClick={() => {
                    const currentIndex = tabs.findIndex(
                      (t) => t.id === activeTab,
                    );
                    if (currentIndex < tabs.length - 1) {
                      const nextTab = tabs[currentIndex + 1];
                      if (nextTab.id !== "variants" || editingProduct) {
                        setActiveTab(nextTab.id);
                      }
                    }
                  }}
                  disabled={
                    activeTab === "publishing" ||
                    (activeTab === "pricing" && !editingProduct)
                  }
                >
                  {he ? "הבא" : "Next"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </button>
                <button
                  type="submit"
                  className="miro-button miro-button-primary"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {he ? "שומר..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {he ? "שמור מוצר" : "Save Product"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
