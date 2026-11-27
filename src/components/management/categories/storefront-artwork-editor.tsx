"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ImageIcon, Pencil, RotateCcw } from "lucide-react";
import Image from "next/image";
import { z } from "zod";
import { getStoreCategoryArtwork } from "@/features/catalog/store-category-artwork";
import {
  createCategoryArtworkIconUrl,
  MAX_CATEGORY_ARTWORK_PHOTO_BYTES,
  MAX_CATEGORY_ARTWORK_SVG_BYTES,
} from "@/lib/catalog/storefront-category-artwork";
import type { Locale } from "@/lib/i18n";
import {
  ConfirmationDialog,
  Dialog,
  FormField,
  FormSection,
  Notice,
} from "../ui";
import { categoriesCopy } from "./copy";
import styles from "./storefront-artwork-editor.module.css";

const endpoint = "/api/management/categories/storefront-artwork";
const photoTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const artworkSchema = z.object({
  revision: z.string().nullable(),
  svgSource: z.string().nullable(),
  imageUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
});
const responseSchema = z.object({ artwork: artworkSchema });
type Artwork = z.infer<typeof artworkSchema>;

type Category = {
  id: string;
  slug: string;
  parent_id: string | null;
  is_active: boolean;
  name_he: string;
  name_en: string;
};

type PhotoDraft =
  | { action: "keep" | "remove" }
  | { action: "upload"; file: File; preview: string };

export function StorefrontCategoryArtwork({
  categories,
  loadState,
  locale,
  onEditNames,
}: {
  categories: Category[];
  loadState: "loading" | "ready" | "error";
  locale: Locale;
  onEditNames: (categoryId: string) => void;
}) {
  const he = locale === "he";
  const [categoryId, setCategoryId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const roots = categories.filter((category) => !category.parent_id);
  const selected = roots.find((category) => category.id === categoryId);
  const nameKey = he ? "name_he" : "name_en";

  return (
    <FormSection
      sectionId="store-category-grid"
      title={he ? "עיצוב רשת הקטגוריות בחנות" : "Store category grid artwork"}
      icon={<ImageIcon size={20} />}
      description={
        he
          ? "בחרו קטגוריה ראשית לעריכת השמות המשותפים בחנות או לשינוי התמונה ואיור ה־SVG ברשת שמתחת לסרגל הניווט."
          : "Choose a main category to edit its shared storefront names or change its photo and SVG illustration in the grid beneath the navbar."
      }
    >
      <div className={styles.picker}>
        <FormField
          label={categoriesCopy.mainCategory[locale]}
          disabled={!roots.length}
        >
          {(control) => (
            <select
              {...control}
              className="miro-input"
              value={selected?.id ?? ""}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="" disabled>
                {loadState === "loading"
                  ? he
                    ? "טוען קטגוריות…"
                    : "Loading categories…"
                  : loadState === "error"
                    ? categoriesCopy.loadErrorTitle[locale]
                    : roots.length
                      ? he
                        ? "בחירת קטגוריה ראשית"
                        : "Select a main category"
                      : categoriesCopy.emptyTitle[locale]}
              </option>
              {roots.map((category) => (
                <option key={category.id} value={category.id}>
                  {category[nameKey]}
                  {!category.is_active && (he ? " (לא פעילה)" : " (inactive)")}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <div className={styles.actions}>
          <button
            type="button"
            className="mgmt-button mgmt-button--ghost"
            disabled={!selected}
            onClick={() => selected && onEditNames(selected.id)}
          >
            <Pencil size={16} aria-hidden="true" />
            {he ? "עריכת השמות המשותפים" : "Edit shared names"}
          </button>
          <button
            type="button"
            className="mgmt-button mgmt-button--primary"
            disabled={!selected}
            onClick={() => setEditorOpen(true)}
          >
            <ImageIcon size={16} aria-hidden="true" />
            {he ? "עריכת תמונה ו־SVG" : "Edit photo and SVG"}
          </button>
        </div>
      </div>
      {editorOpen && selected ? (
        <ArtworkDialog
          key={selected.id}
          category={selected}
          categoryName={selected[nameKey]}
          locale={locale}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </FormSection>
  );
}

function ArtworkDialog({
  category,
  categoryName,
  locale,
  onClose,
}: {
  category: Category;
  categoryName: string;
  locale: Locale;
  onClose: () => void;
}) {
  const he = locale === "he";
  const formId = useId();
  const [saved, setSaved] = useState<Artwork | null>(null);
  const [svg, setSvg] = useState("");
  const [photo, setPhoto] = useState<PhotoDraft>({ action: "keep" });
  const [photoError, setPhotoError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [discard, setDiscard] = useState<"close" | "reload" | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);
  const saveLock = useRef(false);
  const localPhoto = photo.action === "upload" ? photo.preview : null;
  const displayedPhoto = photo.action === "keep" ? saved?.imageUrl : localPhoto;
  const iconUrl = useMemo(() => createCategoryArtworkIconUrl(svg), [svg]);
  const invalidSvg = Boolean(svg.trim()) && !iconUrl;
  const dirty = Boolean(
    saved && (svg !== (saved.svgSource ?? "") || photo.action !== "keep"),
  );

  useEffect(() => {
    const controller = new AbortController();
    const url = new URLSearchParams({ id: category.id });
    void fetch(`${endpoint}?${url}`, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("artwork_unavailable");
        return responseSchema.parse(await response.json()).artwork;
      })
      .then((artwork) => {
        if (controller.signal.aborted) return;
        setSaved(artwork);
        setSvg(artwork.svgSource ?? "");
        setPhoto({ action: "keep" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [attempt, category.id]);

  useEffect(() => {
    if (localPhoto) return () => URL.revokeObjectURL(localPhoto);
  }, [localPhoto]);

  function reload() {
    setSaved(null);
    setLoadFailed(false);
    setNeedsReload(false);
    setMessage(null);
    setPhotoError("");
    setAttempt((current) => current + 1);
  }

  function requestClose() {
    if (saveLock.current) return;
    if (dirty) setDiscard("close");
    else onClose();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved || !dirty || invalidSvg || saveLock.current || needsReload)
      return;

    const body = new FormData();
    body.set("category_id", category.id);
    body.set("revision", saved.revision ?? "");
    body.set("svg", svg);
    body.set("photo_action", photo.action);
    if (photo.action === "upload") body.set("file", photo.file);

    saveLock.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        body,
        signal: AbortSignal.timeout(45_000),
      });
      if (response.status === 409) {
        setNeedsReload(true);
        setMessage({
          tone: "danger",
          text: he
            ? "העיצוב השמור השתנה. טענו את הגרסה העדכנית לפני שמירה."
            : "The saved artwork changed. Load the latest version before saving.",
        });
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        const text =
          response.status === 429
            ? he
              ? "המתינו דקה ונסו שוב."
              : "Wait one minute and try again."
            : response.status === 403 || response.status === 401
              ? he
                ? "שמירה זמינה בחשבון מנכ״ל פעיל."
                : "Saving requires an active CEO account."
              : response.status === 404
                ? he
                  ? "הקטגוריה הראשית אינה זמינה עוד."
                  : "This main category is no longer available."
                : he
                  ? "בדקו את סוג הקובץ, גודל התמונה וקוד ה־SVG לפי ההנחיות ונסו שוב."
                  : "Check the file type, photo size, and SVG code against the artwork guidelines.";
        setMessage({ tone: "danger", text });
        return;
      }
      if (!response.ok) throw new Error("artwork_save_unconfirmed");
      const { artwork } = responseSchema.parse(await response.json());
      setSaved(artwork);
      setSvg(artwork.svgSource ?? "");
      setPhoto({ action: "keep" });
      setPhotoError("");
      setMessage({
        tone: "success",
        text: category.is_active
          ? he
            ? "העיצוב פורסם ברשת הקטגוריות בחנות."
            : "Artwork published to the store category grid."
          : he
            ? "העיצוב נשמר ויופיע כשהקטגוריה תהיה פעילה."
            : "Artwork saved. It will appear when this category is active.",
      });
    } catch {
      setNeedsReload(true);
      setMessage({
        tone: "danger",
        text: he
          ? "השמירה לא אומתה. טענו את העיצוב השמור כדי לבדוק מה פורסם."
          : "The save could not be confirmed. Load the saved artwork to check what was published.",
      });
    } finally {
      saveLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={requestClose}
        size="lg"
        className={styles.dialog}
        closeLabel={categoriesCopy.closeDialog[locale]}
        title={
          <>
            {he ? "עיצוב הקטגוריה" : "Category artwork"} ·{" "}
            <bdi>{categoryName}</bdi>
          </>
        }
        description={
          he
            ? "התמונה ממלאת את המסגרת. כשמגדירים גם SVG, האיור מופיע כסמל מעל התמונה."
            : "The photo fills the artwork frame. When you add an SVG as well, it appears as a badge on the photo."
        }
        footer={
          <>
            <button
              type="button"
              className="mgmt-button mgmt-button--ghost"
              onClick={requestClose}
              disabled={submitting}
            >
              {categoriesCopy.closeDialog[locale]}
            </button>
            <button
              type="submit"
              form={formId}
              className="mgmt-button mgmt-button--primary"
              disabled={!dirty || invalidSvg || submitting || needsReload}
              aria-busy={submitting || undefined}
            >
              {submitting
                ? categoriesCopy.actionSaving[locale]
                : he
                  ? "שמירה ופרסום בחנות"
                  : "Save and publish to Store"}
            </button>
          </>
        }
      >
        {!saved &&
          (loadFailed ? (
            <Notice
              tone="danger"
              action={
                <button
                  type="button"
                  className="mgmt-button mgmt-button--ghost"
                  onClick={reload}
                >
                  {categoriesCopy.retry[locale]}
                </button>
              }
            >
              {he
                ? "לא ניתן לטעון את העיצוב השמור."
                : "The saved artwork could not be loaded."}
            </Notice>
          ) : (
            <p role="status">
              {he ? "טוען את העיצוב השמור…" : "Loading saved artwork…"}
            </p>
          ))}
        {saved && (
          <form
            id={formId}
            onSubmit={(event) => void save(event)}
            className={styles.form}
          >
            {message && (
              <Notice
                tone={message.tone}
                action={
                  needsReload ? (
                    <button
                      type="button"
                      className="mgmt-button mgmt-button--ghost"
                      onClick={() => (dirty ? setDiscard("reload") : reload())}
                    >
                      {he ? "טעינת העיצוב השמור" : "Load saved artwork"}
                    </button>
                  ) : undefined
                }
              >
                {message.text}
              </Notice>
            )}
            <div className={styles.editor}>
              <div className={styles.fields}>
                <FormField
                  label={he ? "תמונת קטגוריה" : "Category photo"}
                  description={
                    he
                      ? "מומלצת תמונה בגודל 960 × 640 פיקסלים או יותר, ביחס 3:2, כשהציוד ממורכז. אפשר להעלות JPEG, PNG, WebP או AVIF עד 4MB."
                      : "Use a 960 × 640 px or larger photo at 3:2 with the equipment centered. Upload JPEG, PNG, WebP or AVIF up to 4 MB."
                  }
                  disabled={submitting}
                  error={photoError}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="file"
                      className="miro-input"
                      accept={photoTypes.join(",")}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (!file) return;
                        if (
                          file.size > MAX_CATEGORY_ARTWORK_PHOTO_BYTES ||
                          !photoTypes.includes(file.type)
                        ) {
                          setPhotoError(
                            he
                              ? "בחרו קובץ תמונה נתמך עד 4MB."
                              : "Choose a supported image file up to 4 MB.",
                          );
                          return;
                        }
                        setPhotoError("");
                        setPhoto({
                          action: "upload",
                          file,
                          preview: URL.createObjectURL(file),
                        });
                      }}
                    />
                  )}
                </FormField>
                {photo.action === "upload" && (
                  <small className={styles.fileName}>
                    <bdi>{photo.file.name}</bdi>
                  </small>
                )}
                {(displayedPhoto ||
                  (photo.action !== "keep" && saved.imageUrl)) && (
                  <div className={styles.actions}>
                    {displayedPhoto && (
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--ghost"
                        disabled={submitting}
                        onClick={() =>
                          setPhoto({
                            action: saved.imageUrl ? "remove" : "keep",
                          })
                        }
                      >
                        {he ? "הסרת תמונה" : "Remove photo"}
                      </button>
                    )}
                    {photo.action !== "keep" && saved.imageUrl && (
                      <button
                        type="button"
                        className="mgmt-button mgmt-button--ghost"
                        disabled={submitting}
                        onClick={() => setPhoto({ action: "keep" })}
                      >
                        {he ? "שימוש בתמונה השמורה" : "Use saved photo"}
                      </button>
                    )}
                  </div>
                )}
                <FormField
                  label={he ? "קוד איור SVG" : "SVG illustration code"}
                  disabled={submitting}
                  description={
                    <>
                      {he
                        ? "מומלץ SVG שקוף על משטח של 240 × 160 יחידות ביחס 3:2, עם "
                        : "Use a transparent SVG on a 240 × 160 canvas at 3:2 with "}
                      <code dir="ltr">viewBox=&quot;0 0 240 160&quot;</code>
                      {he
                        ? ". איירו ציוד מזוהה ומפורט ללא כיתוב, והשאירו שוליים שקופים מסביב. שם הקטגוריה מופיע מתחת לאיור. השתמשו בצורות, נתיבים ומעברי צבע מקומיים, עד 32KB. כשהשדה ריק ולא הוגדרה תמונה, יוצג האיור המובנה."
                        : ". Draw recognizable, detailed equipment without text. Leave transparent space around the edges for magnification. The category name appears below. Use shapes, paths and local gradients, up to 32 KB. Leave this blank to use the bundled illustration when no photo is set."}
                    </>
                  }
                  error={
                    invalidSvg
                      ? he
                        ? "השתמשו ב־SVG תקין עם viewBox ומעברי צבע מקומיים, עד 32KB. יש להסיר כיתוב, הנפשות, CSS, תמונות מוטמעות וקישורים חיצוניים."
                        : "Use valid SVG with a viewBox and local gradients, up to 32 KB. Remove text, animation, CSS, embedded images and external links."
                      : undefined
                  }
                >
                  {(control) => (
                    <textarea
                      {...control}
                      className={`miro-input ${styles.svgCode}`}
                      dir="ltr"
                      rows={6}
                      value={svg}
                      maxLength={MAX_CATEGORY_ARTWORK_SVG_BYTES}
                      spellCheck={false}
                      onChange={(event) => setSvg(event.target.value)}
                    />
                  )}
                </FormField>
                {svg && (
                  <button
                    type="button"
                    className="mgmt-button mgmt-button--ghost"
                    disabled={submitting}
                    onClick={() => setSvg("")}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    {he ? "הסרת SVG מותאם" : "Remove custom SVG"}
                  </button>
                )}
              </div>
              <figure
                className={styles.preview}
                aria-label={he ? "תצוגה מקדימה של העיצוב" : "Artwork preview"}
              >
                <div className={styles.frame}>
                  {displayedPhoto ? (
                    <Image
                      src={displayedPhoto}
                      alt=""
                      width={960}
                      height={640}
                      className={styles.photo}
                      unoptimized
                    />
                  ) : (
                    <Image
                      src={iconUrl ?? getStoreCategoryArtwork(category.slug)}
                      alt=""
                      width={240}
                      height={160}
                      className={styles.illustration}
                      unoptimized
                    />
                  )}
                  {displayedPhoto && iconUrl && (
                    <Image
                      src={iconUrl}
                      alt=""
                      width={240}
                      height={160}
                      className={styles.badge}
                      unoptimized
                    />
                  )}
                </div>
                <figcaption>
                  <bdi>{categoryName}</bdi>
                </figcaption>
              </figure>
            </div>
          </form>
        )}
      </Dialog>
      <ConfirmationDialog
        open={discard !== null}
        onConfirm={() => {
          if (discard === "reload") reload();
          else onClose();
          setDiscard(null);
        }}
        onCancel={() => setDiscard(null)}
        closeLabel={categoriesCopy.closeDialog[locale]}
        title={categoriesCopy.dirtyConfirmTitle[locale]}
        description={
          discard === "reload"
            ? he
              ? "טעינת העיצוב השמור תחליף את הטיוטה שבחלון זה."
              : "Loading the saved artwork replaces the draft in this window."
            : categoriesCopy.dirtyConfirmBody[locale]
        }
        confirmLabel={
          discard === "reload"
            ? he
              ? "טעינת העיצוב השמור"
              : "Load saved artwork"
            : categoriesCopy.dirtyConfirmLeave[locale]
        }
        cancelLabel={categoriesCopy.dirtyConfirmStay[locale]}
      />
    </>
  );
}
