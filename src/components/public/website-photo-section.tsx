import type { Locale } from "@/lib/i18n";
import type { WEBSITE_GALLERY_KEYS } from "@/lib/website-images";
import { getPublicWebsiteImages } from "@/lib/website-images-server";
import { WebsiteGallery } from "./website-gallery";
import styles from "./website-gallery.module.css";

const copy = {
  home: {
    he: {
      title: "מירו בשטח",
      description: "מהכנת הציוד ועד החיבור האחרון. כך נראית העבודה שלנו בשטח.",
    },
    en: {
      title: "MIRO on site",
      description:
        "From preparing the equipment to making the final connection, see how we work on site.",
    },
  },
  services: {
    he: {
      title: "מצלמות ואבטחה בשטח",
      description: "מצלמות חוץ, צגים ומערכות אזעקה. מבט מקרוב על ציוד המיגון.",
    },
    en: {
      title: "Security systems on site",
      description:
        "Outdoor cameras, displays and alarm systems. A closer look at security equipment.",
    },
  },
  serviceDetails: {
    he: {
      title: "מה עומד מאחורי החיבור",
      description: "הכנת הציוד, חיווט הרשת וארונות התקשורת שמחברים את המערכת.",
    },
    en: {
      title: "Behind the connection",
      description:
        "Equipment preparation, network wiring and the cabinets that bring the system together.",
    },
  },
};

export async function WebsitePhotoSection({
  placement,
  locale,
  settings,
}: {
  placement: (typeof WEBSITE_GALLERY_KEYS)[number];
  locale: Locale;
  settings: ReturnType<typeof getPublicWebsiteImages>;
}) {
  const gallery = (await settings).galleries[placement];
  if (gallery.images.length === 0) return null;
  const text = copy[placement][locale];
  const titleId = `website-photos-${placement}`;
  return (
    <section
      className="experience-section experience-muted-section"
      aria-labelledby={titleId}
    >
      <div
        className={`miro-container ${styles.section}`}
        data-media-start={placement === "serviceDetails" || undefined}
      >
        <div className={styles.intro}>
          <h2 id={titleId} className="experience-heading">
            {text.title}
          </h2>
          <p className="experience-description">{text.description}</p>
        </div>
        <WebsiteGallery gallery={gallery} locale={locale} />
      </div>
    </section>
  );
}
