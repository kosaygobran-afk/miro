"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Archive,
  RotateCcw,
  ImageIcon,
  CalendarDays,
} from "lucide-react";
import { ConfirmationDialog, PageHeader } from "./ui";

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

type ProductImage = {
  id: string;
  image_url: string;
  alt_he: string | null;
  alt_en: string | null;
  sort_order: number;
};

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

export function ProductManagement({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteProduct = products.find(
    (product) => product.id === pendingDeleteId,
  );

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        fetch("/api/management/products?limit=100&sort=sort_order&order=asc", {
          cache: "no-store",
        }),
        fetch("/api/management/categories", { cache: "no-store" }),
      ]);

      if (!productsRes.ok || !categoriesRes.ok)
        throw new Error("Failed to load data");

      const { products: productsData } = await productsRes.json();
      const { categories: categoriesData } = await categoriesRes.json();

      setProducts(productsData);
      setCategories(categoriesData);
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
        const [productsRes, categoriesRes] = await Promise.all([
          fetch(
            "/api/management/products?limit=100&sort=sort_order&order=asc",
            { cache: "no-store" },
          ),
          fetch("/api/management/categories", { cache: "no-store" }),
        ]);
        if (!ignore && productsRes.ok && categoriesRes.ok) {
          const { products: productsData } = await productsRes.json();
          const { categories: categoriesData } = await categoriesRes.json();
          setProducts(productsData);
          setCategories(categoriesData);
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

  async function handleStatusChange(
    productId: string,
    newStatus: "draft" | "active" | "hidden" | "archived",
  ) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/management/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, status: newStatus }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.code === "publish_incomplete") {
          setError(
            he
              ? `לא ניתן לפרסם: ${err.details}. אנא השלם את השדות החסרים בעורך המוצר.`
              : `Cannot publish: ${err.details}. Complete the missing fields in the product editor.`,
          );
          return;
        }
        throw new Error(err.error || "Failed to update status");
      }

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
    setPendingDeleteId(null);
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

  const getPrimaryImage = (product: Product) =>
    [...(product.product_images ?? [])].sort(
      (first, second) => first.sort_order - second.sort_order,
    )[0] ?? null;

  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(he ? "he-IL" : "en-IL", {
      dateStyle: "medium",
    }).format(new Date(date));

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined)
      return he ? "לא פורסם" : "Unpublished";
    return new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(price);
  };

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
      <PageHeader
        title={he ? "ניהול מוצרים" : "Product Management"}
        subtitle={
          he
            ? "הוסף, ערוך ומחק מוצרים, נהל סטטוסים ופרסום"
            : "Add, edit, delete products and manage statuses and publishing"
        }
        actions={
          <Link
            href={`/${locale}/admin/products/new`}
            className="miro-button miro-button-primary"
          >
            <Plus className="me-2 h-4 w-4" />
            {he ? "הוסף מוצר" : "Add Product"}
          </Link>
        }
      />

      {error && (
        <div className="miro-card border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-destructive">{error}</span>
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
              <tr className="border-b border-border-subtle bg-surface-muted text-start">
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
                <th className="p-4">{he ? "עודכן" : "Updated"}</th>
                <th className="p-4">{he ? "פעולות" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const defaultVariant = getDefaultVariant(product);
                const effectivePrice = getEffectivePrice(product);
                const totalStock = getTotalStock(product);
                const primaryImage = getPrimaryImage(product);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border-subtle hover:bg-surface-muted/50"
                  >
                    <td className="p-4">
                      {primaryImage ? (
                        <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-border-subtle bg-surface-muted shadow-sm">
                          <Image
                            src={primaryImage.image_url}
                            alt={
                              (he
                                ? primaryImage.alt_he
                                : primaryImage.alt_en) ??
                              (he ? product.name_he : product.name_en)
                            }
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized={primaryImage.image_url.endsWith(
                              ".svg",
                            )}
                          />
                          <span
                            className="product-management__image-count"
                            aria-label={
                              he
                                ? `${product.product_images.length} תמונות`
                                : `${product.product_images.length} images`
                            }
                          >
                            <ImageIcon aria-hidden="true" />
                            {product.product_images.length}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="inline-flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-muted text-muted-foreground"
                          title={he ? "אין תמונה" : "No image"}
                        >
                          <ImageIcon className="h-5 w-5" aria-hidden="true" />
                          <span className="sr-only">
                            {he ? "אין תמונה" : "No image"}
                          </span>
                        </span>
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
                      {defaultVariant?.sku ?? "—"}
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
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                        <CalendarDays
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <time dateTime={product.updated_at}>
                          {formatDate(product.updated_at)}
                        </time>
                      </span>
                    </td>
                    <td className="p-4">
                      <div
                        className="product-management__actions"
                        role="group"
                        aria-label={he ? "פעולות מוצר" : "Product actions"}
                      >
                        <Link
                          href={`/${locale}/admin/products/${product.id}`}
                          className="product-management__action"
                          aria-label={he ? "עריכה" : "Edit"}
                          data-tooltip={he ? "עריכה" : "Edit"}
                        >
                          <Edit aria-hidden="true" />
                        </Link>
                        {product.status === "active" ? (
                          <>
                            <button
                              type="button"
                              className="product-management__action product-management__action--warning"
                              onClick={() =>
                                void handleStatusChange(product.id, "hidden")
                              }
                              disabled={saving}
                              aria-label={he ? "הסתר" : "Hide"}
                              data-tooltip={he ? "הסתר" : "Hide"}
                            >
                              <EyeOff aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="product-management__action product-management__action--danger"
                              onClick={() =>
                                void handleStatusChange(product.id, "archived")
                              }
                              disabled={saving}
                              aria-label={he ? "ארכב" : "Archive"}
                              data-tooltip={he ? "ארכב" : "Archive"}
                            >
                              <Archive aria-hidden="true" />
                            </button>
                          </>
                        ) : product.status === "hidden" ? (
                          <>
                            <button
                              type="button"
                              className="product-management__action"
                              onClick={() =>
                                void handleStatusChange(product.id, "active")
                              }
                              disabled={saving}
                              aria-label={he ? "פרסם" : "Publish"}
                              data-tooltip={he ? "פרסם" : "Publish"}
                            >
                              <Eye aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="product-management__action product-management__action--danger"
                              onClick={() =>
                                void handleStatusChange(product.id, "archived")
                              }
                              disabled={saving}
                              aria-label={he ? "ארכב" : "Archive"}
                              data-tooltip={he ? "ארכב" : "Archive"}
                            >
                              <Archive aria-hidden="true" />
                            </button>
                          </>
                        ) : product.status === "draft" ? (
                          <button
                            type="button"
                            className="product-management__action product-management__action--primary"
                            onClick={() =>
                              void handleStatusChange(product.id, "active")
                            }
                            disabled={saving}
                            aria-label={he ? "פרסם" : "Publish"}
                            data-tooltip={he ? "פרסם" : "Publish"}
                          >
                            <Eye aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="product-management__action"
                            onClick={() =>
                              void handleStatusChange(product.id, "draft")
                            }
                            disabled={saving}
                            aria-label={he ? "שחזר לטיוטה" : "Restore to draft"}
                            data-tooltip={he ? "שחזר לטיוטה" : "Restore"}
                          >
                            <RotateCcw aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="product-management__action product-management__action--danger"
                          onClick={() => setPendingDeleteId(product.id)}
                          aria-label={he ? "מחיקה" : "Delete"}
                          data-tooltip={he ? "מחיקה" : "Delete"}
                        >
                          <Trash2 aria-hidden="true" />
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

      <ConfirmationDialog
        open={pendingDeleteId !== null}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) void deleteProduct(pendingDeleteId);
        }}
        title={he ? "למחוק את המוצר?" : "Delete product?"}
        description={
          pendingDeleteProduct
            ? he
              ? `הפעולה תמחק את ${pendingDeleteProduct.name_he} ואת הקשרים שלו. לא ניתן לבטל אותה.`
              : `This will delete ${pendingDeleteProduct.name_en} and its relationships. This cannot be undone.`
            : he
              ? "לא ניתן לבטל פעולה זו."
              : "This action cannot be undone."
        }
        confirmLabel={he ? "אישור מחיקה" : "Delete product"}
        cancelLabel={he ? "ביטול" : "Cancel"}
        tone="danger"
      />
    </div>
  );
}
