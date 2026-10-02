"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Pencil, Trash2, Wrench } from "lucide-react";
import {
  ActivationSwitch,
  OverflowText,
  IconAction,
  ConfirmationDialog,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FormField,
  FormSection,
  TableSkeleton,
  Notice,
  PageHeader,
  StatusBadge,
  Toolbar,
} from "../ui";
import {
  VisualPicker,
  isVisualKind,
  visualKindIcons,
  type VisualKind,
} from "../visual-picker";
import { servicesCopy as copy } from "./copy";
import { buildOrderUpdates } from "@/lib/management-ordering";
import { CollectionSummary } from "../ui/collection-summary";
import { ReportChoices } from "../ui/reporting-workspace";
import styles from "./services-manager.module.css";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type FeatureItem = { text_he: string; text_en: string };
type StepItem = {
  title_he: string;
  text_he: string;
  title_en: string;
  text_en: string;
};
type FaqItem = {
  question_he: string;
  answer_he: string;
  question_en: string;
  answer_en: string;
};

type ServiceContent = {
  features?: FeatureItem[];
  process_steps?: StepItem[];
  faq?: FaqItem[];
};

type ServiceRow = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  short_description_he: string | null;
  short_description_en: string | null;
  description_he: string | null;
  description_en: string | null;
  visual_kind: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  seo_title_he: string | null;
  seo_title_en: string | null;
  seo_description_he: string | null;
  seo_description_en: string | null;
  content: ServiceContent;
};

type ServiceForm = {
  slug: string;
  name_he: string;
  name_en: string;
  short_description_he: string;
  short_description_en: string;
  description_he: string;
  description_en: string;
  visual_kind: VisualKind;
  image_url: string;
  sort_order: string;
  is_active: boolean;
  seo_title_he: string;
  seo_title_en: string;
  seo_description_he: string;
  seo_description_en: string;
  features: FeatureItem[];
  process_steps: StepItem[];
  faq: FaqItem[];
};

const emptyForm: ServiceForm = {
  slug: "",
  name_he: "",
  name_en: "",
  short_description_he: "",
  short_description_en: "",
  description_he: "",
  description_en: "",
  visual_kind: "generic_security",
  image_url: "",
  sort_order: "0",
  is_active: true,
  seo_title_he: "",
  seo_title_en: "",
  seo_description_he: "",
  seo_description_en: "",
  features: [],
  process_steps: [],
  faq: [],
};

function asPairs(
  value: unknown,
  keys: readonly string[],
): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => {
      const out: Record<string, string> = {};
      for (const key of keys) {
        out[key] = typeof item[key] === "string" ? (item[key] as string) : "";
      }
      return out;
    });
}

function toForm(row: ServiceRow): ServiceForm {
  return {
    slug: row.slug,
    name_he: row.name_he,
    name_en: row.name_en,
    short_description_he: row.short_description_he ?? "",
    short_description_en: row.short_description_en ?? "",
    description_he: row.description_he ?? "",
    description_en: row.description_en ?? "",
    visual_kind: isVisualKind(row.visual_kind)
      ? row.visual_kind
      : "generic_security",
    image_url: row.image_url ?? "",
    sort_order: String(row.sort_order ?? 0),
    is_active: row.is_active,
    seo_title_he: row.seo_title_he ?? "",
    seo_title_en: row.seo_title_en ?? "",
    seo_description_he: row.seo_description_he ?? "",
    seo_description_en: row.seo_description_en ?? "",
    features: asPairs(row.content?.features, ["text_he", "text_en"]).map(
      (p) => ({ text_he: p.text_he, text_en: p.text_en }),
    ),
    process_steps: asPairs(row.content?.process_steps, [
      "title_he",
      "text_he",
      "title_en",
      "text_en",
    ]).map((p) => ({
      title_he: p.title_he,
      text_he: p.text_he,
      title_en: p.title_en,
      text_en: p.text_en,
    })),
    faq: asPairs(row.content?.faq, [
      "question_he",
      "answer_he",
      "question_en",
      "answer_en",
    ]).map((p) => ({
      question_he: p.question_he,
      answer_he: p.answer_he,
      question_en: p.question_en,
      answer_en: p.answer_en,
    })),
  };
}

/* ---------- Generic bilingual pair list editor ---------- */

type PairField = {
  key: string;
  label: Record<"he" | "en", string>;
  textarea?: boolean;
};

function PairListEditor<T extends Record<string, string>>({
  title,
  items,
  fields,
  onChange,
  idPrefix,
  locale,
  disabled,
  copyKeys,
}: {
  title: string;
  items: T[];
  fields: PairField[];
  onChange: (next: T[]) => void;
  idPrefix: string;
  locale: "he" | "en";
  disabled: boolean;
  copyKeys: {
    addItem: Record<"he" | "en", string>;
    removeItem: Record<"he" | "en", string>;
    moveUp: Record<"he" | "en", string>;
    moveDown: Record<"he" | "en", string>;
    itemLabel: Record<"he" | "en", string>;
  };
}) {
  const empty = () => Object.fromEntries(fields.map((f) => [f.key, ""])) as T;
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  return (
    <div>
      <div className={styles.listItemHeader}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          className={`miro-button miro-button-secondary ${styles.addItemButton}`}
          onClick={() => onChange([...items, empty()])}
          disabled={disabled}
        >
          <Plus size={14} aria-hidden="true" />
          {copyKeys.addItem[locale]}
        </button>
      </div>
      <div className={styles.listBlock}>
        {items.map((item, index) => (
          <div key={index} className={styles.listItem}>
            <div className={styles.listItemHeader}>
              <span className={styles.listItemTitle}>
                {copyKeys.itemLabel[locale]} {index + 1}
              </span>
              <span className={styles.listItemActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  aria-label={copyKeys.moveUp[locale]}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === items.length - 1}
                  aria-label={copyKeys.moveDown[locale]}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  disabled={disabled}
                  aria-label={copyKeys.removeItem[locale]}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </span>
            </div>
            <div className={styles.fieldGrid}>
              {fields.map((f) => (
                <FormField
                  key={f.key}
                  id={`${idPrefix}-${index}-${f.key}`}
                  label={f.label[locale]}
                >
                  {(control) =>
                    f.textarea ? (
                      <textarea
                        {...control}
                        className="miro-input"
                        rows={2}
                        dir={f.key.endsWith("_he") ? "auto" : "ltr"}
                        value={item[f.key]}
                        onChange={(e) => {
                          const next = [...items];
                          next[index] = { ...item, [f.key]: e.target.value };
                          onChange(next);
                        }}
                        disabled={disabled}
                      />
                    ) : (
                      <input
                        {...control}
                        type="text"
                        className="miro-input"
                        dir={f.key.endsWith("_he") ? "auto" : "ltr"}
                        value={item[f.key]}
                        onChange={(e) => {
                          const next = [...items];
                          next[index] = { ...item, [f.key]: e.target.value };
                          onChange(next);
                        }}
                        disabled={disabled}
                      />
                    )
                  }
                </FormField>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Services manager ---------- */

export function ServicesManager({ locale }: { locale: "he" | "en" }) {
  const he = locale === "he";
  const [services, setServices] = useState<ServiceRow[]>([]);
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
  const [toggling, setToggling] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ServiceForm, string>>
  >({});
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = useState(false);
  const [initialForm, setInitialForm] = useState<ServiceForm>(emptyForm);
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
      const response = await fetch("/api/management/services", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "load_failed");
      setServices(data.services ?? []);
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
    return services.filter(
      (s) =>
        (visibility === "all" || s.is_active === (visibility === "active")) &&
        (!needle ||
          [s.name_he, s.name_en, s.slug].some((value) =>
            value.toLowerCase().includes(needle),
          )),
    );
  }, [services, search, visibility]);

  function setField<K extends keyof ServiceForm>(
    key: K,
    value: ServiceForm[K],
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

  function openEdit(row: ServiceRow) {
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

  async function saveService() {
    if (saving) return;
    const errors: Partial<Record<keyof ServiceForm, string>> = {};
    if (!form.name_he.trim() || !form.name_en.trim()) {
      errors.name_he = copy.errorNameRequired[locale];
    }
    if (!SLUG_PATTERN.test(form.slug.trim())) {
      errors.slug = copy.errorSlug[locale];
    }
    const imageUrl = form.image_url.trim();
    if (imageUrl && !/^(https?:\/\/|products\/)/i.test(imageUrl)) {
      errors.image_url = copy.errorImageUrl[locale];
    }
    const sortOrder = Number.parseInt(form.sort_order, 10);
    if (form.sort_order.trim() === "" || !Number.isFinite(sortOrder)) {
      errors.sort_order = copy.errorSortOrder[locale];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const content: ServiceContent = {};
    const features = form.features.filter(
      (f) => f.text_he.trim() || f.text_en.trim(),
    );
    const steps = form.process_steps.filter(
      (s) =>
        s.title_he.trim() ||
        s.text_he.trim() ||
        s.title_en.trim() ||
        s.text_en.trim(),
    );
    const faq = form.faq.filter(
      (f) =>
        f.question_he.trim() ||
        f.answer_he.trim() ||
        f.question_en.trim() ||
        f.answer_en.trim(),
    );
    if (features.length > 0) content.features = features;
    if (steps.length > 0) content.process_steps = steps;
    if (faq.length > 0) content.faq = faq;

    setSaving(true);
    setDialogError("");
    try {
      const payload: Record<string, unknown> = {
        slug: form.slug.trim(),
        name_he: form.name_he.trim(),
        name_en: form.name_en.trim(),
        short_description_he: form.short_description_he.trim() || null,
        short_description_en: form.short_description_en.trim() || null,
        description_he: form.description_he.trim() || null,
        description_en: form.description_en.trim() || null,
        visual_kind: form.visual_kind,
        image_url: imageUrl || null,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        is_active: form.is_active,
        seo_title_he: form.seo_title_he.trim() || null,
        seo_title_en: form.seo_title_en.trim() || null,
        seo_description_he: form.seo_description_he.trim() || null,
        seo_description_en: form.seo_description_en.trim() || null,
        content,
      };
      const response = await fetch("/api/management/services", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing ? { id: editing.id, ...payload } : payload,
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "duplicate_slug") {
          setDialogError(copy.duplicateSlug[locale]);
        } else if (typeof data.error === "string" && data.error) {
          setDialogError(data.error);
        } else {
          setDialogError(copy.saveFailed[locale]);
        }
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

  async function toggleActive(row: ServiceRow) {
    if (toggling) return;
    setToggling(true);
    try {
      const response = await fetch(
        row.is_active
          ? `/api/management/services?id=${row.id}`
          : "/api/management/services",
        row.is_active
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: row.id, is_active: true }),
            },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showNotice("success", copy.statusChanged[locale]);
      await load();
    } catch {
      showNotice("danger", copy.saveFailed[locale]);
    } finally {
      setToggling(false);
    }
  }

  async function moveSort(row: ServiceRow, delta: number) {
    if (reorderLock.current) return;
    const updates = buildOrderUpdates(services, row.id, delta);
    if (!updates.length) return;
    reorderLock.current = true;
    setReordering(true);
    try {
      for (const update of updates) {
        const response = await fetch("/api/management/services", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        if (!response.ok) throw new Error("reorder_failed");
      }
      await load();
      showNotice("success", copy.sorted[locale]);
    } catch {
      showNotice("danger", copy.saveFailed[locale]);
      await load();
    } finally {
      reorderLock.current = false;
      setReordering(false);
    }
  }

  const pairEditorKeys = {
    addItem: copy.addItem,
    removeItem: copy.removeItem,
    moveUp: copy.moveUp,
    moveDown: copy.moveDown,
    itemLabel: copy.itemLabel,
  };

  if (loadState === "loading") {
    return (
      <div className={styles.stack}>
        <PageHeader
          title={copy.pageTitle[locale]}
          subtitle={copy.pageSubtitle[locale]}
        />
        <TableSkeleton
          columnWidths={["7%", "17%", "17%", "20%", "17%", "10%", "12%"]}
          columns={[
            copy.colVisual[locale],
            copy.colNameHe[locale],
            copy.colNameEn[locale],
            copy.colSlug[locale],
            copy.colSort[locale],
            copy.colStatus[locale],
            copy.colActions[locale],
          ]}
          rows={6}
          leadingImage
          minWidth="70rem"
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
          description={
            locale === "he"
              ? "לא ניתן לגשת לנתוני הניהול. נסו שוב; אם השגיאה נמשכת, פנו למנהל הפרויקט לבדיקת החיבור וההרשאות."
              : "Management data could not be accessed. Retry; if the error continues, contact the project administrator to check the connection and permissions."
          }
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
            {copy.addService[locale]}
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
            value: services.length,
          },
          {
            label: he ? "מפורסמים" : "Active",
            value: services.filter((row) => row.is_active).length,
          },
          {
            label: he ? "לא פעילים" : "Inactive",
            value: services.filter((row) => !row.is_active).length,
          },
          {
            label: he ? "ללא תמונה" : "Without an image",
            value: services.filter((row) => !row.image_url).length,
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
        columnWidths={["7%", "17%", "17%", "20%", "17%", "10%", "12%"]}
        tableClassName="mgmt-services-table"
        caption={copy.tableCaption[locale]}
        isEmpty={visible.length === 0}
        emptyState={
          <EmptyState
            icon={<Wrench size={20} />}
            title={copy.emptyTitle[locale]}
            description={copy.emptyDescription[locale]}
            action={
              <button
                type="button"
                className="miro-button miro-button-primary"
                onClick={openCreate}
              >
                <Plus size={16} aria-hidden="true" />
                {copy.addService[locale]}
              </button>
            }
            compact
          />
        }
        minWidth="68rem"
        head={
          <tr>
            <th scope="col">{copy.colVisual[locale]}</th>
            <th scope="col">{copy.colNameHe[locale]}</th>
            <th scope="col">{copy.colNameEn[locale]}</th>
            <th scope="col">{copy.colSlug[locale]}</th>
            <th scope="col">{copy.colSort[locale]}</th>
            <th scope="col">{copy.colStatus[locale]}</th>
            <th scope="col">{copy.colActions[locale]}</th>
          </tr>
        }
      >
        {visible.map((row) => {
          const kind: VisualKind = isVisualKind(row.visual_kind)
            ? row.visual_kind
            : "generic_security";
          const Icon = visualKindIcons[kind];
          const showThumb =
            (kind === "uploaded_image" || kind === "uploaded_svg") &&
            !!row.image_url;
          return (
            <tr key={row.id}>
              <td>
                <span className={styles.visualCell} aria-hidden="true">
                  {showThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.image_url ?? ""}
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
              <td>
                <span className={styles.sortCell}>
                  <span className={styles.sortValue}>
                    {services.findIndex((service) => service.id === row.id) + 1}
                  </span>
                  <button
                    type="button"
                    className="mgmt-icon-action"
                    disabled={reordering || services[0]?.id === row.id}
                    title={copy.sortUp[locale]}
                    onClick={() => void moveSort(row, -1)}
                    aria-label={copy.sortUp[locale]}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="mgmt-icon-action"
                    disabled={reordering || services.at(-1)?.id === row.id}
                    title={copy.sortDown[locale]}
                    onClick={() => void moveSort(row, 1)}
                    aria-label={copy.sortDown[locale]}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </span>
              </td>
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
                <span className={styles.actionsCell}>
                  <IconAction
                    label={copy.edit[locale]}
                    onClick={() => openEdit(row)}
                  >
                    <Pencil size={17} aria-hidden="true" />
                  </IconAction>
                  <ActivationSwitch
                    active={row.is_active}
                    disabled={toggling}
                    label={`${row.is_active ? copy.statusActive[locale] : copy.statusInactive[locale]} · ${row.is_active ? copy.deactivate[locale] : copy.reactivate[locale]}`}
                    onClick={() => void toggleActive(row)}
                  />
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
              onClick={() => void saveService()}
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

          <FormSection title={copy.sectionBasics[locale]}>
            <div className={styles.fieldGrid}>
              <FormField
                id="service-slug"
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
                id="service-name-he"
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
                id="service-name-en"
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
                id="service-sort-order"
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
            <VisualPicker
              id="service-visual-kind"
              legend={copy.fieldVisual[locale]}
              description={copy.fieldVisualHint[locale]}
              locale={locale}
              value={form.visual_kind}
              onChange={(kind) => setField("visual_kind", kind)}
              imageUrl={form.image_url.trim() || undefined}
              disabled={saving}
            />
            <FormField
              id="service-image-url"
              label={copy.fieldImageUrl[locale]}
              error={fieldErrors.image_url}
              description={copy.fieldImageUrlHint[locale]}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  className="miro-input"
                  dir="ltr"
                  value={form.image_url}
                  maxLength={2000}
                  onChange={(e) => setField("image_url", e.target.value)}
                  disabled={saving}
                />
              )}
            </FormField>
            <label className={styles.checkboxRow} htmlFor="service-is-active">
              <input
                id="service-is-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
                disabled={saving}
              />
              {copy.fieldIsActive[locale]}
            </label>
          </FormSection>

          <FormSection title={copy.sectionContent[locale]}>
            <div className={styles.fieldGrid}>
              <FormField
                id="service-short-he"
                label={copy.fieldShortHe[locale]}
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="miro-input"
                    dir="auto"
                    rows={2}
                    value={form.short_description_he}
                    maxLength={1000}
                    onChange={(e) =>
                      setField("short_description_he", e.target.value)
                    }
                    disabled={saving}
                  />
                )}
              </FormField>
              <FormField
                id="service-short-en"
                label={copy.fieldShortEn[locale]}
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="miro-input"
                    dir="ltr"
                    rows={2}
                    value={form.short_description_en}
                    maxLength={1000}
                    onChange={(e) =>
                      setField("short_description_en", e.target.value)
                    }
                    disabled={saving}
                  />
                )}
              </FormField>
              <FormField id="service-full-he" label={copy.fieldFullHe[locale]}>
                {(control) => (
                  <textarea
                    {...control}
                    className="miro-input"
                    dir="auto"
                    rows={4}
                    value={form.description_he}
                    maxLength={20000}
                    onChange={(e) => setField("description_he", e.target.value)}
                    disabled={saving}
                  />
                )}
              </FormField>
              <FormField id="service-full-en" label={copy.fieldFullEn[locale]}>
                {(control) => (
                  <textarea
                    {...control}
                    className="miro-input"
                    dir="ltr"
                    rows={4}
                    value={form.description_en}
                    maxLength={20000}
                    onChange={(e) => setField("description_en", e.target.value)}
                    disabled={saving}
                  />
                )}
              </FormField>
            </div>
          </FormSection>

          <FormSection title={copy.sectionStructured[locale]}>
            <PairListEditor
              title={copy.featuresTitle[locale]}
              items={form.features}
              fields={[
                { key: "text_he", label: copy.featureTextHe, textarea: true },
                { key: "text_en", label: copy.featureTextEn, textarea: true },
              ]}
              onChange={(next) => setField("features", next)}
              idPrefix="service-feature"
              locale={locale}
              disabled={saving}
              copyKeys={pairEditorKeys}
            />
            <PairListEditor
              title={copy.stepsTitle[locale]}
              items={form.process_steps}
              fields={[
                { key: "title_he", label: copy.stepTitleHe },
                { key: "text_he", label: copy.stepTextHe, textarea: true },
                { key: "title_en", label: copy.stepTitleEn },
                { key: "text_en", label: copy.stepTextEn, textarea: true },
              ]}
              onChange={(next) => setField("process_steps", next)}
              idPrefix="service-step"
              locale={locale}
              disabled={saving}
              copyKeys={pairEditorKeys}
            />
            <PairListEditor
              title={copy.faqTitle[locale]}
              items={form.faq}
              fields={[
                { key: "question_he", label: copy.faqQuestionHe },
                { key: "answer_he", label: copy.faqAnswerHe, textarea: true },
                { key: "question_en", label: copy.faqQuestionEn },
                { key: "answer_en", label: copy.faqAnswerEn, textarea: true },
              ]}
              onChange={(next) => setField("faq", next)}
              idPrefix="service-faq"
              locale={locale}
              disabled={saving}
              copyKeys={pairEditorKeys}
            />
          </FormSection>

          <FormSection title={copy.sectionSeo[locale]}>
            <div className={styles.fieldGrid}>
              <FormField
                id="service-seo-title-he"
                label={copy.fieldSeoTitleHe[locale]}
              >
                {(control) => (
                  <input
                    {...control}
                    type="text"
                    className="miro-input"
                    dir="auto"
                    value={form.seo_title_he}
                    maxLength={255}
                    onChange={(e) => setField("seo_title_he", e.target.value)}
                    disabled={saving}
                  />
                )}
              </FormField>
              <FormField
                id="service-seo-title-en"
                label={copy.fieldSeoTitleEn[locale]}
              >
                {(control) => (
                  <input
                    {...control}
                    type="text"
                    className="miro-input"
                    dir="ltr"
                    value={form.seo_title_en}
                    maxLength={255}
                    onChange={(e) => setField("seo_title_en", e.target.value)}
                    disabled={saving}
                  />
                )}
              </FormField>
              <FormField
                id="service-seo-desc-he"
                label={copy.fieldSeoDescHe[locale]}
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="miro-input"
                    dir="auto"
                    rows={2}
                    value={form.seo_description_he}
                    maxLength={1000}
                    onChange={(e) =>
                      setField("seo_description_he", e.target.value)
                    }
                    disabled={saving}
                  />
                )}
              </FormField>
              <FormField
                id="service-seo-desc-en"
                label={copy.fieldSeoDescEn[locale]}
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="miro-input"
                    dir="ltr"
                    rows={2}
                    value={form.seo_description_en}
                    maxLength={1000}
                    onChange={(e) =>
                      setField("seo_description_en", e.target.value)
                    }
                    disabled={saving}
                  />
                )}
              </FormField>
            </div>
          </FormSection>
        </div>
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
