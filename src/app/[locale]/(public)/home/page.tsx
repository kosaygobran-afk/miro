import Image from "next/image";
import Link from "@/components/motion/motion-link";
import { getTranslations } from "next-intl/server";
import { BuyerHero } from "@/components/public/buyer-hero";
import { DirectionArrow } from "@/components/public/experience-sections";
import { WebsitePhotoSection } from "@/components/public/website-photo-section";
import styles from "@/components/public/buyer-pages.module.css";
import { storeCopy } from "@/features/catalog/store-copy";
import { StoreLiveRefresh } from "@/features/catalog/store-live-refresh";
import { StoreHeroBackdrop } from "@/features/store-design/store-hero-backdrop";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getStoreNavigationCategories } from "@/lib/store-data";
import { HOME_HERO_IMAGE } from "@/lib/website-images";
import { getPublicWebsiteImages } from "@/lib/website-images-server";
import { getWebsitePageCopy } from "@/lib/website-page-copy-server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.home" });
  return pageMetadata({
    locale,
    path: "home",
    title: t("title"),
    description: t("description"),
  });
}

const equipment = [
  {
    key: "cameras",
    image: "security",
    en: [
      "Cameras & recording",
      "Start with the view you need at each entrance. Then match the camera to the lighting, recording time and recorder inputs.",
    ],
    he: [
      "מצלמות והקלטה",
      "התחילו במה שחשוב לראות בכל כניסה. התאימו את המצלמה לתאורה במקום, למשך השמירה הרצוי ולחיבורים במכשיר ההקלטה.",
    ],
  },
  {
    key: "access-control-intercom",
    image: "access",
    en: [
      "Intercom & entry",
      "Who answers the door, and from where? Check the existing lock, wiring and indoor screen before choosing a door station.",
    ],
    he: [
      "אינטרקום ובקרת כניסה",
      "מי עונה כשמצלצלים בדלת, ומאיפה? לפני בחירת יחידת חוץ כדאי לבדוק את סוג המנעול, החיווט והמסך הקיים בתוך המבנה.",
    ],
  },
  {
    key: "switches-networking",
    image: "network",
    en: [
      "Networks & Wi-Fi",
      "Count the rooms, floors and wired devices. A router connects to the internet, a switch adds wired ports and an access point extends Wi-Fi coverage.",
    ],
    he: [
      "רשתות ו־Wi-Fi",
      "ספרו את החדרים, הקומות והמכשירים שזקוקים לחיבור קווי. נתב מחבר לאינטרנט, מתג מוסיף חיבורים ונקודת גישה מרחיבה את הכיסוי האלחוטי.",
    ],
  },
] as const;

export default async function HomePage({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";
  const websiteImages = getPublicWebsiteImages();
  const [images, homeCopy, collectionCopy, categories] = await Promise.all([
    websiteImages,
    getWebsitePageCopy("home", locale),
    getWebsitePageCopy("store", locale),
    getStoreNavigationCategories(locale),
  ]);
  const closingImage = images.overrides["home-hero"] ?? HOME_HERO_IMAGE;
  const catalogHref = `${withLocale(locale)}#store-items`;
  const collectionActions = storeCopy[locale];

  return (
    <>
      <StoreLiveRefresh reconcilePromotions={false} />
      <section
        className="sf-storefront sf-hero"
        aria-labelledby="home-collection-title"
      >
        <StoreHeroBackdrop locale={locale} />
        <div className="sf-hero-grid" aria-hidden="true" />
        <div className="miro-container sf-hero-inner">
          <div className="sf-hero-copy" data-page-heading-copy>
            <p className="sf-eyebrow sf-store-eyebrow">
              <span aria-hidden="true" />
              {collectionCopy.eyebrow}
            </p>
            <h1 id="home-collection-title">
              {collectionCopy.title} <span>{collectionCopy.accent}</span>
            </h1>
            <p className="sf-hero-intro">{collectionCopy.description}</p>
            <div className="sf-hero-actions">
              <Link
                href={catalogHref}
                className="miro-button miro-button-primary"
              >
                {collectionActions.browse}
                <DirectionArrow locale={locale} className="size-[18px]" />
              </Link>
              <Link
                href={withLocale(locale, "contact")}
                className="sf-hero-secondary"
              >
                {collectionActions.consult}
                <DirectionArrow locale={locale} className="size-[17px]" />
              </Link>
            </div>
            <div className="sf-hero-signature" aria-hidden="true">
              <span>SECURE.</span>
              <span>SMART.</span>
              <span>CONNECTED.</span>
            </div>
          </div>
          <span className="sf-hero-caption">MIRO GROUP / COLLECTION 01</span>
        </div>
      </section>
      <div className="miro-container">
        <section className={styles.section} aria-labelledby="equipment-heading">
          <h2 id="equipment-heading">
            {he
              ? "איזה ציוד מתאים למרחב שלכם?"
              : "Which equipment fits your space?"}
          </h2>
          <div className={styles.equipmentGrid}>
            {equipment.map((item) => {
              const [title, description] = item[locale];
              const category = categories.find(({ key }) => key === item.key);
              return (
                <article key={item.key} className={styles.equipment}>
                  <div className={styles.equipmentImage}>
                    <Image
                      src={`/images/store-design/hero-${item.image}.webp`}
                      alt=""
                      fill
                      sizes="(max-width: 700px) 95vw, 32vw"
                    />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  {category && (
                    <Link
                      className={styles.textLink}
                      href={withLocale(
                        locale,
                        `store/${encodeURIComponent(category.key)}`,
                      )}
                    >
                      {he ? "לקטגוריית" : "Browse"} {category.label}{" "}
                      <DirectionArrow locale={locale} />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <WebsitePhotoSection
        placement="home"
        locale={locale}
        settings={websiteImages}
      />
      <div className={`miro-container ${styles.closing}`}>
        <BuyerHero
          copy={homeCopy}
          image={closingImage}
          fullImage
          headingLevel={2}
        >
          <Link href={catalogHref} className="miro-button miro-button-primary">
            {he ? "למוצרים בחנות" : "Shop equipment"}{" "}
            <DirectionArrow locale={locale} />
          </Link>
          <Link
            href={withLocale(locale, "services")}
            className={styles.textLink}
          >
            {he ? "השירותים שלנו" : "Explore services"}{" "}
            <DirectionArrow locale={locale} />
          </Link>
        </BuyerHero>
      </div>
    </>
  );
}
