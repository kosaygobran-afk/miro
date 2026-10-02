"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FolderTree,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  OverflowText,
  IconAction,
  ActivationSwitch,
  ConfirmationDialog,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FormField,
  TableSkeleton,
  Notice,
  PageHeader,
  StatusBadge,
  Toolbar,
} from "../ui";
import { VisualKind } from "../visual-picker";
import { categoriesCopy as copy } from "./copy";
import { buildOrderUpdates } from "@/lib/management-ordering";
import { CollectionSummary } from "../ui/collection-summary";
import { ReportChoices } from "../ui/reporting-workspace";
import styles from "./categories-manager.module.css";

type CategoryRow = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  description_he: string | null;
  description_en: string | null;
  parent_id: string | null;
  image_url: string | null;
  icon_image_url: string | null;
  sort_order: number;
  is_active: boolean;
  product_count: number;
};

type CategoryForm = {
  slug: string;
  name_he: string;
  name_en: string;
  description_he: string;
  description_en: string;
  parent_id: string;
  image_url: string;
  visual_kind: VisualKind;
  sort_order: string;
  is_active: boolean;
};

const emptyForm: CategoryForm = {
  slug: "",
  name_he: "",
  name_en: "",
  description_he: "",
  description_en: "",
  parent_id: "",
  image_url: "",
  visual_kind: "uploaded_image",
  sort_order: "0",
  is_active: true,
};

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function toForm(row: CategoryRow): CategoryForm {
  return {
    slug: row.slug,
    name_he: row.name_he,
    name_en: row.name_en,
    description_he: row.description_he ?? "",
    description_en: row.description_en ?? "",
    parent_id: row.parent_id ?? "",
    image_url: row.icon_image_url ?? "",
    visual_kind: row.icon_image_url?.endsWith(".svg")
      ? "uploaded_svg"
      : "uploaded_image",
    sort_order: String(row.sort_order ?? 0),
    is_active: row.is_active,
  };
}

/** Returns the set of ids of the category itself and all its descendants. */
function collectDescendants(
  categories: CategoryRow[],
  rootId: string,
): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const siblings = byParent.get(category.parent_id) ?? [];
    siblings.push(category.id);
    byParent.set(category.parent_id, siblings);
  }
  const blocked = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const child of byParent.get(current) ?? []) {
      if (!blocked.has(child)) {
        blocked.add(child);
        queue.push(child);
      }
    }
  }
  return blocked;
}

export function CategoriesManager({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [notice, setNotice] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [reordering, setReordering] = useState(false);
  const reorderLock = useRef(false);
  const [activating, setActivating] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CategoryForm, string>>
  >({});
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = useState(false);

  const [pendingDeactivate, setPendingDeactivate] =
    useState<CategoryRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CategoryRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Icon upload state
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconUploadError, setIconUploadError] = useState("");
  const [iconUploadProgress, setIconUploadProgress] = useState(0);

  const [initialForm, setInitialForm] = useState<CategoryForm>(emptyForm);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

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
      const response = await fetch("/api/management/categories", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "load_failed");
      setCategories(data.categories ?? []);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return categories.filter(
      (c) =>
        (visibility === "all" || c.is_active === (visibility === "active")) &&
        (!needle ||
          [c.name_he, c.name_en, c.slug].some((value) =>
            value.toLowerCase().includes(needle),
          )),
    );
  }, [categories, search, visibility]);

  const categoryName = useCallback(
    (id: string | null) => {
      if (!id) return "—";
      const found = categories.find((c) => c.id === id);
      if (!found) return "—";
      return he ? found.name_he : found.name_en;
    },
    [categories, he],
  );

  function setField<K extends keyof CategoryForm>(
    key: K,
    value: CategoryForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setFieldErrors({});
    setDialogError("");
    setDialogOpen(true);
  }

  function openEdit(row: CategoryRow) {
    const next = toForm(row);
    setEditing(row);
    setForm(next);
    setInitialForm(next);
    setFieldErrors({});
    setDialogError("");
    setDialogOpen(true);
  }

  function requestCloseDialog() {
    if (saving) return;
    if (isDirty) {
      setDirtyConfirmOpen(true);
    } else {
      setDialogOpen(false);
    }
  }

  async function saveCategory() {
    if (saving) return;
    const errors: Partial<Record<keyof CategoryForm, string>> = {};
    if (!form.name_he.trim() || !form.name_en.trim()) {
      errors.name_he = copy.errorNameRequired[locale];
    }
    if (!SLUG_PATTERN.test(form.slug.trim())) {
      errors.slug = copy.errorSlug[locale];
    }
    const imageUrl = form.image_url.trim();
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      errors.image_url = copy.errorImageUrl[locale];
    }
    const sortOrder = Number.parseInt(form.sort_order, 10);
    if (form.sort_order.trim() === "" || !Number.isFinite(sortOrder)) {
      errors.sort_order = copy.errorSlug[locale];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setDialogError("");
    try {
      const payload: Record<string, unknown> = {
        slug: form.slug.trim(),
        name_he: form.name_he.trim(),
        name_en: form.name_en.trim(),
        description_he: form.description_he.trim() || null,
        description_en: form.description_en.trim() || null,
        parent_id: form.parent_id || null,
        image_url: imageUrl || null,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        is_active: form.is_active,
      };
      const response = await fetch("/api/management/categories", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing ? { id: editing.id, ...payload } : payload,
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          data.error === "Duplicate value" || data.error === "duplicate_slug"
            ? copy.duplicateSlug[locale]
            : data.error === "Invalid input" && data.details
              ? copy.cycleError[locale]
              : data.error || copy.saveFailed[locale];
        setDialogError(
          typeof message === "string" ? message : copy.saveFailed[locale],
        );
        return;
      }
      showNotice("success", copy.saved[locale]);
      setDialogOpen(false);
      await load();
    } catch {
      setDialogError(copy.saveFailed[locale]);
    } finally {
      setSaving(false);
    }
  }

  async function handleIconUpload(file: File) {
    if (!editing) return;

    setUploadingIcon(true);
    setIconUploadError("");
    setIconUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category_id", editing.id);

      // Use XMLHttpRequest to track progress
      const response = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setIconUploadProgress(progress);
          }
        });

        xhr.addEventListener("load", () => {
          const response = new Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: {
              "Content-Type":
                xhr.getResponseHeader("Content-Type") || "application/json",
            },
          });
          resolve(response);
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error"));
        });

        xhr.open("POST", "/api/management/categories/icon");
        xhr.send(formData);
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || copy.uploadFailed[locale]);
      }

      // Update the form with the new icon URL
      setForm((prev) => ({ ...prev, image_url: data.iconUrl }));
      setIconUploadProgress(100);
      showNotice("success", copy.uploadSuccess[locale]);

      // Refresh categories to update the table
      await load();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.uploadFailed[locale];
      setIconUploadError(message);
      showNotice("danger", message);
    } finally {
      setUploadingIcon(false);
      // Reset progress after a short delay
      setTimeout(() => setIconUploadProgress(0), 1000);
    }
  }

  async function handleIconRemove() {
    if (!editing) return;

    setUploadingIcon(true);
    setIconUploadError("");

    try {
      const response = await fetch("/api/management/categories/icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: editing.id, image_url: null }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || copy.uploadFailed[locale]);
      }

      // Update the form to clear the icon
      setForm((prev) => ({ ...prev, image_url: "" }));
      showNotice("success", copy.uploadSuccess[locale]);

      // Refresh categories to update the table
      await load();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.uploadFailed[locale];
      setIconUploadError(message);
      showNotice("danger", message);
    } finally {
      setUploadingIcon(false);
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "image/svg+xml",
      "image/png",
      "image/webp",
      "image/jpeg",
      "image/jpg",
      "image/avif",
    ];
    if (!allowedTypes.includes(file.type)) {
      setIconUploadError(copy.uploadFailed[locale]);
      showNotice("danger", copy.uploadFailed[locale]);
      return;
    }

    // Validate file size (1MB)
    const maxSize = 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      setIconUploadError(copy.uploadFailed[locale]);
      showNotice("danger", copy.uploadFailed[locale]);
      return;
    }

    await handleIconUpload(file);
    // Clear the input so the same file can be selected again
    event.target.value = "";
  }

  async function setActive(row: CategoryRow, active: boolean) {
    if (activating) return;
    setActivating(true);
    try {
      const response = await fetch("/api/management/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, is_active: active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice(
        "success",
        active ? copy.reactivated[locale] : copy.deactivated[locale],
      );
      await load();
    } catch {
      showNotice("danger", copy.saveFailed[locale]);
    } finally {
      setActivating(false);
    }
  }

  async function confirmDeactivate() {
    if (!pendingDeactivate || deactivating) return;
    setDeactivating(true);
    try {
      const response = await fetch(
        `/api/management/categories?id=${pendingDeactivate.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice("success", copy.deactivated[locale]);
      setPendingDeactivate(null);
      await load();
    } catch {
      showNotice("danger", copy.saveFailed[locale]);
    } finally {
      setDeactivating(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/management/categories?id=${pendingDelete.id}&hard=true`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice("success", copy.deleted[locale]);
      setPendingDelete(null);
      setDeleteConfirmText("");
      await load();
    } catch {
      showNotice("danger", copy.deleteFailed[locale]);
    } finally {
      setDeleting(false);
    }
  }

  async function moveSort(row: CategoryRow, delta: number) {
    if (reorderLock.current) return;
    const updates = buildOrderUpdates(categories, row.id, delta);
    if (!updates.length) return;
    reorderLock.current = true;
    setReordering(true);
    try {
      // Normalize duplicate/adjacent ranks so each arrow moves exactly one row.
      // Persist through the existing authorized and audited category API.
      for (const update of updates) {
        const response = await fetch("/api/management/categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        if (!response.ok) throw new Error("reorder_failed");
      }
      await load();
      showNotice(
        "success",
        he ? "סדר הקטגוריות עודכן" : "Category order updated",
      );
    } catch {
      showNotice("danger", copy.saveFailed[locale]);
      // A failed multi-row save must display the actual persisted order.
      await load();
    } finally {
      reorderLock.current = false;
      setReordering(false);
    }
  }

  const blockedParents = useMemo(() => {
    if (!editing) return new Set<string>();
    return collectDescendants(categories, editing.id);
  }, [categories, editing]);

  if (loadState === "loading") {
    return (
      <div className={styles.stack}>
        <PageHeader
          title={copy.pageTitle[locale]}
          subtitle={copy.pageSubtitle[locale]}
        />
        <TableSkeleton
          columnWidths={[
            "6%",
            "12%",
            "12%",
            "13%",
            "9%",
            "6%",
            "10%",
            "14%",
            "18%",
          ]}
          columns={[
            copy.colVisual[locale],
            copy.colNameHe[locale],
            copy.colNameEn[locale],
            copy.colSlug[locale],
            copy.colParent[locale],
            copy.colProducts[locale],
            copy.colStatus[locale],
            copy.colSort[locale],
            copy.colActions[locale],
          ]}
          rows={6}
          leadingImage
          minWidth="80rem"
        />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className={styles.stack}>
        <PageHeader
          title={copy.pageTitle[locale]}
          subtitle={copy.pageSubtitle[locale]}
        />
        <ErrorState
          title={copy.loadErrorTitle[locale]}
          onRetry={() => {
            setLoadState("loading");
            void load();
          }}
          retryLabel={copy.retry[locale]}
        />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <PageHeader
        title={copy.pageTitle[locale]}
        subtitle={copy.pageSubtitle[locale]}
        actions={
          <button
            type="button"
            className="miro-button miro-button-primary"
            onClick={openCreate}
          >
            <Plus size={16} aria-hidden="true" />
            {copy.addCategory[locale]}
          </button>
        }
      />

      {notice ? (
        <Notice
          tone={notice.tone}
          onDismiss={() => setNotice(null)}
          dismissLabel={copy.closeDialog[locale]}
        >
          {notice.text}
        </Notice>
      ) : null}

      <CollectionSummary
        items={[
          {
            label: he ? "נטענו במערכת" : "Loaded records",
            value: categories.length,
          },
          {
            label: he ? "מפורסמים" : "Active",
            value: categories.filter((row) => row.is_active).length,
          },
          {
            label: he ? "לא פעילים" : "Inactive",
            value: categories.filter((row) => !row.is_active).length,
          },
          {
            label: he ? "קטגוריות ריקות" : "Empty categories",
            value: categories.filter((row) => row.product_count === 0).length,
          },
        ]}
        scope={
          he
            ? "סיכום הרשומות שנטענו. החיפוש והסינון חלים על קבוצה זו."
            : "Summary of loaded records. Search and visibility filters apply to this collection."
        }
      />
      <ReportChoices
        label={he ? "מצב תצוגה" : "Visibility filter"}
        value={visibility}
        onChange={setVisibility}
        options={[
          { value: "all", label: he ? "הכל" : "All records" },
          { value: "active", label: he ? "פעילים" : "Active" },
          { value: "inactive", label: he ? "לא פעילים" : "Inactive" },
        ]}
      />

      <Toolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={copy.searchPlaceholder[locale]}
        searchLabel={copy.searchLabel[locale]}
      />

      <DataTable
        columnWidths={[
          "6%",
          "12%",
          "12%",
          "13%",
          "9%",
          "6%",
          "10%",
          "14%",
          "18%",
        ]}
        tableClassName="mgmt-categories-table"
        caption={copy.tableCaption[locale]}
        isEmpty={visible.length === 0}
        emptyState={
          <EmptyState
            icon={<FolderTree size={20} />}
            title={copy.emptyTitle[locale]}
            description={copy.emptyDescription[locale]}
            action={
              <button
                type="button"
                className="miro-button miro-button-primary"
                onClick={openCreate}
              >
                <Plus size={16} aria-hidden="true" />
                {copy.addCategory[locale]}
              </button>
            }
            compact
          />
        }
        minWidth="80rem"
        head={
          <tr>
            <th scope="col">{copy.colVisual[locale]}</th>
            <th scope="col">{copy.colNameHe[locale]}</th>
            <th scope="col">{copy.colNameEn[locale]}</th>
            <th scope="col">{copy.colSlug[locale]}</th>
            <th scope="col">{copy.colParent[locale]}</th>
            <th scope="col">{copy.colProducts[locale]}</th>
            <th scope="col">{copy.colStatus[locale]}</th>
            <th scope="col">{copy.colSort[locale]}</th>
            <th scope="col">{copy.colActions[locale]}</th>
          </tr>
        }
      >
        {visible.map((row) => {
          const Icon = FolderTree;
          return (
            <tr key={row.id}>
              <td>
                <span className={styles.visualCell} aria-hidden="true">
                  {row.icon_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.icon_image_url}
                      alt=""
                      className={styles.visualThumb}
                    />
                  ) : (
                    <Icon size={18} />
                  )}
                </span>
              </td>
              <td dir="auto">{row.name_he}</td>
              <td dir="auto">{row.name_en}</td>
              <td>
                <OverflowText
                  text={row.slug}
                  dir="ltr"
                  className={styles.slugValue}
                />
              </td>
              <td dir="auto">{categoryName(row.parent_id)}</td>
              <td>{row.product_count}</td>
              <td>
                <StatusBadge
                  status={row.is_active ? "active" : "archived"}
                  size="sm"
                >
                  {row.is_active
                    ? copy.statusActive[locale]
                    : copy.statusInactive[locale]}
                </StatusBadge>
              </td>
              <td>
                <span className={styles.sortCell}>
                  <span className={styles.sortValue}>
                    {categories.findIndex(
                      (category) => category.id === row.id,
                    ) + 1}
                  </span>
                  <button
                    type="button"
                    className="mgmt-icon-action"
                    disabled={reordering || categories[0]?.id === row.id}
                    title={copy.sortUp[locale]}
                    onClick={() => void moveSort(row, -1)}
                    aria-label={copy.sortUp[locale]}
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="mgmt-icon-action"
                    disabled={reordering || categories.at(-1)?.id === row.id}
                    title={copy.sortDown[locale]}
                    onClick={() => void moveSort(row, 1)}
                    aria-label={copy.sortDown[locale]}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </span>
              </td>
              <td>
                <span className={styles.actionsCell}>
                  <IconAction
                    label={copy.edit[locale]}
                    onClick={() => openEdit(row)}
                  >
                    <Pencil size={17} aria-hidden="true" />
                  </IconAction>
                  <ActivationSwitch
                    active={row.is_active}
                    label={`${row.is_active ? copy.statusActive[locale] : copy.statusInactive[locale]} · ${row.is_active ? copy.deactivate[locale] : copy.reactivate[locale]}`}
                    disabled={activating || deactivating}
                    onClick={() =>
                      row.is_active
                        ? setPendingDeactivate(row)
                        : void setActive(row, true)
                    }
                  />
                  <IconAction
                    label={
                      row.product_count === 0
                        ? copy.delete[locale]
                        : he
                          ? "יש להעביר את המוצרים המקושרים לפני המחיקה"
                          : "Reassign linked products before deleting"
                    }
                    tone="danger"
                    aria-disabled={row.product_count > 0}
                    onClick={() => {
                      if (row.product_count > 0) return;
                      setPendingDelete(row);
                      setDeleteConfirmText("");
                    }}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </IconAction>
                </span>
              </td>
            </tr>
          );
        })}
      </DataTable>

      {/* Create / edit dialog */}
      <Dialog
        open={dialogOpen}
        onClose={requestCloseDialog}
        title={
          editing
            ? copy.dialogEditTitle[locale]
            : copy.dialogCreateTitle[locale]
        }
        description={copy.dialogDescription[locale]}
        size="lg"
        closeLabel={copy.closeDialog[locale]}
        footer={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={requestCloseDialog}
              disabled={saving}
            >
              {copy.actionCancel[locale]}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--primary"
              onClick={() => void saveCategory()}
              disabled={saving}
              aria-busy={saving || undefined}
            >
              {saving ? copy.actionSaving[locale] : copy.actionSave[locale]}
            </button>
          </>
        }
      >
        <div className={styles.dialogForm}>
          {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
          <div className={styles.fieldGrid}>
            <FormField
              id="category-slug"
              label={copy.fieldSlug[locale]}
              required
              error={fieldErrors.slug}
              description={copy.fieldSlugHint[locale]}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={form.slug}
                  maxLength={100}
                  onChange={(e) => setField("slug", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="category-name-he"
              label={copy.fieldNameHe[locale]}
              required
              error={fieldErrors.name_he}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="auto"
                  value={form.name_he}
                  maxLength={255}
                  onChange={(e) => setField("name_he", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="category-name-en"
              label={copy.fieldNameEn[locale]}
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
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="category-description-he"
              label={copy.fieldDescriptionHe[locale]}
            >
              {(control) => (
                <textarea
                  {...control}
                  className="miro-input"
                  dir="auto"
                  rows={3}
                  value={form.description_he}
                  onChange={(e) => setField("description_he", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField
              id="category-description-en"
              label={copy.fieldDescriptionEn[locale]}
            >
              {(control) => (
                <textarea
                  {...control}
                  className="miro-input"
                  dir="ltr"
                  rows={3}
                  value={form.description_en}
                  onChange={(e) => setField("description_en", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <FormField id="category-parent" label={copy.fieldParent[locale]}>
              {(control) => (
                <select
                  {...control}
                  className="miro-input"
                  value={form.parent_id}
                  onChange={(e) => setField("parent_id", e.target.value)}
                  disabled={saving}
                >
                  <option value="">{copy.noParent[locale]}</option>
                  {categories
                    .filter((c) => !blockedParents.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {he ? c.name_he : c.name_en}
                      </option>
                    ))}
                </select>
              )}
            </FormField>
            <FormField
              id="category-sort-order"
              label={copy.fieldSortOrder[locale]}
              error={fieldErrors.sort_order}
            >
              {(control) => (
                <input
                  {...control}
                  type="number"
                  step={1}
                  className="miro-input"
                  dir="ltr"
                  value={form.sort_order}
                  onChange={(e) => setField("sort_order", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
          </div>

          <FormField
            id="category-icon"
            label={copy.fieldIcon[locale]}
            description={copy.fieldIconHint[locale]}
            error={iconUploadError}
          >
            {(control) => (
              <div className={styles.iconUploadActions}>
                {/* Current icon preview */}
                <div className={styles.iconPreviewWrapper} aria-hidden="true">
                  {form.image_url.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.image_url}
                      alt={copy.iconPreviewAlt[locale]}
                      className={styles.iconPreview}
                    />
                  ) : (
                    <span className={styles.noIcon}>{copy.noIcon[locale]}</span>
                  )}
                </div>

                {/* Upload button */}
                <input
                  type="file"
                  id="category-icon-upload"
                  className={styles.iconUploadInput}
                  accept="image/svg+xml,image/png,image/webp,image/jpeg,image/avif"
                  onChange={handleFileSelect}
                  disabled={saving || uploadingIcon}
                  aria-describedby="category-icon-upload-hint"
                />
                <label
                  htmlFor="category-icon-upload"
                  className={styles.iconUploadLabel}
                  aria-disabled={saving || uploadingIcon}
                >
                  <Upload size={14} aria-hidden="true" />
                  {uploadingIcon
                    ? copy.uploading[locale]
                    : copy.uploadIcon[locale]}
                </label>

                {/* Remove icon button */}
                {form.image_url.trim() && (
                  <button
                    type="button"
                    className={styles.removeIconButton}
                    onClick={handleIconRemove}
                    disabled={saving || uploadingIcon}
                  >
                    <X size={14} aria-hidden="true" />
                    {copy.removeIcon[locale]}
                  </button>
                )}

                {/* Upload progress */}
                {uploadingIcon && iconUploadProgress > 0 && (
                  <div
                    className={styles.uploadProgress}
                    role="progressbar"
                    aria-valuenow={iconUploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={copy.uploading[locale]}
                  >
                    <div className={styles.uploadProgressBar}>
                      <div
                        className={styles.uploadProgressFill}
                        style={{ width: `${iconUploadProgress}%` }}
                      />
                    </div>
                    <span>{iconUploadProgress}%</span>
                  </div>
                )}

                {/* Hidden input to sync with form state */}
                <input
                  {...control}
                  type="hidden"
                  value={form.image_url}
                  onChange={(e) => setField("image_url", e.target.value)}
                />
              </div>
            )}
          </FormField>

          {/* External URL field */}
          <FormField
            id="category-image-url"
            label={copy.fieldImageUrl[locale]}
            error={fieldErrors.image_url}
            description={copy.fieldImageUrlHint[locale]}
          >
            {(control) => (
              <input
                {...control}
                type="url"
                className="miro-input"
                dir="ltr"
                value={form.image_url}
                maxLength={2000}
                onChange={(e) => setField("image_url", e.target.value)}
                disabled={saving}
              />
            )}
          </FormField>

          <label className={styles.checkboxRow} htmlFor="category-is-active">
            <input
              id="category-is-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField("is_active", e.target.checked)}
              disabled={saving}
            />
            {copy.fieldIsActive[locale]}
          </label>
        </div>
      </Dialog>

      {/* Deactivate confirmation with the publication-invariant warning */}
      <ConfirmationDialog
        open={pendingDeactivate !== null}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setPendingDeactivate(null)}
        title={copy.deactivateTitle[locale]}
        description={copy.deactivateWarning[locale]}
        confirmLabel={copy.deactivateConfirm[locale]}
        cancelLabel={copy.actionCancel[locale]}
        tone="danger"
        busy={deactivating}
        closeLabel={copy.closeDialog[locale]}
      />

      {/* Hard delete behind type-to-confirm; only reachable for zero products */}
      <Dialog
        open={pendingDelete !== null}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title={copy.deleteTitle[locale]}
        description={copy.deleteWarning[locale]}
        size="sm"
        closeLabel={copy.closeDialog[locale]}
        footer={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {copy.actionCancel[locale]}
            </button>
            <button
              type="button"
              className="mgmt-button mgmt-button--danger"
              onClick={() => void confirmDelete()}
              disabled={
                deleting || deleteConfirmText.trim().toUpperCase() !== "DELETE"
              }
              aria-busy={deleting || undefined}
            >
              {copy.delete[locale]}
            </button>
          </>
        }
      >
        <input
          type="text"
          className="miro-input"
          dir="ltr"
          value={deleteConfirmText}
          placeholder={copy.deleteConfirmPlaceholder[locale]}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          aria-label={copy.deleteConfirmPlaceholder[locale]}
          autoFocus
          disabled={deleting}
        />
      </Dialog>

      {/* Dirty-close guard */}
      <ConfirmationDialog
        open={dirtyConfirmOpen}
        onConfirm={() => {
          setDirtyConfirmOpen(false);
          setDialogOpen(false);
        }}
        onCancel={() => setDirtyConfirmOpen(false)}
        title={copy.dirtyConfirmTitle[locale]}
        description={copy.dirtyConfirmBody[locale]}
        confirmLabel={copy.dirtyConfirmLeave[locale]}
        cancelLabel={copy.dirtyConfirmStay[locale]}
        closeLabel={copy.closeDialog[locale]}
      />
    </div>
  );
}
