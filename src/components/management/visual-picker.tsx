"use client";

import { useId } from "react";
import {
  BellRing,
  Cable,
  Camera,
  Cctv,
  FileImage,
  LockKeyhole,
  Network,
  Phone,
  Router,
  Server,
  Shapes,
  ShieldCheck,
  Video,
  type LucideIcon,
} from "lucide-react";
import styles from "./visual-picker.module.css";

export const VISUAL_KIND_ORDER = [
  "camera_dome",
  "camera_bullet",
  "camera_ptz",
  "alarm",
  "intercom",
  "router",
  "network_switch",
  "cable",
  "lock",
  "server",
  "generic_security",
  "uploaded_image",
  "uploaded_svg",
] as const;

export type VisualKind = (typeof VISUAL_KIND_ORDER)[number];

const UPLOAD_KINDS: readonly VisualKind[] = ["uploaded_image", "uploaded_svg"];

export function isVisualKind(value: unknown): value is VisualKind {
  return (
    typeof value === "string" &&
    (VISUAL_KIND_ORDER as readonly string[]).includes(value)
  );
}

export const visualKindIcons: Record<VisualKind, LucideIcon> = {
  camera_dome: Cctv,
  camera_bullet: Camera,
  camera_ptz: Video,
  alarm: BellRing,
  intercom: Phone,
  router: Router,
  network_switch: Network,
  cable: Cable,
  lock: LockKeyhole,
  server: Server,
  generic_security: ShieldCheck,
  uploaded_image: FileImage,
  uploaded_svg: Shapes,
};

export const visualKindLabels: Record<
  VisualKind,
  Record<"he" | "en", string>
> = {
  camera_dome: { he: "מצלמת כיפה", en: "Dome camera" },
  camera_bullet: { he: "מצלמת בולט", en: "Bullet camera" },
  camera_ptz: { he: "מצלמת PTZ", en: "PTZ camera" },
  alarm: { he: "מערכת אזעקה", en: "Alarm system" },
  intercom: { he: "אינטרקום", en: "Intercom" },
  router: { he: "נתב / רשת", en: "Router / network" },
  network_switch: { he: "מתג רשת", en: "Network switch" },
  cable: { he: "כבילה", en: "Cabling" },
  lock: { he: "מנעול חכם", en: "Smart lock" },
  server: { he: "שרת", en: "Server" },
  generic_security: { he: "אבטחה כללית", en: "Generic security" },
  uploaded_image: { he: "תמונה שהועלתה", en: "Uploaded image" },
  uploaded_svg: { he: "SVG שהועלה", en: "Uploaded SVG" },
};

export type VisualPickerProps = {
  /** Currently selected kind (must be one of VISUAL_KIND_ORDER). */
  value: VisualKind;
  onChange: (kind: VisualKind) => void;
  /**
   * Thumbnail URL shown inside the uploaded_image / uploaded_svg option when
   * one is selected and a URL is set. Leave empty to show the icon instead.
   */
  imageUrl?: string;
  /** Accessible group legend (visible). */
  legend: string;
  /** Helper text under the grid. */
  description?: string;
  locale: "he" | "en";
  /**
   * Restrict the selectable kinds (defaults to all 13 approved kinds).
   * Categories pass the two uploaded kinds only, since their schema stores a
   * single image URL rather than a visual_kind column.
   */
  allowedKinds?: readonly VisualKind[];
  disabled?: boolean;
  id?: string;
};

/**
 * Radio-group grid of the approved visual kinds. Uploaded kinds render the
 * current image/svg as a thumbnail instead of the generic icon when set.
 * Uses native radio inputs for keyboard accessibility (arrow-key roving is
 * browser-provided within a radio group).
 */
export function VisualPicker({
  value,
  onChange,
  imageUrl,
  legend,
  description,
  locale,
  allowedKinds = VISUAL_KIND_ORDER,
  disabled = false,
  id,
}: VisualPickerProps) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const descriptionId = description ? `${groupId}-description` : undefined;

  return (
    <fieldset className={styles.fieldset} aria-describedby={descriptionId}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.grid} role="presentation">
        {allowedKinds.map((kind) => {
          const Icon = visualKindIcons[kind];
          const isUpload = (UPLOAD_KINDS as readonly string[]).includes(kind);
          const showThumb = isUpload && value === kind && !!imageUrl;
          const optionId = `${groupId}-${kind}`;
          return (
            <label
              key={kind}
              className={styles.option}
              data-checked={value === kind ? "true" : undefined}
              htmlFor={optionId}
            >
              <input
                type="radio"
                className={styles.radio}
                id={optionId}
                name={groupId}
                value={kind}
                checked={value === kind}
                disabled={disabled}
                onChange={() => onChange(kind)}
                aria-label={visualKindLabels[kind][locale]}
              />
              <span className={styles.preview} aria-hidden="true">
                {showThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className={styles.thumb} />
                ) : (
                  <Icon size={20} />
                )}
              </span>
              <span
                className={styles.optionLabel}
                dir={locale === "he" ? "rtl" : "ltr"}
              >
                {visualKindLabels[kind][locale]}
              </span>
            </label>
          );
        })}
      </div>
      {description ? (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      ) : null}
    </fieldset>
  );
}
