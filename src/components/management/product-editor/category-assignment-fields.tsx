"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Dialog, FormField, Notice } from "../ui";
import {
  categoryAssignmentCopy as copy,
  editorCopy,
  fieldLabels,
  validationCopy,
} from "./copy";
import type { Category, Locale } from "./types";
import styles from "./product-editor.module.css";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

type Props = {
  locale: Locale;
  idPrefix: string;
  categories: Category[];
  categoryId: string;
  subcategoryId: string;
  onCategoryChange: (id: string) => void;
  onSubcategoryChange: (id: string) => void;
  onCategoriesChange: (categories: Category[]) => void;
  categoryError?: string;
  subcategoryError?: string;
  disabled?: boolean;
};

/** Shared category controls for both draft creation and the full product editor. */
export function CategoryAssignmentFields({
  locale,
  idPrefix,
  categories,
  categoryId,
  subcategoryId,
  onCategoryChange,
  onSubcategoryChange,
  onCategoriesChange,
  categoryError,
  subcategoryError,
  disabled = false,
}: Props) {
  const dialogId = useId();
  const he = locale === "he";
  const [open, setOpen] = useState(false);
  const [draftParentId, setDraftParentId] = useState("");
  const [nameHe, setNameHe] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<{
    name_he?: string;
    name_en?: string;
    slug?: string;
  }>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checking, setChecking] = useState(false);
  const saveLock = useRef(false);
  const selectedRoot = categories.find(
    (category) => category.id === categoryId && !category.parent_id,
  );
  const children = categories.filter(
    (category) => category.parent_id === categoryId && category.is_active,
  );
  const inactiveChild = categories.find(
    (category) =>
      category.id === subcategoryId &&
      category.parent_id === categoryId &&
      !category.is_active,
  );
  const canCreate = Boolean(selectedRoot?.is_active);
  const draftRoot = categories.find(
    (category) => category.id === draftParentId && !category.parent_id,
  );
  const finalSlug = slugTouched ? slug.trim() : slugify(nameEn);

  function selectCreated(category: Category, nextCategories: Category[]) {
    onCategoriesChange(nextCategories);
    if (category.parent_id === categoryId) onSubcategoryChange(category.id);
    setOpen(false);
    setNameHe("");
    setNameEn("");
    setSlug("");
    setSlugTouched(false);
    setError("");
    setUncertain(false);
    setSuccess(
      category.parent_id === categoryId
        ? copy.created[locale]
        : copy.createdUnderPreviousMain[locale],
    );
  }

  async function checkSavedCategories() {
    if (checking) return;
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/management/categories", {
        cache: "no-store",
      });
      const body = (await response.json()) as { categories?: Category[] };
      if (!response.ok || !Array.isArray(body.categories))
        throw new Error("load_failed");
      onCategoriesChange(body.categories);
      const found = body.categories.find(
        (category) =>
          category.parent_id === draftParentId &&
          category.slug === finalSlug &&
          category.name_he === nameHe.trim() &&
          category.name_en === nameEn.trim() &&
          category.is_active,
      );
      if (found) {
        selectCreated(found, body.categories);
      } else {
        setUncertain(false);
        setError(copy.notFound[locale]);
      }
    } catch {
      setError(copy.checkFailed[locale]);
    } finally {
      setChecking(false);
    }
  }

  async function createSubcategory() {
    if (saveLock.current || uncertain || checking || !draftRoot?.is_active)
      return;
    const nextErrors: typeof errors = {};
    if (!nameHe.trim())
      nextErrors.name_he = validationCopy.nameHeRequired[locale];
    if (!nameEn.trim())
      nextErrors.name_en = validationCopy.nameEnRequired[locale];
    if (!finalSlug) nextErrors.slug = validationCopy.slugRequired[locale];
    else if (!SLUG_PATTERN.test(finalSlug))
      nextErrors.slug = validationCopy.slugInvalid[locale];
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/management/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_he: nameHe.trim(),
          name_en: nameEn.trim(),
          slug: finalSlug,
          parent_id: draftParentId,
          is_active: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        category?: Category;
        error?: string;
      } | null;
      if (!response.ok) {
        if (
          body?.error === "Duplicate value" ||
          body?.error === "duplicate_slug" ||
          response.status === 409
        ) {
          setErrors((prev) => ({
            ...prev,
            slug: validationCopy.slugDuplicate[locale],
          }));
        }
        // A server failure can arrive after persistence; reconcile before another write.
        if (response.status >= 500) {
          setUncertain(true);
          setError(copy.uncertain[locale]);
        } else setError(copy.failed[locale]);
        return;
      }
      const category = body?.category;
      if (!category?.id || category.parent_id !== draftParentId) {
        setUncertain(true);
        setError(copy.uncertain[locale]);
        return;
      }
      selectCreated(category, [
        ...categories.filter((item) => item.id !== category.id),
        category,
      ]);
    } catch {
      setUncertain(true);
      setError(copy.uncertain[locale]);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={`${styles.fieldGrid} ${styles.fieldGridWide}`}>
      <FormField
        id={`${idPrefix}-category`}
        label={fieldLabels.category[locale]}
        required
        error={categoryError}
      >
        {(control) => (
          <select
            {...control}
            aria-describedby={[
              control["aria-describedby"],
              `${idPrefix}-category-assignment-help`,
            ]
              .filter(Boolean)
              .join(" ")}
            className="miro-input"
            value={categoryId}
            disabled={disabled || saving || checking}
            onChange={(event) => {
              onCategoryChange(event.target.value);
              setSuccess("");
            }}
          >
            <option value="">{fieldLabels.selectCategory[locale]}</option>
            {categories
              .filter(
                (category) =>
                  !category.parent_id &&
                  (category.is_active || category.id === categoryId),
              )
              .map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={!category.is_active}
                >
                  {he ? category.name_he : category.name_en}
                  {!category.is_active
                    ? he
                      ? " (לא פעילה)"
                      : " (inactive)"
                    : ""}
                </option>
              ))}
          </select>
        )}
      </FormField>
      <div className={styles.categoryAssignment}>
        <FormField
          id={`${idPrefix}-subcategory`}
          label={fieldLabels.subcategory[locale]}
          error={subcategoryError}
        >
          {(control) => (
            <select
              {...control}
              aria-describedby={[
                control["aria-describedby"],
                `${idPrefix}-category-assignment-help`,
              ]
                .filter(Boolean)
                .join(" ")}
              className="miro-input"
              value={subcategoryId}
              disabled={disabled || saving || checking || !canCreate}
              onChange={(event) => {
                onSubcategoryChange(event.target.value);
                setSuccess("");
              }}
            >
              <option value="">{fieldLabels.noSubcategory[locale]}</option>
              {inactiveChild ? (
                <option value={inactiveChild.id} disabled>
                  {he ? inactiveChild.name_he : inactiveChild.name_en}
                  {he ? " (לא פעילה)" : " (inactive)"}
                </option>
              ) : null}
              {children.map((category) => (
                <option key={category.id} value={category.id}>
                  {he ? category.name_he : category.name_en}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <button
          type="button"
          className="miro-button miro-button-secondary"
          disabled={disabled || (!canCreate && !uncertain)}
          title={!canCreate ? copy.chooseMain[locale] : undefined}
          onClick={() => {
            if (!uncertain) setDraftParentId(categoryId);
            setOpen(true);
            setSuccess("");
          }}
        >
          <Plus size={16} aria-hidden="true" /> {copy.create[locale]}
        </button>
      </div>
      <p
        id={`${idPrefix}-category-assignment-help`}
        className={`${styles.statusNote} ${styles.fieldGridWide}`}
      >
        {fieldLabels.categoryAssignmentHint[locale]}
      </p>
      {success ? (
        <Notice tone="success" className={styles.fieldGridWide}>
          {success}
        </Notice>
      ) : null}
      <Dialog
        open={open}
        onClose={() => {
          if (!saving && !checking) setOpen(false);
        }}
        title={copy.title[locale]}
        description={copy.description[locale]}
        closeLabel={editorCopy.close[locale]}
        footer={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              disabled={saving || checking}
              onClick={() => setOpen(false)}
            >
              {editorCopy.cancel[locale]}
            </button>
            {uncertain ? (
              <button
                type="button"
                className="mgmt-button mgmt-button--primary"
                disabled={checking || saving}
                onClick={() => void checkSavedCategories()}
                aria-busy={checking || undefined}
              >
                {copy.checkSaved[locale]}
              </button>
            ) : (
              <button
                type="button"
                className="mgmt-button mgmt-button--primary"
                disabled={saving || checking || !draftRoot?.is_active}
                onClick={() => void createSubcategory()}
                aria-busy={saving || undefined}
              >
                {saving ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {saving ? editorCopy.creating[locale] : copy.create[locale]}
              </button>
            )}
          </>
        }
      >
        <div
          className={styles.sectionStack}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault();
              void createSubcategory();
            }
          }}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <p className={styles.statusNote}>
            {fieldLabels.category[locale]}:{" "}
            <strong dir="auto">
              {he ? draftRoot?.name_he : draftRoot?.name_en}
            </strong>
          </p>
          <FormField
            id={`${dialogId}-name-he`}
            label={fieldLabels.nameHe[locale]}
            required
            error={errors.name_he}
          >
            {(control) => (
              <input
                {...control}
                className="miro-input"
                dir="rtl"
                value={nameHe}
                maxLength={255}
                disabled={saving || checking || uncertain}
                onChange={(event) => setNameHe(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            id={`${dialogId}-name-en`}
            label={fieldLabels.nameEn[locale]}
            required
            error={errors.name_en}
          >
            {(control) => (
              <input
                {...control}
                className="miro-input"
                dir="ltr"
                value={nameEn}
                maxLength={255}
                disabled={saving || checking || uncertain}
                onChange={(event) => {
                  setNameEn(event.target.value);
                  if (!slugTouched) setSlug(slugify(event.target.value));
                }}
              />
            )}
          </FormField>
          <FormField
            id={`${dialogId}-slug`}
            label={fieldLabels.slug[locale]}
            description={fieldLabels.slugDescription[locale]}
            required
            error={errors.slug}
          >
            {(control) => (
              <input
                {...control}
                className="miro-input"
                dir="ltr"
                value={slugTouched ? slug : slugify(nameEn)}
                maxLength={100}
                disabled={saving || checking || uncertain}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
              />
            )}
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}
