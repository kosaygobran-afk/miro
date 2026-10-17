"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "@/components/motion/use-motion-router";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import {
  ErrorState,
  FormField,
  FormSection,
  FormSkeleton,
  Notice,
  PageHeader,
} from "../ui";
import { editorCopy, fieldLabels, validationCopy } from "./copy";
import type { Category, Locale } from "./types";
import { CategoryAssignmentFields } from "./category-assignment-fields";
import styles from "./product-editor.module.css";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function NewProductForm({ locale }: { locale: Locale }) {
  const he = locale === "he";
  const router = useRouter();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [nameHe, setNameHe] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [errors, setErrors] = useState<{
    name_he?: string;
    name_en?: string;
    slug?: string;
    category_id?: string;
    subcategory_id?: string;
  }>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const formId = useId();

  useEffect(() => {
    let ignore = false;
    async function loadCategories() {
      try {
        const response = await fetch("/api/management/categories", {
          cache: "no-store",
        });
        if (ignore) return;
        if (!response.ok) {
          setLoadError(true);
          return;
        }
        const data = (await response.json()) as { categories?: Category[] };
        if (!ignore) setCategories(data.categories ?? []);
      } catch {
        if (!ignore) setLoadError(true);
      }
    }
    void loadCategories();
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const nextErrors: typeof errors = {};
    if (
      !categories?.some(
        (category) =>
          category.id === categoryId &&
          !category.parent_id &&
          category.is_active,
      )
    ) {
      nextErrors.category_id = validationCopy.categoryRequired[locale];
    }
    if (
      subcategoryId &&
      !categories?.some(
        (category) =>
          category.id === subcategoryId &&
          category.parent_id === categoryId &&
          category.is_active,
      )
    ) {
      nextErrors.subcategory_id = validationCopy.subcategoryInvalid[locale];
    }
    if (!nameHe.trim())
      nextErrors.name_he = validationCopy.nameHeRequired[locale];
    if (!nameEn.trim())
      nextErrors.name_en = validationCopy.nameEnRequired[locale];
    const finalSlug = slugTouched
      ? slug.trim()
      : slugify(nameEn) || slug.trim();
    if (!finalSlug) {
      nextErrors.slug = validationCopy.slugRequired[locale];
    } else if (!SLUG_PATTERN.test(finalSlug)) {
      nextErrors.slug = validationCopy.slugInvalid[locale];
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/management/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_he: nameHe.trim(),
          name_en: nameEn.trim(),
          slug: finalSlug,
          category_id: categoryId,
          subcategory_id: subcategoryId || null,
          status: "draft",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        product?: { id: string };
      };
      if (!response.ok || !body.product?.id) {
        // Specific feedback for duplicate slug
        if (body.error === "duplicate_slug" || body.code === "duplicate_slug") {
          setErrors((prev) => ({
            ...prev,
            slug:
              validationCopy.slugDuplicate?.[locale] ??
              validationCopy.slugInvalid[locale],
          }));
        }
        setSubmitError(
          body.error === "Duplicate value"
            ? validationCopy.slugInvalid[locale]
            : body.error || editorCopy.saveFailed[locale],
        );
        return;
      }
      router.push(`/${locale}/admin/products/${body.product.id}`);
    } catch {
      setSubmitError(editorCopy.saveFailed[locale]);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <ErrorState
        title={editorCopy.loadFailed[locale]}
        onRetry={() => {
          setLoadError(false);
          setReloadToken((token) => token + 1);
        }}
        retryLabel={editorCopy.retry[locale]}
      />
    );
  }

  if (categories === null) {
    return (
      <FormSkeleton
        fields={4}
        label={he ? "טוען טופס מוצר…" : "Loading product form…"}
      />
    );
  }

  const BackArrow = he ? ArrowRight : ArrowLeft;

  return (
    <div>
      <PageHeader
        title={editorCopy.newProductTitle[locale]}
        subtitle={editorCopy.newProductSubtitle[locale]}
        breadcrumb={[
          { label: editorCopy.breadcrumbProducts[locale], href: "" },
          { label: editorCopy.newProductTitle[locale] },
        ]}
      />

      <form
        onSubmit={(e) => void submit(e)}
        className={`mt-6 ${styles.sectionStack}`}
        aria-label={editorCopy.newProductTitle[locale]}
        noValidate
      >
        {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
        <FormSection
          title={editorCopy.newProductTitle[locale]}
          description={editorCopy.newProductSubtitle[locale]}
        >
          <div className={styles.fieldGrid}>
            <FormField
              id={`${formId}-name-he`}
              label={fieldLabels.nameHe[locale]}
              required
              error={errors.name_he}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="rtl"
                  value={nameHe}
                  maxLength={255}
                  onChange={(e) => setNameHe(e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id={`${formId}-name-en`}
              label={fieldLabels.nameEn[locale]}
              required
              error={errors.name_en}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={nameEn}
                  maxLength={255}
                  onChange={(e) => {
                    setNameEn(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id={`${formId}-slug`}
              label={fieldLabels.slug[locale]}
              required
              description={fieldLabels.slugDescription[locale]}
              error={errors.slug}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className={`miro-input ${styles.ltrText}`}
                  dir="ltr"
                  value={slugTouched ? slug : slug || slugify(nameEn)}
                  maxLength={100}
                  placeholder="product-slug"
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  disabled={saving}
                />
              )}
            </FormField>
            <CategoryAssignmentFields
              locale={locale}
              idPrefix={formId}
              categories={categories}
              categoryId={categoryId}
              subcategoryId={subcategoryId}
              onCategoryChange={(id) => {
                setCategoryId(id);
                setSubcategoryId("");
                setErrors((prev) => ({
                  ...prev,
                  category_id: undefined,
                  subcategory_id: undefined,
                }));
              }}
              onSubcategoryChange={(id) => {
                setSubcategoryId(id);
                setErrors((prev) => ({ ...prev, subcategory_id: undefined }));
              }}
              onCategoriesChange={setCategories}
              categoryError={errors.category_id}
              subcategoryError={errors.subcategory_id}
              disabled={saving}
            />
          </div>
        </FormSection>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="miro-button miro-button-primary"
            disabled={saving}
            aria-busy={saving || undefined}
          >
            {saving ? (
              <>
                <Loader2
                  className="me-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                {editorCopy.creating[locale]}
              </>
            ) : (
              <>
                <Save className="me-2 h-4 w-4" aria-hidden="true" />
                {editorCopy.createProduct[locale]}
              </>
            )}
          </button>
          <button
            type="button"
            className="miro-button miro-button-secondary"
            onClick={() => router.push(`/${locale}/admin/products`)}
            disabled={saving}
          >
            <BackArrow className="me-2 h-4 w-4" aria-hidden="true" />
            {editorCopy.back[locale]}
          </button>
        </div>
      </form>
    </div>
  );
}
