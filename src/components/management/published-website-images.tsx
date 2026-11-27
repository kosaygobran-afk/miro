import Image from "next/image";
import { Images } from "lucide-react";
import { WebsiteGallery } from "@/components/public/website-gallery";
import type { Locale } from "@/lib/i18n";
import {
  WEBSITE_GALLERY_KEYS,
  websiteImageUrlSchema,
  type WebsiteImages,
} from "@/lib/website-images";
import { FormSection } from "./ui/form-section";
import { Notice } from "./ui/notice";
import styles from "./website-gallery-settings.module.css";

export function PublishedWebsiteImages({
  locale,
  design,
  slots,
}: {
  locale: Locale;
  design: WebsiteImages | null;
  slots: ReadonlyArray<{ key: string; label: string; defaultUrl: string }>;
}) {
  const he = locale === "he";
  const placements = {
    home: he ? "גלריית דף הבית" : "Home gallery",
    services: he ? "גלריית דף השירותים" : "Services overview gallery",
    serviceDetails: he
      ? "שירותים · התקנות רשת"
      : "Services · Network installations",
  };
  const transitions = {
    "flip-up": he ? "חשיפה משמאל לימין" : "Left-to-right reveal",
    "swipe-left": he ? "החלקה רכה" : "Soft slide",
    fade: he ? "התמזגות" : "Fade",
    none: he ? "החלפה מיידית" : "Instant change",
  };
  const effects = {
    natural: he ? "טבעי" : "Natural",
    warm: he ? "חם" : "Warm",
    mono: he ? "שחור ולבן" : "Monochrome",
  };

  return (
    <FormSection
      icon={<Images size={20} />}
      title={
        he
          ? "תמונות הבית והשירותים שפורסמו"
          : "Published Home and Services images"
      }
      description={
        he
          ? "תצוגה לקריאה בלבד של התמונות והגלריות באתר."
          : "Read-only view of the images and galleries shown on the website."
      }
    >
      {design ? (
        <div className={styles.editor}>
          {WEBSITE_GALLERY_KEYS.map((key) => {
            const gallery = design.galleries[key];
            const count = new Intl.NumberFormat(locale).format(
              gallery.images.length,
            );
            const imageCount = he
              ? `${count} תמונות`
              : `${count} ${gallery.images.length === 1 ? "image" : "images"}`;
            return (
              <details
                className={styles.preview}
                key={key}
                open={key === "home"}
              >
                <summary className="cursor-pointer font-semibold">
                  {placements[key]}{" "}
                  <bdi className={styles.hint}>({imageCount})</bdi>
                </summary>
                {gallery.images.length ? (
                  <>
                    <dl className="my-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      {[
                        [
                          he ? "מעבר" : "Transition",
                          transitions[gallery.animation],
                        ],
                        [
                          he ? "עיבוד צבע" : "Color effect",
                          effects[gallery.effect],
                        ],
                        [
                          he ? "דפדוף" : "Playback",
                          gallery.autoplay
                            ? he
                              ? `כל ${gallery.interval} שניות`
                              : `Every ${gallery.interval} seconds`
                            : he
                              ? "ידני"
                              : "Manual",
                        ],
                        [
                          he ? "מסגרת" : "Frame",
                          he
                            ? `עיגול ${gallery.radius}, גבול ${gallery.border} פיקסלים`
                            : `${gallery.radius}px radius, ${gallery.border}px border`,
                        ],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className={styles.hint}>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="max-w-80">
                      <WebsiteGallery
                        gallery={gallery}
                        locale={locale}
                        preview
                      />
                    </div>
                  </>
                ) : (
                  <p className={styles.hint}>
                    {he
                      ? "הגלריה מוסתרת באתר."
                      : "The gallery is hidden on the website."}
                  </p>
                )}
              </details>
            );
          })}
          <h3 className="font-bold">
            {he ? "תמונות לפי מיקום" : "Images by placement"}
          </h3>
          <ul className={styles.fields}>
            {slots.map((slot) => {
              const override = design.overrides[slot.key];
              const url = override ?? slot.defaultUrl;
              const photo = websiteImageUrlSchema.safeParse(url);
              return (
                <li className={styles.preview} key={slot.key}>
                  <h4 className="font-semibold">{slot.label}</h4>
                  <p className={styles.hint}>
                    {!url
                      ? he
                        ? "אין תמונה בעמוד"
                        : "No image on the page"
                      : override
                        ? he
                          ? "תמונה שפורסמה למיקום זה"
                          : "Published image override"
                        : he
                          ? "תמונת ברירת מחדל"
                          : "Default image"}
                  </p>
                  {photo.success ? (
                    <div className={styles.sourceImage}>
                      <Image
                        src={photo.data}
                        alt={slot.label}
                        fill
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : url ? (
                    <p className={styles.hint}>
                      {he
                        ? "אין תצוגה מקדימה למקור זה."
                        : "Preview unavailable for this image source."}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <Notice tone="warning">
          {he
            ? "לא ניתן לטעון את התמונות שפורסמו. יש לרענן את העמוד כדי לנסות שוב."
            : "Published images could not be loaded. Reload the page to try again."}
        </Notice>
      )}
    </FormSection>
  );
}
