"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Save,
  X,
} from "lucide-react";
import {
  ConfirmationDialog,
  ErrorState,
  FormField,
  FormSection,
  ListSkeleton,
  Notice,
  PageHeader,
  StatusBadge,
} from "../ui";
import {
  editorCopy,
  fieldLabels,
  policyLabels,
  priceCopy,
  sectionDescriptions,
  sectionLabels,
  statusLabels,
  validationCopy,
  variantCopy,
  type EditorSection,
} from "./copy";
import { MediaGallery } from "./media-gallery";
import { RolePricesSection } from "./role-prices-section";
import { VariantsSection } from "./variants-section";
import {
  OUT_OF_STOCK_POLICIES,
  STATUS_OPTIONS,
  PRICE_ROLES,
  type Category,
  type Locale,
  type OutOfStockPolicy,
  type Product,
  type ProductStatus,
  type ProductVariant,
  type Supplier,
  type PriceRole,
} from "./types";
import styles from "./product-editor.module.css";

type EditorForm = {
  name_he: string;
  name_en: string;
  slug: string;
  category_id: string;
  brand: string;
  model_number: string;
  tags: string[];
  short_description_he: string;
  short_description_en: string;
  description_he: string;
  description_en: string;
  warranty_he: string;
  warranty_en: string;
  price: string;
  compare_at_price: string;
  sale_price: string;
  purchase_cost: string;
  seo_title_he: string;
  seo_title_en: string;
  seo_description_he: string;
  seo_description_en: string;
  status: ProductStatus;
  out_of_stock_policy: OutOfStockPolicy;
  is_featured: boolean;
  sort_order: string;
};

const SECTION_ORDER: EditorSection[] = [
  "general",
  "content",
  "media",
  "variants",
  "inventory",
  "pricing",
  "seo",
  "publishing",
];

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type FieldKey = Exclude<keyof EditorForm, "tags">;

function toForm(product: Product): EditorForm {
  return {
    name_he: product.name_he,
    name_en: product.name_en,
    slug: product.slug,
    category_id: product.category_id ?? "",
    brand: product.brand ?? "",
    model_number: product.model_number ?? "",
    tags: product.tags ?? [],
    short_description_he: product.short_description_he ?? "",
    short_description_en: product.short_description_en ?? "",
    description_he: product.description_he ?? "",
    description_en: product.description_en ?? "",
    warranty_he: product.warranty_he ?? "",
    warranty_en: product.warranty_en ?? "",
    price: product.price?.toString() ?? "",
    compare_at_price: product.compare_at_price?.toString() ?? "",
    sale_price: product.sale_price?.toString() ?? "",
    purchase_cost: product.purchase_cost?.toString() ?? "",
    seo_title_he: product.seo_title_he ?? "",
    seo_title_en: product.seo_title_en ?? "",
    seo_description_he: product.seo_description_he ?? "",
    seo_description_en: product.seo_description_en ?? "",
    status: product.status,
    out_of_stock_policy: product.out_of_stock_policy,
    is_featured: product.is_featured,
    sort_order: String(product.sort_order ?? 0),
  };
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

function numOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

const TEXT_FIELDS = [
  "brand",
  "model_number",
  "short_description_he",
  "short_description_en",
  "description_he",
  "description_en",
  "warranty_he",
  "warranty_en",
  "seo_title_he",
  "seo_title_en",
  "seo_description_he",
  "seo_description_en",
] as const satisfies readonly FieldKey[];

const MONEY_FIELDS = [
  "price",
  "compare_at_price",
  "sale_price",
  "purchase_cost",
] as const satisfies readonly FieldKey[];

/**
 * Diff the form against the last-saved snapshot and emit a payload limited
 * to the products PATCH whitelist (the route rejects unknown keys with 400).
 */
function buildPatch(
  form: EditorForm,
  initial: EditorForm,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ["name_he", "name_en", "slug"] as const) {
    if (form[key] !== initial[key]) patch[key] = form[key].trim();
  }
  if (form.category_id !== initial.category_id) {
    patch.category_id = form.category_id || null;
  }
  for (const key of TEXT_FIELDS) {
    const next = emptyToNull(form[key]);
    if (next !== emptyToNull(initial[key])) patch[key] = next;
  }
  for (const key of MONEY_FIELDS) {
    const next = numOrNull(form[key]);
    if (next !== numOrNull(initial[key])) patch[key] = next;
  }
  if (form.sort_order !== initial.sort_order) {
    patch.sort_order = Number.parseInt(form.sort_order, 10) || 0;
  }
  if (form.is_featured !== initial.is_featured) {
    patch.is_featured = form.is_featured;
  }
  if (form.status !== initial.status) patch.status = form.status;
  if (form.out_of_stock_policy !== initial.out_of_stock_policy) {
    patch.out_of_stock_policy = form.out_of_stock_policy;
  }
  if (JSON.stringify(form.tags) !== JSON.stringify(initial.tags)) {
    patch.tags = form.tags;
  }
  return patch;
}

export function ProductEditor({
  locale,
  productId,
}: {
  locale: Locale;
  productId: string;
}) {
  const he = locale === "he";
  const router = useRouter();
  const [loadState, setLoadState] = useState<
    "loading" | "error" | "notfound" | "ready"
  >("loading");
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [form, setForm] = useState<EditorForm | null>(null);
  const [initialForm, setInitialForm] = useState<EditorForm | null>(null);
  const [activeSection, setActiveSection] = useState<EditorSection>("general");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});
  const [saveError, setSaveError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [images, setImages] = useState(product?.product_images ?? []);

  // Role prices state (lifted up to survive section changes)
  const [rolePrices, setRolePrices] = useState<
    Partial<Record<PriceRole, number>>
  >({});
  const [rolePriceInputs, setRolePriceInputs] = useState<
    Record<PriceRole, string>
  >({} as Record<PriceRole, string>);
  const [rolePriceSavingRole, setRolePriceSavingRole] =
    useState<PriceRole | null>(null);
  const [rolePriceErrors, setRolePriceErrors] = useState<
    Partial<Record<PriceRole, string>>
  >({});

  const stickyBarRef = useRef<HTMLDivElement>(null);
  const measureRafRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Measure stickyBar height for sticky coordination with topbar (border-box)
  // Uses a callback ref to measure when the element is actually mounted
  const setStickyBarRef = useCallback((element: HTMLDivElement | null) => {
    stickyBarRef.current = element;

    // Clean up previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    if (!element) {
      document.documentElement.style.removeProperty("--mgmt-stickybar-height");
      return;
    }

    const measure = () => {
      const height = element.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--mgmt-stickybar-height",
        `${height}px`,
      );
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        document.documentElement.style.setProperty(
          "--mgmt-stickybar-height",
          `${height}px`,
        );
      }
    });

    resizeObserver.observe(element, { box: "border-box" });
    resizeObserverRef.current = resizeObserver;
    measure();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const observer = resizeObserverRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const raf = measureRafRef.current;
      if (observer) {
        observer.disconnect();
        resizeObserverRef.current = null;
      }
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.style.removeProperty("--mgmt-stickybar-height");
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        // Fetch single product by ID using the new detail endpoint
        const [productRes, categoriesRes, suppliersRes] = await Promise.all([
          fetch(`/api/management/products/${productId}`, { cache: "no-store" }),
          fetch("/api/management/categories", { cache: "no-store" }),
          fetch("/api/management/suppliers", { cache: "no-store" }),
        ]);
        if (ignore) return;
        if (!productRes.ok || !categoriesRes.ok || !suppliersRes.ok) {
          if (productRes.status === 404) {
            setLoadState("notfound");
          } else {
            setLoadState("error");
          }
          return;
        }
        const productData = (await productRes.json()) as { product?: Product };
        const categoriesData = (await categoriesRes.json()) as {
          categories?: Category[];
        };
        const suppliersData = (await suppliersRes.json()) as {
          suppliers?: Supplier[];
        };
        if (ignore) return;
        const found = productData.product ?? null;
        if (!found) {
          setLoadState("notfound");
          return;
        }
        setCategories(categoriesData.categories ?? []);
        setSuppliers(suppliersData.suppliers ?? []);
        setProduct(found);
        setVariants(found.product_variants ?? []);
        setImages(found.product_images ?? []);
        const nextForm = toForm(found);
        setForm(nextForm);
        setInitialForm(nextForm);

        // Initialize role prices from product data
        const pricesMap: Partial<Record<PriceRole, number>> = {};
        const inputsMap = {} as Record<PriceRole, string>;
        for (const role of PRICE_ROLES) {
          const price = found.product_prices?.find((p) => p.role === role);
          pricesMap[role] = price?.price ?? undefined;
          inputsMap[role] = price ? String(price.price) : "";
        }
        setRolePrices(pricesMap);
        setRolePriceInputs(inputsMap);

        setLoadState("ready");
      } catch {
        if (!ignore) setLoadState("error");
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [productId, reloadToken]);

  const dirty = useMemo(
    () =>
      form !== null &&
      initialForm !== null &&
      JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function setField<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setSaveOk(false);
    if (key === "status") setPublishError("");
  }

  function addTag() {
    const value = tagInput.trim();
    if (!value || !form) return;
    if (!form.tags.includes(value)) {
      setField("tags", [...form.tags, value]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    if (!form) return;
    setField(
      "tags",
      form.tags.filter((entry) => entry !== tag),
    );
  }

  function validate(current: EditorForm): {
    errors: Partial<Record<FieldKey, string>>;
    section: EditorSection;
  } | null {
    const errors: Partial<Record<FieldKey, string>> = {};
    const sectionFor: Partial<Record<FieldKey, EditorSection>> = {
      name_he: "general",
      name_en: "general",
      slug: "general",
      category_id: "general",
      price: "pricing",
      compare_at_price: "pricing",
      sale_price: "pricing",
      purchase_cost: "pricing",
      sort_order: "publishing",
    };
    if (!current.name_he.trim()) {
      errors.name_he = validationCopy.nameHeRequired[locale];
    }
    if (!current.name_en.trim()) {
      errors.name_en = validationCopy.nameEnRequired[locale];
    }
    if (!current.slug.trim()) {
      errors.slug = validationCopy.slugRequired[locale];
    } else if (!SLUG_PATTERN.test(current.slug.trim())) {
      errors.slug = validationCopy.slugInvalid[locale];
    }
    if (current.status === "active" && !current.category_id) {
      errors.category_id = validationCopy.categoryRequiredForPublish[locale];
    }
    for (const key of MONEY_FIELDS) {
      const raw = current[key].trim();
      if (raw === "") continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        errors[key] = validationCopy.invalidNumber[locale];
        continue;
      }
      if (key === "purchase_cost") {
        if (parsed < 0) errors[key] = validationCopy.invalidNumber[locale];
      } else if (parsed <= 0) {
        errors[key] = validationCopy.priceMustBePositive[locale];
      }
    }
    const compareAt = numOrNull(current.compare_at_price);
    const sale = numOrNull(current.sale_price);
    if (
      !errors.compare_at_price &&
      !errors.sale_price &&
      compareAt !== null &&
      sale !== null &&
      compareAt <= sale
    ) {
      errors.compare_at_price = validationCopy.compareAtMustExceedSale[locale];
    }
    if (current.sort_order.trim() !== "") {
      const parsed = Number(current.sort_order);
      if (!Number.isInteger(parsed)) {
        errors.sort_order = validationCopy.invalidNumber[locale];
      }
    }
    const firstKey = Object.keys(errors)[0] as FieldKey | undefined;
    if (!firstKey) return null;
    return { errors, section: sectionFor[firstKey] ?? "general" };
  }

  async function save() {
    if (saving || !product || !form || !initialForm) return;
    setSaveError("");
    setPublishError("");
    setSaveOk(false);
    const validation = validate(form);
    if (validation) {
      setFieldErrors(validation.errors);
      setActiveSection(validation.section);
      setSaveError(editorCopy.saveFailed[locale]);
      return;
    }
    const patch = buildPatch(form, initialForm);
    if (Object.keys(patch).length === 0) {
      setSaveOk(true);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/management/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, ...patch }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        details?: string;
        product?: Partial<Product>;
      };
      if (!response.ok) {
        if (body.code === "publish_incomplete") {
          setPublishError(
            `${validationCopy.publishFailed[locale]}: ${body.details ?? ""}`,
          );
          setActiveSection("publishing");
          return;
        }
        if (body.error === "Price must be greater than 0") {
          setFieldErrors({ price: validationCopy.priceMustBePositive[locale] });
          setActiveSection("pricing");
        } else if (
          body.error === "Compare-at price must be greater than the sale price"
        ) {
          setFieldErrors({
            compare_at_price: validationCopy.compareAtMustExceedSale[locale],
          });
          setActiveSection("pricing");
        }
        setSaveError(body.error || editorCopy.saveFailed[locale]);
        return;
      }
      // Re-fetch canonical data to ensure we have the authoritative server state
      const refetch = await fetch(`/api/management/products?id=${product.id}`, {
        cache: "no-store",
      });
      if (refetch.ok) {
        const data = (await refetch.json()) as { product?: Product };
        if (data.product) {
          setProduct(data.product);
          setVariants(data.product.product_variants ?? []);
          const nextForm = toForm(data.product);
          setForm(nextForm);
          setInitialForm(nextForm);
        } else {
          // Fallback: merge patch if refetch doesn't return full product
          setProduct((prev) =>
            prev ? { ...prev, ...(body.product ?? {}), ...patch } : prev,
          );
          setInitialForm(form);
        }
      } else {
        // Fallback: merge patch if refetch fails
        setProduct((prev) =>
          prev ? { ...prev, ...(body.product ?? {}), ...patch } : prev,
        );
        setInitialForm(form);
      }
      setSaveOk(true);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveError(editorCopy.saveFailed[locale]);
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (dirty) {
      setConfirmBack(true);
      return;
    }
    router.push(`/${locale}/admin/products`);
  }

  if (loadState === "loading") {
    return (
      <div className="space-y-4" aria-busy="true">
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <ErrorState
        title={editorCopy.loadFailed[locale]}
        onRetry={() => {
          setLoadState("loading");
          setReloadToken((token) => token + 1);
        }}
        retryLabel={editorCopy.retry[locale]}
      />
    );
  }

  if (loadState === "notfound" || !product || !form || !initialForm) {
    return (
      <ErrorState
        title={editorCopy.productNotFound[locale]}
        description={
          <Link
            href={`/${locale}/admin/products`}
            className="text-accent-text underline"
          >
            {editorCopy.back[locale]}
          </Link>
        }
      />
    );
  }

  const savedCategorySlug =
    categories.find((c) => c.id === initialForm.category_id)?.slug ??
    product.categories?.slug ??
    null;
  const storefrontHref =
    initialForm.status === "active" && savedCategorySlug
      ? `/${locale}/store/${savedCategorySlug}/${initialForm.slug}`
      : null;

  const BackArrow = he ? ArrowRight : ArrowLeft;

  return (
    <div>
      <div ref={setStickyBarRef} className={styles.stickyBar}>
        <button
          type="button"
          className="miro-button miro-button-ghost"
          onClick={goBack}
          aria-label={editorCopy.back[locale]}
        >
          <BackArrow className="h-4 w-4" aria-hidden="true" />
          <span>{editorCopy.back[locale]}</span>
        </button>
        <PageHeader
          title={
            <span dir="auto">
              {he ? initialForm.name_he : initialForm.name_en}
            </span>
          }
          subtitle={
            <span className="inline-flex items-center gap-2">
              <StatusBadge status={initialForm.status} size="sm">
                {statusLabels[initialForm.status][locale]}
              </StatusBadge>
              {dirty ? (
                <StatusBadge
                  status="draft"
                  tone="warning"
                  size="sm"
                  withDot={false}
                >
                  {editorCopy.unsavedBadge[locale]}
                </StatusBadge>
              ) : null}
            </span>
          }
          breadcrumb={[
            { label: editorCopy.breadcrumbProducts[locale] },
            { label: he ? initialForm.name_he : initialForm.name_en },
          ]}
          className="!p-0"
        />
        <div className={styles.headerActions}>
          {storefrontHref ? (
            <Link
              href={storefrontHref}
              className="miro-button miro-button-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="me-2 h-4 w-4" aria-hidden="true" />
              {editorCopy.viewStorefront[locale]}
            </Link>
          ) : null}
          <button
            type="button"
            className={`miro-button ${saveOk && !dirty ? styles.saveButtonSaved : "miro-button-primary"}`}
            onClick={() => void save()}
            disabled={saving || (!dirty && !saveOk)}
            aria-busy={saving || undefined}
          >
            {saving ? (
              <>
                <Loader2
                  className="me-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                {editorCopy.saving[locale]}
              </>
            ) : saveOk && !dirty ? (
              <>
                <CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />
                {editorCopy.savedButton[locale]}
              </>
            ) : (
              <>
                <Save className="me-2 h-4 w-4" aria-hidden="true" />
                {editorCopy.save[locale]}
              </>
            )}
          </button>
        </div>
      </div>

      {publishError ? (
        <Notice tone="danger" className="mb-4">
          {publishError}
        </Notice>
      ) : null}
      {saveError ? (
        <Notice
          tone="danger"
          className="mb-4"
          onDismiss={() => setSaveError("")}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {saveError}
        </Notice>
      ) : null}
      {saveOk && !dirty ? (
        <Notice
          tone="success"
          className="mb-4"
          onDismiss={() => setSaveOk(false)}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {editorCopy.saved[locale]}
        </Notice>
      ) : null}

      <div className={styles.layout}>
        <nav
          className={styles.sectionNav}
          aria-label={editorCopy.sectionsNavLabel[locale]}
        >
          {SECTION_ORDER.map((section) => (
            <button
              key={section}
              type="button"
              className={`${styles.sectionNavItem} ${
                activeSection === section ? styles.sectionNavItemActive : ""
              }`}
              aria-current={activeSection === section ? "true" : undefined}
              onClick={() => setActiveSection(section)}
            >
              {sectionLabels[section][locale]}
            </button>
          ))}
        </nav>

        <div className={styles.sectionStack}>
          {activeSection === "general" ? (
            <FormSection
              title={sectionLabels.general[locale]}
              description={sectionDescriptions.general[locale]}
            >
              <div className={styles.fieldGrid}>
                <FormField
                  id="product-name-he"
                  label={fieldLabels.nameHe[locale]}
                  required
                  error={fieldErrors.name_he}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="miro-input"
                      dir="rtl"
                      value={form.name_he}
                      maxLength={255}
                      onChange={(e) => setField("name_he", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  id="product-name-en"
                  label={fieldLabels.nameEn[locale]}
                  required
                  error={fieldErrors.name_en}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="miro-input"
                      dir="ltr"
                      value={form.name_en}
                      maxLength={255}
                      onChange={(e) => setField("name_en", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  id="product-category"
                  label={fieldLabels.category[locale]}
                  required={form.status === "active"}
                  error={fieldErrors.category_id}
                >
                  {(control) => (
                    <select
                      {...control}
                      className="miro-input"
                      value={form.category_id}
                      onChange={(e) => setField("category_id", e.target.value)}
                    >
                      <option value="">
                        {fieldLabels.selectCategory[locale]}
                      </option>
                      {categories
                        .filter((category) => category.is_active)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {he ? category.name_he : category.name_en}
                          </option>
                        ))}
                    </select>
                  )}
                </FormField>
                <FormField
                  id="product-slug"
                  label={fieldLabels.slug[locale]}
                  required
                  description={fieldLabels.slugDescription[locale]}
                  error={fieldErrors.slug}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className={`miro-input ${styles.ltrText}`}
                      dir="ltr"
                      value={form.slug}
                      maxLength={100}
                      placeholder="product-slug"
                      onChange={(e) => setField("slug", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField id="product-brand" label={fieldLabels.brand[locale]}>
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="miro-input"
                      dir="auto"
                      value={form.brand}
                      maxLength={255}
                      onChange={(e) => setField("brand", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  id="product-model"
                  label={fieldLabels.modelNumber[locale]}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="miro-input"
                      dir="ltr"
                      value={form.model_number}
                      maxLength={255}
                      onChange={(e) => setField("model_number", e.target.value)}
                    />
                  )}
                </FormField>
                <div className={styles.fieldGridWide}>
                  <FormField
                    id="product-tags"
                    label={fieldLabels.tags[locale]}
                    description={fieldLabels.tagsDescription[locale]}
                  >
                    {(control) => (
                      <input
                        {...control}
                        type="text"
                        className="miro-input"
                        dir="auto"
                        value={tagInput}
                        aria-label={fieldLabels.tagInputAria[locale]}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.includes(",")) {
                            setTagInput(value.replace(",", ""));
                            setTimeout(addTag, 0);
                          } else {
                            setTagInput(value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                        onBlur={addTag}
                      />
                    )}
                  </FormField>
                  {form.tags.length > 0 ? (
                    <ul className={styles.chipsRow}>
                      {form.tags.map((tag) => (
                        <li key={tag} className={styles.chip}>
                          <span dir="auto">{tag}</span>
                          <button
                            type="button"
                            className={styles.chipRemove}
                            onClick={() => removeTag(tag)}
                            aria-label={`${fieldLabels.removeTag[locale]}: ${tag}`}
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </FormSection>
          ) : null}

          {activeSection === "content" ? (
            <FormSection
              title={sectionLabels.content[locale]}
              description={sectionDescriptions.content[locale]}
            >
              <div className={styles.fieldGrid}>
                <FormField
                  id="product-short-he"
                  label={fieldLabels.shortDescriptionHe[locale]}
                >
                  {(control) => (
                    <textarea
                      {...control}
                      className="miro-input"
                      dir="rtl"
                      rows={2}
                      maxLength={500}
                      value={form.short_description_he}
                      onChange={(e) =>
                        setField("short_description_he", e.target.value)
                      }
                    />
                  )}
                </FormField>
                <FormField
                  id="product-short-en"
                  label={fieldLabels.shortDescriptionEn[locale]}
                >
                  {(control) => (
                    <textarea
                      {...control}
                      className="miro-input"
                      dir="ltr"
                      rows={2}
                      maxLength={500}
                      value={form.short_description_en}
                      onChange={(e) =>
                        setField("short_description_en", e.target.value)
                      }
                    />
                  )}
                </FormField>
                <div className={styles.fieldGridWide}>
                  <FormField
                    id="product-desc-he"
                    label={fieldLabels.descriptionHe[locale]}
                  >
                    {(control) => (
                      <textarea
                        {...control}
                        className="miro-input"
                        dir="rtl"
                        rows={5}
                        maxLength={20000}
                        value={form.description_he}
                        onChange={(e) =>
                          setField("description_he", e.target.value)
                        }
                      />
                    )}
                  </FormField>
                </div>
                <div className={styles.fieldGridWide}>
                  <FormField
                    id="product-desc-en"
                    label={fieldLabels.descriptionEn[locale]}
                  >
                    {(control) => (
                      <textarea
                        {...control}
                        className="miro-input"
                        dir="ltr"
                        rows={5}
                        maxLength={20000}
                        value={form.description_en}
                        onChange={(e) =>
                          setField("description_en", e.target.value)
                        }
                      />
                    )}
                  </FormField>
                </div>
                <FormField
                  id="product-warranty-he"
                  label={fieldLabels.warrantyHe[locale]}
                >
                  {(control) => (
                    <textarea
                      {...control}
                      className="miro-input"
                      dir="rtl"
                      rows={2}
                      maxLength={1000}
                      value={form.warranty_he}
                      onChange={(e) => setField("warranty_he", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  id="product-warranty-en"
                  label={fieldLabels.warrantyEn[locale]}
                >
                  {(control) => (
                    <textarea
                      {...control}
                      className="miro-input"
                      dir="ltr"
                      rows={2}
                      maxLength={1000}
                      value={form.warranty_en}
                      onChange={(e) => setField("warranty_en", e.target.value)}
                    />
                  )}
                </FormField>
              </div>
            </FormSection>
          ) : null}

          {activeSection === "media" ? (
            <FormSection
              title={sectionLabels.media[locale]}
              description={`${sectionDescriptions.media[locale]} · ${images.length} ${he ? "תמונות" : images.length === 1 ? "image" : "images"}`}
            >
              <MediaGallery
                locale={locale}
                productId={product.id}
                onImagesChange={setImages}
              />
            </FormSection>
          ) : null}

          {activeSection === "variants" ? (
            <FormSection
              title={sectionLabels.variants[locale]}
              description={sectionDescriptions.variants[locale]}
            >
              <VariantsSection
                locale={locale}
                productId={product.id}
                suppliers={suppliers}
                variants={variants}
                onVariantsChange={setVariants}
              />
            </FormSection>
          ) : null}

          {activeSection === "inventory" ? (
            <FormSection
              title={sectionLabels.inventory[locale]}
              description={sectionDescriptions.inventory[locale]}
            >
              <div className={styles.sectionStack}>
                <Notice tone="info">{variantCopy.inventoryNote[locale]}</Notice>
                <ul
                  className={styles.sectionStack}
                  aria-label={sectionLabels.inventory[locale]}
                >
                  {variants.length === 0 ? (
                    <li className={styles.statusNote}>
                      {variantCopy.empty[locale]}
                    </li>
                  ) : (
                    variants.map((variant) => {
                      const low =
                        variant.low_stock_threshold > 0 &&
                        variant.stock_qty <= variant.low_stock_threshold;
                      const out = variant.stock_qty <= 0;
                      return (
                        <li
                          key={variant.id}
                          className="miro-card flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <span className="font-mono text-sm" dir="ltr">
                            {variant.sku}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <span className="text-sm">
                              {variantCopy.stock[locale]}: {variant.stock_qty}
                            </span>
                            <span className={styles.statusNote}>
                              {variantCopy.lowStockThreshold[locale]}:{" "}
                              {variant.low_stock_threshold}
                            </span>
                            <StatusBadge
                              status={
                                out
                                  ? "out_of_stock"
                                  : low
                                    ? "low_stock"
                                    : "in_stock"
                              }
                              size="sm"
                            >
                              {out
                                ? variantCopy.outOfStock[locale]
                                : low
                                  ? variantCopy.lowStock[locale]
                                  : variantCopy.inStock[locale]}
                            </StatusBadge>
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </FormSection>
          ) : null}

          {activeSection === "pricing" ? (
            <>
              <FormSection
                title={sectionLabels.pricing[locale]}
                description={sectionDescriptions.pricing[locale]}
              >
                <div className={styles.fieldGrid}>
                  <FormField
                    id="product-price"
                    label={fieldLabels.basePrice[locale]}
                    description={fieldLabels.basePriceDescription[locale]}
                    error={fieldErrors.price}
                  >
                    {(control) => (
                      <input
                        {...control}
                        type="number"
                        className={`miro-input ${styles.numberInput}`}
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setField("price", e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField
                    id="product-compare-at"
                    label={fieldLabels.compareAtPrice[locale]}
                    error={fieldErrors.compare_at_price}
                  >
                    {(control) => (
                      <input
                        {...control}
                        type="number"
                        className={`miro-input ${styles.numberInput}`}
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={form.compare_at_price}
                        onChange={(e) =>
                          setField("compare_at_price", e.target.value)
                        }
                      />
                    )}
                  </FormField>
                  <FormField
                    id="product-sale-price"
                    label={fieldLabels.salePrice[locale]}
                    error={fieldErrors.sale_price}
                  >
                    {(control) => (
                      <input
                        {...control}
                        type="number"
                        className={`miro-input ${styles.numberInput}`}
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={form.sale_price}
                        onChange={(e) => setField("sale_price", e.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField
                    id="product-purchase-cost"
                    label={fieldLabels.purchaseCost[locale]}
                    error={fieldErrors.purchase_cost}
                  >
                    {(control) => (
                      <input
                        {...control}
                        type="number"
                        className={`miro-input ${styles.numberInput}`}
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={form.purchase_cost}
                        onChange={(e) =>
                          setField("purchase_cost", e.target.value)
                        }
                      />
                    )}
                  </FormField>
                </div>
              </FormSection>
              <FormSection
                title={priceCopy.rolePricesTitle[locale]}
                description={priceCopy.rolePricesDescription[locale]}
              >
                <RolePricesSection
                  locale={locale}
                  productId={product.id}
                  prices={rolePrices}
                  inputs={rolePriceInputs}
                  onPricesChange={setRolePrices}
                  onInputsChange={setRolePriceInputs}
                  savingRole={rolePriceSavingRole}
                  setSavingRole={setRolePriceSavingRole}
                  errors={rolePriceErrors}
                  setErrors={setRolePriceErrors}
                />
              </FormSection>
            </>
          ) : null}

          {activeSection === "seo" ? (
            <FormSection
              title={sectionLabels.seo[locale]}
              description={sectionDescriptions.seo[locale]}
            >
              <div className={styles.fieldGrid}>
                <FormField
                  id="product-seo-title-he"
                  label={fieldLabels.seoTitleHe[locale]}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="miro-input"
                      dir="rtl"
                      maxLength={255}
                      value={form.seo_title_he}
                      onChange={(e) => setField("seo_title_he", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField
                  id="product-seo-title-en"
                  label={fieldLabels.seoTitleEn[locale]}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="miro-input"
                      dir="ltr"
                      maxLength={255}
                      value={form.seo_title_en}
                      onChange={(e) => setField("seo_title_en", e.target.value)}
                    />
                  )}
                </FormField>
                <div className={styles.fieldGridWide}>
                  <FormField
                    id="product-seo-desc-he"
                    label={fieldLabels.seoDescriptionHe[locale]}
                  >
                    {(control) => (
                      <textarea
                        {...control}
                        className="miro-input"
                        dir="rtl"
                        rows={2}
                        maxLength={1000}
                        value={form.seo_description_he}
                        onChange={(e) =>
                          setField("seo_description_he", e.target.value)
                        }
                      />
                    )}
                  </FormField>
                </div>
                <div className={styles.fieldGridWide}>
                  <FormField
                    id="product-seo-desc-en"
                    label={fieldLabels.seoDescriptionEn[locale]}
                  >
                    {(control) => (
                      <textarea
                        {...control}
                        className="miro-input"
                        dir="ltr"
                        rows={2}
                        maxLength={1000}
                        value={form.seo_description_en}
                        onChange={(e) =>
                          setField("seo_description_en", e.target.value)
                        }
                      />
                    )}
                  </FormField>
                </div>
              </div>
            </FormSection>
          ) : null}

          {activeSection === "publishing" ? (
            <FormSection
              title={sectionLabels.publishing[locale]}
              description={sectionDescriptions.publishing[locale]}
            >
              <div className={styles.fieldGrid}>
                <FormField
                  id="product-status"
                  label={fieldLabels.status[locale]}
                  description={fieldLabels.statusDescription[locale]}
                >
                  {(control) => (
                    <select
                      {...control}
                      className="miro-input"
                      value={form.status}
                      onChange={(e) =>
                        setField("status", e.target.value as ProductStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status][locale]}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField
                  id="product-oos-policy"
                  label={fieldLabels.outOfStockPolicy[locale]}
                >
                  {(control) => (
                    <select
                      {...control}
                      className="miro-input"
                      value={form.out_of_stock_policy}
                      onChange={(e) =>
                        setField(
                          "out_of_stock_policy",
                          e.target.value as OutOfStockPolicy,
                        )
                      }
                    >
                      {OUT_OF_STOCK_POLICIES.map((policy) => (
                        <option key={policy} value={policy}>
                          {policyLabels[policy][locale]}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField
                  id="product-sort-order"
                  label={fieldLabels.sortOrder[locale]}
                  error={fieldErrors.sort_order}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="number"
                      className={`miro-input ${styles.numberInput}`}
                      inputMode="numeric"
                      step="1"
                      value={form.sort_order}
                      onChange={(e) => setField("sort_order", e.target.value)}
                    />
                  )}
                </FormField>
                <div className={styles.checkboxRow}>
                  <input
                    id="product-featured"
                    type="checkbox"
                    className="rounded border-border-subtle"
                    checked={form.is_featured}
                    onChange={(e) => setField("is_featured", e.target.checked)}
                  />
                  <div>
                    <label
                      htmlFor="product-featured"
                      className="text-sm font-medium cursor-pointer"
                    >
                      {fieldLabels.featured[locale]}
                    </label>
                    <p className={styles.statusNote}>
                      {fieldLabels.featuredDescription[locale]}
                    </p>
                  </div>
                </div>
              </div>
            </FormSection>
          ) : null}
        </div>
      </div>

      <ConfirmationDialog
        open={confirmBack}
        onConfirm={() => {
          setConfirmBack(false);
          router.push(`/${locale}/admin/products`);
        }}
        onCancel={() => setConfirmBack(false)}
        title={editorCopy.unsavedTitle[locale]}
        description={editorCopy.unsavedDescription[locale]}
        confirmLabel={editorCopy.leaveWithoutSaving[locale]}
        cancelLabel={editorCopy.keepEditing[locale]}
        tone="danger"
        closeLabel={editorCopy.close[locale]}
      />
    </div>
  );
}
