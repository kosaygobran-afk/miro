import type { Locale } from "@/lib/i18n";
import type { WEBSITE_GALLERY_KEYS } from "@/lib/website-images";
import { getPublicWebsiteImages } from "@/lib/website-images-server";
import { WebsiteGallery } from "./website-gallery";
import styles from "./website-gallery.module.css";

const copy = {
  home: {
    he: {
      title: "מירו בשטח",
      description:
        "לפני שקודחים או מעבירים כבל, בודקים היכן יותקן כל רכיב ואיך הוא יתחבר לציוד הקיים. בתמונות תוכלו לראות את הכלים, הציוד ועבודת ההתקנה של מירו.",
    },
    en: {
      title: "MIRO on site",
      description:
        "Before a cable goes in, each device needs a location, a power source and a route back to the network. See the tools, equipment and installation work behind a MIRO project.",
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
      className={
        placement === "home"
          ? "experience-section experience-muted-section"
          : styles.projectPanel
      }
      aria-labelledby={titleId}
    >
      <div
        className={
          placement === "home"
            ? `miro-container ${styles.section}`
            : styles.projectGallery
        }
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
