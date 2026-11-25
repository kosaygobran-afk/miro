"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Images,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { WebsiteGallery } from "@/components/public/website-gallery";
import { type Locale } from "@/lib/i18n";
import {
  defaultWebsiteImages,
  MAX_WEBSITE_GALLERY_IMAGES,
  WEBSITE_GALLERY_KEYS,
  websiteImagesSchema,
  websiteImageUrlSchema,
  type WebsiteGalleryImage,
  type WebsiteGallerySettings,
  type WebsiteImages,
} from "@/lib/website-images";
import { Dialog, FormField, FormSection, Notice } from "./ui";
import styles from "./website-gallery-settings.module.css";

const endpoint = "/api/management/settings/website-images";

type GalleryKey = (typeof WEBSITE_GALLERY_KEYS)[number];
type ImageSlot = {
  key: string;
  label: string;
  description: string;
  defaultUrl: string;
};
type Snapshot = { design: WebsiteImages; revision: string };
type RequestState = "loading" | "saving" | "uploading" | null;

const emptyImage: WebsiteGalleryImage = {
  url: "",
  altHe: "",
  altEn: "",
  fit: "cover",
  x: 50,
  y: 50,
  zoom: 1,
};

function parseSnapshot(value: unknown): Snapshot {
  if (
    !value ||
    typeof value !== "object" ||
    !("design" in value) ||
    !("revision" in value) ||
    typeof value.revision !== "string"
  ) {
    throw new Error("invalid_snapshot");
  }
  return {
    design: websiteImagesSchema.parse(value.design),
    revision: value.revision,
  };
}

function RangeField({
  label,
  description,
  min,
  max,
  step = 1,
  value,
  onChange,
  units,
}: {
  label: string;
  description?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  units: string;
}) {
  return (
    <FormField
      label={
        <>
          {label}{" "}
          <bdi className={styles.rangeValue}>
            {value}
            {units}
          </bdi>
        </>
      }
      description={description}
    >
      {(control) => (
        <input
          {...control}
          className={styles.range}
          type="range"
          dir="ltr"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        />
      )}
    </FormField>
  );
}

function UploadField({
  label,
  description,
  upload,
}: {
  label: string;
  description: string;
  upload: (file: File) => void;
}) {
  return (
    <FormField label={label} description={description}>
      {(control) => (
        <input
          {...control}
          className="mgmt-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) upload(file);
          }}
        />
      )}
    </FormField>
  );
}

function SelectField<Value extends string>({
  label,
  description,
  value,
  items,
  onChange,
}: {
  label: string;
  description?: string;
  value: Value;
  items: ReadonlyArray<readonly [Value, string]>;
  onChange: (value: Value) => void;
}) {
  return (
    <FormField label={label} description={description}>
      {(control) => (
        <select
          {...control}
          className="mgmt-input"
          value={value}
          onChange={(event) => {
            const selected = items.find(
              ([key]) => key === event.currentTarget.value,
            );
            if (selected) onChange(selected[0]);
          }}
        >
          {items.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}

function TextField({
  label,
  description,
  value,
  onChange,
  dir,
  lang,
  url,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  dir: "ltr" | "rtl";
  lang?: Locale;
  url?: boolean;
}) {
  return (
    <FormField label={label} description={description}>
      {(control) => (
        <input
          {...control}
          className="mgmt-input"
          type="text"
          inputMode={url ? "url" : undefined}
          dir={dir}
          lang={lang}
          maxLength={url ? 2048 : 180}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </FormField>
  );
}

export function WebsiteGalleryEditor({
  locale,
  slots = [],
}: {
  locale: Locale;
  slots?: ImageSlot[];
}) {
  const he = locale === "he";
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<WebsiteImages | null>(null);
  const [request, setRequest] = useState<RequestState>("loading");
  const inFlight = useRef(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mustReload, setMustReload] = useState(false);
  const [placement, setPlacement] = useState<GalleryKey | "other">("home");
  const [slotKey, setSlotKey] = useState(slots[0]?.key);
  const [imageIndex, setImageIndex] = useState(0);
  const [preview, setPreview] = useState(false);
  const addImageRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (!response.ok) throw new Error(String(response.status));
        const snapshot = parseSnapshot(await response.json());
        setSaved(snapshot);
        setDraft(snapshot.design);
        setMustReload(false);
        setImageIndex(0);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error && cause.message === "503"
            ? he
              ? "הגדרות התמונות אינן זמינות כרגע. יש לבדוק שעדכון מסד הנתונים הותקן ושהשרת זמין."
              : "Image settings are unavailable. Check that the database update is installed and the service is reachable."
            : he
              ? "טעינת הגדרות התמונות נכשלה."
              : "Image settings could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setRequest(null);
          inFlight.current = false;
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [he, reload]);

  const dirty =
    draft !== null &&
    saved !== null &&
    JSON.stringify(draft) !== JSON.stringify(saved.design);

  const gallery = placement !== "other" ? draft?.galleries[placement] : null;
  const image = gallery?.images[imageIndex];
  const slot = slots.find((entry) => entry.key === slotKey);
  const slotUrl =
    slot && draft ? (draft.overrides[slot.key] ?? slot.defaultUrl) : "";
  const canPreviewImage = Boolean(
    image && websiteImageUrlSchema.safeParse(image.url).success,
  );
  const testImages =
    preview && gallery
      ? gallery.images.filter(
          (item) => websiteImageUrlSchema.safeParse(item.url).success,
        )
      : [];
  const testIndex = image ? Math.max(0, testImages.indexOf(image)) : 0;

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function reloadSettings() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRequest("loading");
    clearFeedback();
    setReload((previous) => previous + 1);
  }

  function updateGallery(patch: Partial<WebsiteGallerySettings>) {
    if (placement === "other") return;
    setMessage("");
    setDraft((current) =>
      current
        ? {
            ...current,
            galleries: {
              ...current.galleries,
              [placement]: { ...current.galleries[placement], ...patch },
            },
          }
        : current,
    );
  }

  function updateImage(patch: Partial<WebsiteGalleryImage>) {
    if (!gallery) return;
    updateGallery({
      images: gallery.images.map((item, index) =>
        index === imageIndex ? { ...item, ...patch } : item,
      ),
    });
  }

  function updateSlot(url: string | undefined) {
    if (!slot) return;
    setMessage("");
    const key = slot.key;
    setDraft((current) => {
      if (!current) return current;
      const overrides = { ...current.overrides };
      if (url === undefined) {
        delete overrides[key];
      } else {
        overrides[key] = url;
      }
      return { ...current, overrides };
    });
  }

  function moveImage(step: number) {
    if (!gallery) return;
    const next = imageIndex + step;
    if (next < 0 || next >= gallery.images.length) return;
    const images = [...gallery.images];
    [images[imageIndex], images[next]] = [images[next], images[imageIndex]];
    updateGallery({ images });
    setImageIndex(next);
  }

  function removeImage() {
    if (!gallery) return;
    const images = gallery.images.filter((_, index) => index !== imageIndex);
    updateGallery({ images });
    setImageIndex(Math.max(0, Math.min(imageIndex, images.length - 1)));
    if (images.length === 0) addImageRef.current?.focus();
  }

  function moveToGallery(target: GalleryKey) {
    if (!draft || !image || placement === "other" || target === placement)
      return;
    const destination = draft.galleries[target];
    if (destination.images.length >= MAX_WEBSITE_GALLERY_IMAGES) return;
    setDraft({
      ...draft,
      galleries: {
        ...draft.galleries,
        [placement]: {
          ...draft.galleries[placement],
          images: draft.galleries[placement].images.filter(
            (_, index) => index !== imageIndex,
          ),
        },
        [target]: {
          ...destination,
          images: [...destination.images, image],
        },
      },
    });
    setPlacement(target);
    setImageIndex(destination.images.length);
    clearFeedback();
    addImageRef.current?.focus();
  }

  async function uploadImage(file: File, setUrl: (url: string) => void) {
    if (inFlight.current) return;
    clearFeedback();
    if (file.size > 4 * 1024 * 1024) {
      setError(
        he ? "יש לבחור קובץ עד 4 מגה־בייט." : "Choose an image up to 4 MB.",
      );
      return;
    }
    inFlight.current = true;
    setRequest("uploading");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(endpoint + "/assets", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        body,
      });
      const data = await response.json();
      if (!response.ok || typeof data?.url !== "string") {
        throw new Error("upload_failed");
      }
      setUrl(data.url);
      setMessage(
        he
          ? "התמונה הועלתה לטיוטה. יש לפרסם כדי להציג אותה באתר."
          : "Image uploaded to the draft. Publish to display it on the website.",
      );
    } catch {
      setError(
        he
          ? "העלאת התמונה נכשלה. בדקו את סוג הקובץ והגודל או השתמשו בכתובת תמונה."
          : "Image upload failed. Check the file type and size or use an image URL.",
      );
    } finally {
      setRequest(null);
      inFlight.current = false;
    }
  }

  async function publish() {
    if (!draft || !saved || mustReload || inFlight.current) return;
    clearFeedback();
    const payload = websiteImagesSchema.safeParse(draft);
    if (!payload.success) {
      const issue = payload.error.issues[0];
      const [group, key, field, index, property] = issue.path;
      const invalidPlacement = WEBSITE_GALLERY_KEYS.find(
        (item) => item === key,
      );
      if (group === "galleries" && invalidPlacement) {
        setPlacement(invalidPlacement);
        if (field === "images" && typeof index === "number")
          setImageIndex(index);
      }
      if (group === "overrides" && typeof key === "string") {
        setPlacement("other");
        setSlotKey(key);
      }
      setError(
        property === "altHe" || property === "altEn"
          ? he
            ? "יש להוסיף תיאור לתמונה בעברית ובאנגלית."
            : "Enter alternative text for the image in Hebrew and English."
          : he
            ? "בדקו את כתובת התמונה ואת ההגדרות במיקום שנבחר."
            : "Check the image URL and the settings for this placement.",
      );
      return;
    }

    inFlight.current = true;
    setRequest("saving");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          design: payload.data,
          revision: saved.revision,
        }),
      });
      if (response.status === 409) {
        setMustReload(true);
        setError(
          he
            ? "פורסמה גרסה חדשה. הטיוטה עדיין פתוחה. יש לטעון מחדש את הגרסה השמורה לפני פרסום."
            : "A newer version was published. Your draft is still open. Reload the saved version before publishing.",
        );
        return;
      }
      if (response.status === 400 || response.status === 413) {
        setError(
          he
            ? "השרת דחה את ההגדרות. בדקו את הכתובות והערכים בטיוטה."
            : "The server rejected the settings. Check the draft URLs and values.",
        );
        return;
      }
      if (response.status === 403 || response.status === 401) {
        setError(
          he
            ? "פרסום דורש חשבון מנהל ראשי פעיל."
            : "Publication requires an active CEO account.",
        );
        return;
      }
      if (response.status === 429) {
        setError(
          he
            ? "יש להמתין דקה לפני פרסום נוסף."
            : "Wait a minute before trying to publish again.",
        );
        return;
      }
      if (!response.ok) throw new Error("save_failed");
      const snapshot = parseSnapshot(await response.json());
      setSaved(snapshot);
      setDraft(snapshot.design);
      setMessage(
        he
          ? "הגדרות התמונות פורסמו באתר."
          : "Website image settings published.",
      );
    } catch {
      setMustReload(true);
      setError(
        he
          ? "לא ניתן לאמת את הפרסום. הטיוטה עדיין פתוחה. יש לטעון מחדש את הגרסה השמורה לפני ניסיון נוסף."
          : "Publication could not be confirmed. Your draft is still open. Reload the saved version before trying again.",
      );
    } finally {
      setRequest(null);
      inFlight.current = false;
    }
  }

  const secondary = "mgmt-button mgmt-button--secondary";
  const uploadLabel = he ? "העלאת קובץ תמונה" : "Upload image file";
  const uploadHelp = he
    ? "JPEG, PNG, WebP או AVIF עד 4 מגה־בייט."
    : "JPEG, PNG, WebP or AVIF up to 4 MB.";
  const locationLabel = {
    home: he ? "גלריית דף הבית" : "Home gallery",
    services: he ? "גלריית דף השירותים" : "Services overview gallery",
    serviceDetails: he
      ? "שירותים · התקנות רשת"
      : "Services · Network installations",
    other: he ? "תמונות לפי מיקום" : "Images by placement",
  };
  const placementHint: Record<GalleryKey, string> = {
    home: he
      ? "מומלץ צילום אנכי ביחס 4:5 של הצוות בעבודה, עם הנושא קרוב למרכז."
      : "Use a 4:5 portrait of the team at work, with the subject close to the center.",
    services: he
      ? "מומלץ תקריב אנכי ביחס 4:5 של ציוד או התקנה. אם מופיע טקסט בתמונה, בחרו הצגה מלאה."
      : "Use a vertical 4:5 close-up of equipment or installation work. If the image contains text, choose Show whole image.",
    serviceDetails: he
      ? "מומלץ צילום אנכי ביחס 4:5 של חיווט, ארון תקשורת או פרטי התקנה. הגלריה מופיעה אחרי שלבי העבודה בדף השירותים."
      : "Use a 4:5 portrait of wiring, a network cabinet or installation detail. This gallery follows the process on the Services page.",
  };
  const urlLabel = he ? "כתובת תמונה" : "Image URL";
  const urlHelp = he
    ? "הדביקו קישור HTTPS ישיר לתמונה."
    : "Paste a direct HTTPS link to an image.";
  const previewTitle = he ? "בדיקת הגלריה" : "Test gallery";
  const heading = he ? "תמונות האתר" : "Website images";
  const locations: Array<readonly [GalleryKey | "other", string]> =
    WEBSITE_GALLERY_KEYS.map((key) => [key, locationLabel[key]] as const);
  if (slots.length) locations.push(["other", locationLabel.other]);
  const actions = draft && (
    <button
      className="mgmt-button mgmt-button--primary"
      type="button"
      disabled={!dirty || Boolean(request) || mustReload}
      onClick={() => void publish()}
    >
      <Save aria-hidden="true" size={17} />
      {request === "saving"
        ? he
          ? "מתבצע פרסום…"
          : "Publishing…"
        : he
          ? "פרסום תמונות"
          : "Publish images"}
    </button>
  );

  return (
    <FormSection
      sectionId="website-images"
      icon={<Images size={20} />}
      title={heading}
      description={
        he
          ? "ערכו תמונות וגלריות של האתר, בדקו חיתוך ותנועה, ופרסמו כשתהיו מוכנים."
          : "Edit website imagery, test crops and transitions, and publish when you’re ready."
      }
      actions={actions}
    >
      <div className={styles.editor}>
        {error && <Notice tone="danger">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {request === "loading" && (
          <p role="status" className={styles.hint}>
            {he ? "הגדרות התמונות נטענות…" : "Loading image settings…"}
          </p>
        )}
        {request === "uploading" && (
          <p role="status" className={styles.hint}>
            {he ? "התמונה מועלת…" : "Uploading image…"}
          </p>
        )}
        {(!draft || mustReload) && request !== "loading" && (
          <button className={secondary} type="button" onClick={reloadSettings}>
            <RotateCcw size={17} aria-hidden="true" />
            {dirty
              ? he
                ? "ביטול הטיוטה וטעינת גרסה אחרונה"
                : "Discard draft and reload saved version"
              : he
                ? "טעינת הגדרות מחדש"
                : "Reload settings"}
          </button>
        )}
        {draft && (
          <fieldset className={styles.editor} disabled={Boolean(request)}>
            <SelectField
              label={he ? "מיקום באתר" : "Website placement"}
              value={placement}
              items={locations}
              onChange={(value) => {
                setPlacement(value);
                setImageIndex(0);
              }}
            />
            {gallery && (
              <>
                {placement !== "other" && (
                  <p className={styles.hint}>{placementHint[placement]}</p>
                )}
                <div className={styles.toolbar}>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => setPreview(true)}
                    disabled={
                      !gallery.images.some(
                        (item) =>
                          websiteImageUrlSchema.safeParse(item.url).success,
                      )
                    }
                  >
                    <Eye size={17} aria-hidden="true" /> {previewTitle}
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => {
                      if (placement === "other") return;
                      updateGallery(defaultWebsiteImages.galleries[placement]);
                      setImageIndex(0);
                    }}
                  >
                    <RotateCcw size={17} aria-hidden="true" />
                    {he ? "שחזור ברירת המחדל" : "Restore placement defaults"}
                  </button>
                </div>
                <div className={styles.fields}>
                  <SelectField
                    label={he ? "מעבר בין תמונות" : "Image transition"}
                    description={
                      he
                        ? "התנועה באתר כפופה להגדרה הכללית ולהעדפת הפחתת תנועה."
                        : "Public transitions follow the site’s motion settings and the visitor’s reduced-motion preference."
                    }
                    value={gallery.animation}
                    items={[
                      [
                        "flip-up",
                        he ? "היפוך מלמטה למעלה" : "Bottom-to-top flip",
                      ],
                      [
                        "swipe-left",
                        he ? "החלקה מימין לשמאל" : "Right-to-left swipe",
                      ],
                      ["fade", he ? "התמזגות" : "Fade"],
                      ["none", he ? "החלפה מיידית" : "Instant change"],
                    ]}
                    onChange={(animation) => updateGallery({ animation })}
                  />
                  <SelectField
                    label={he ? "עיבוד צבע" : "Color effect"}
                    value={gallery.effect}
                    items={[
                      ["natural", he ? "טבעי" : "Natural"],
                      ["warm", he ? "חם" : "Warm"],
                      ["mono", he ? "שחור ולבן" : "Monochrome"],
                    ]}
                    onChange={(effect) => updateGallery({ effect })}
                  />
                  <SelectField
                    label={he ? "דפדוף בין תמונות" : "Image playback"}
                    description={
                      he
                        ? "הדפדוף הידני זמין תמיד בחצים ובמגע."
                        : "Visitors can always use arrows or touch to browse."
                    }
                    value={gallery.autoplay ? "automatic" : "manual"}
                    items={[
                      ["automatic", he ? "אוטומטי" : "Automatic"],
                      ["manual", he ? "ידני" : "Manual"],
                    ]}
                    onChange={(value) =>
                      updateGallery({ autoplay: value === "automatic" })
                    }
                  />
                  {gallery.autoplay && (
                    <RangeField
                      label={
                        he ? "זמן בין תמונות בשניות" : "Seconds between images"
                      }
                      min={5}
                      max={30}
                      value={gallery.interval}
                      units=""
                      onChange={(interval) => updateGallery({ interval })}
                    />
                  )}
                  <RangeField
                    label={he ? "עיגול פינות" : "Corner radius"}
                    min={0}
                    max={32}
                    value={gallery.radius}
                    units=" px"
                    onChange={(radius) => updateGallery({ radius })}
                  />
                  <RangeField
                    label={he ? "עובי מסגרת" : "Border width"}
                    min={0}
                    max={6}
                    value={gallery.border}
                    units=" px"
                    onChange={(border) => updateGallery({ border })}
                  />
                </div>
                <div className={styles.imageEditor}>
                  <div className={styles.toolbar}>
                    <button
                      type="button"
                      className={secondary}
                      disabled={
                        gallery.images.length >= MAX_WEBSITE_GALLERY_IMAGES
                      }
                      ref={addImageRef}
                      onClick={() => {
                        updateGallery({
                          images: [...gallery.images, emptyImage],
                        });
                        setImageIndex(gallery.images.length);
                      }}
                    >
                      <Plus size={17} aria-hidden="true" />{" "}
                      {he ? "הוספת תמונה" : "Add image"}
                    </button>
                    <span className={styles.hint}>
                      {he ? "תמונות בגלריה" : "Gallery images"}{" "}
                      <bdi>
                        {gallery.images.length} / {MAX_WEBSITE_GALLERY_IMAGES}
                      </bdi>
                    </span>
                  </div>
                  {image ? (
                    <>
                      <div className={styles.imageToolbar}>
                        <SelectField
                          label={he ? "תמונה לעריכה" : "Image to edit"}
                          value={String(imageIndex)}
                          items={gallery.images.map((item, index) => [
                            String(index),
                            `${index + 1}. ${(he ? item.altHe : item.altEn) || (he ? "תמונה חדשה" : "New image")}`,
                          ])}
                          onChange={(value) => setImageIndex(Number(value))}
                        />
                        <div className={styles.toolbar}>
                          <button
                            type="button"
                            className={secondary}
                            aria-label={
                              he ? "העברה למיקום קודם" : "Move image earlier"
                            }
                            disabled={imageIndex === 0}
                            onClick={() => moveImage(-1)}
                          >
                            <ArrowUp size={17} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={secondary}
                            aria-label={
                              he ? "העברה למיקום הבא" : "Move image later"
                            }
                            disabled={imageIndex >= gallery.images.length - 1}
                            onClick={() => moveImage(1)}
                          >
                            <ArrowDown size={17} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="mgmt-button mgmt-button--danger"
                            onClick={removeImage}
                          >
                            <Trash2 size={17} aria-hidden="true" />{" "}
                            {he ? "הסרה" : "Remove"}
                          </button>
                        </div>
                      </div>
                      <details key={placement} className={styles.movePanel}>
                        <summary>
                          {he ? "העברה לגלריה אחרת" : "Move to another gallery"}
                        </summary>
                        <div className={styles.toolbar}>
                          {WEBSITE_GALLERY_KEYS.filter(
                            (key) => key !== placement,
                          ).map((key) => (
                            <button
                              key={key}
                              type="button"
                              className={secondary}
                              disabled={
                                draft.galleries[key].images.length >=
                                MAX_WEBSITE_GALLERY_IMAGES
                              }
                              onClick={() => moveToGallery(key)}
                            >
                              {locationLabel[key]}
                            </button>
                          ))}
                        </div>
                      </details>
                      <div className={styles.workbench}>
                        <div className={styles.preview}>
                          <h3>{he ? "תצוגת מסגרת" : "Framing preview"}</h3>
                          {canPreviewImage ? (
                            <WebsiteGallery
                              key={image.url}
                              gallery={{ ...gallery, images: [image] }}
                              locale={locale}
                              preview
                            />
                          ) : (
                            <p className={styles.hint}>
                              {he
                                ? "בחרו קובץ או הזינו כתובת כדי לראות את המסגרת."
                                : "Choose a file or enter a URL to preview the framing."}
                            </p>
                          )}
                        </div>
                        <div className={styles.imageFields}>
                          <TextField
                            label={urlLabel}
                            description={urlHelp}
                            url
                            dir="ltr"
                            value={image.url}
                            onChange={(url) => updateImage({ url })}
                          />
                          <UploadField
                            label={uploadLabel}
                            description={uploadHelp}
                            upload={(file) =>
                              void uploadImage(file, (url) =>
                                updateImage({ url }),
                              )
                            }
                          />
                          <div className={styles.fields}>
                            <TextField
                              label={
                                he ? "תיאור בעברית" : "Hebrew alternative text"
                              }
                              dir="rtl"
                              lang="he"
                              value={image.altHe}
                              onChange={(altHe) => updateImage({ altHe })}
                            />
                            <TextField
                              label={
                                he
                                  ? "תיאור באנגלית"
                                  : "English alternative text"
                              }
                              dir="ltr"
                              lang="en"
                              value={image.altEn}
                              onChange={(altEn) => updateImage({ altEn })}
                            />
                            <SelectField
                              label={he ? "התאמה למסגרת" : "Fit to frame"}
                              description={
                                he
                                  ? "מילוי חותך את השוליים לפי הצורך. להצגה מלאה של התמונה בחרו זום 1×."
                                  : "Fill crops the edges as needed. To keep the whole image visible, set zoom to 1×."
                              }
                              value={image.fit}
                              items={[
                                ["cover", he ? "מילוי המסגרת" : "Fill frame"],
                                [
                                  "contain",
                                  he ? "הצגת תמונה מלאה" : "Show whole image",
                                ],
                              ]}
                              onChange={(fit) =>
                                updateImage({
                                  fit,
                                  ...(fit === "contain" ? { zoom: 1 } : {}),
                                })
                              }
                            />
                            <RangeField
                              label={he ? "זום" : "Zoom"}
                              min={1}
                              max={2}
                              step={0.05}
                              value={image.zoom}
                              units="×"
                              onChange={(zoom) => updateImage({ zoom })}
                            />
                            <RangeField
                              label={
                                he ? "מוקד אופקי" : "Horizontal crop position"
                              }
                              description={
                                he ? "משמאל לימין." : "Left to right."
                              }
                              min={0}
                              max={100}
                              value={image.x}
                              units="%"
                              onChange={(x) => updateImage({ x })}
                            />
                            <RangeField
                              label={
                                he ? "מוקד אנכי" : "Vertical crop position"
                              }
                              description={
                                he ? "מלמעלה למטה." : "Top to bottom."
                              }
                              min={0}
                              max={100}
                              value={image.y}
                              units="%"
                              onChange={(y) => updateImage({ y })}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className={styles.hint}>
                      {he
                        ? "גלריה ריקה תוסתר מהעמוד לאחר הפרסום."
                        : "An empty gallery is hidden on the page after publication."}
                    </p>
                  )}
                </div>
              </>
            )}
            {placement === "other" && slot && (
              <div className={styles.imageEditor}>
                <SelectField
                  label={he ? "תמונה לפי מיקום" : "Image placement"}
                  value={slot.key}
                  items={slots.map(({ key, label }) => [key, label])}
                  onChange={setSlotKey}
                />
                <p className={styles.hint}>{slot.description}</p>
                <div className={styles.toolbar}>
                  <button
                    className={secondary}
                    type="button"
                    onClick={() => updateSlot(undefined)}
                  >
                    <RotateCcw size={17} aria-hidden="true" />{" "}
                    {he ? "שחזור תמונת ברירת המחדל" : "Restore default image"}
                  </button>
                  <button
                    className={secondary}
                    type="button"
                    onClick={() => updateSlot("")}
                  >
                    <Trash2 size={17} aria-hidden="true" />{" "}
                    {he ? "הסתרת התמונה" : "Hide image"}
                  </button>
                </div>
                <div className={styles.workbench}>
                  <div className={styles.preview}>
                    <h3>{he ? "תמונת מקור" : "Source image"}</h3>
                    {websiteImageUrlSchema.safeParse(slotUrl).success ? (
                      <div className={styles.sourceImage}>
                        <Image
                          src={slotUrl}
                          alt={slot.label}
                          fill
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <p className={styles.hint}>
                        {he ? "אין תמונה לתצוגה." : "No image to display."}
                      </p>
                    )}
                  </div>
                  <div className={styles.imageFields}>
                    <TextField
                      label={urlLabel}
                      description={urlHelp}
                      url
                      dir="ltr"
                      value={slotUrl}
                      onChange={updateSlot}
                    />
                    <UploadField
                      label={uploadLabel}
                      description={uploadHelp}
                      upload={(file) => void uploadImage(file, updateSlot)}
                    />
                  </div>
                </div>
              </div>
            )}
          </fieldset>
        )}
      </div>
      <Dialog
        open={preview}
        title={previewTitle}
        description={
          he
            ? "עברו לתמונה הבאה או לחצו על בדיקת הנפשה. התצוגה מכבדת את העדפת הפחתת התנועה."
            : "Go to the next image or choose Test animation. The preview respects reduced motion."
        }
        size="lg"
        closeLabel={he ? "סגירה" : "Close"}
        onClose={() => setPreview(false)}
      >
        {preview && gallery && (
          <WebsiteGallery
            gallery={{ ...gallery, images: testImages }}
            locale={locale}
            initialIndex={testIndex}
            preview
          />
        )}
      </Dialog>
    </FormSection>
  );
}
