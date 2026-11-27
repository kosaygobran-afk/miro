import { Suspense } from "react";
import { WebsitePhotoSection } from "@/components/public/website-photo-section";
import { getWebsitePageCopy } from "@/lib/website-page-copy-server";
import { getPublicWebsiteImages } from "@/lib/website-images-server";
import { ServiceGridSkeleton } from "@/features/catalog/catalog-skeleton";
import Link from "@/components/motion/motion-link";
import { getTranslations } from "next-intl/server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import {
  getPublishedServices,
  PublishedServicesUnavailable,
} from "@/lib/public-services";
import { ServicesUnavailable } from "@/components/public/services-unavailable";
import { BuyerHero } from "@/components/public/buyer-hero";
import { ServiceDirectory } from "@/components/public/service-directory";
import { DirectionArrow } from "@/components/public/experience-sections";
import styles from "@/components/public/buyer-pages.module.css";
import type { WebsiteImages } from "@/lib/website-images";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.services" });
  return pageMetadata({
    locale,
    path: "services",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";

  const websiteImages = getPublicWebsiteImages();
  const pageCopy = await getWebsitePageCopy("services", locale);

  return (
    <>
      <div className={`miro-container ${styles.page}`}>
        <BuyerHero
          copy={pageCopy}
          image="/images/store-design/hero-infrastructure.webp"
        >
          <a href="#expertise" className="miro-button miro-button-primary">
            {he ? "למדריך השירותים" : "Browse services"}{" "}
            <DirectionArrow locale={locale} />
          </a>
          <Link
            className={styles.textLink}
            href={withLocale(locale, "contact")}
          >
            {he ? "פנייה לגבי שירות" : "Ask about a service"}{" "}
            <DirectionArrow locale={locale} />
          </Link>
        </BuyerHero>
        <section
          id="expertise"
          tabIndex={-1}
          className={styles.section}
          aria-labelledby="service-guide-heading"
        >
          <h2 id="service-guide-heading">
            {he ? "מדריך השירותים" : "Service guide"}
          </h2>
          <Suspense
            fallback={
              <ServiceGridSkeleton
                label={he ? "טוען שירותים…" : "Loading services…"}
              />
            }
          >
            <PublishedServiceGrid
              locale={locale}
              services={getPublishedServices()}
              websiteImages={websiteImages}
            />
          </Suspense>
        </section>
      </div>
      <div className={`miro-container ${styles.galleries}`}>
        <WebsitePhotoSection
          placement="services"
          locale={locale}
          settings={websiteImages}
        />
        <WebsitePhotoSection
          placement="serviceDetails"
          locale={locale}
          settings={websiteImages}
        />
      </div>
    </>
  );
}

async function PublishedServiceGrid({
  locale,
  services,
  websiteImages,
}: {
  locale: Locale;
  services: ReturnType<typeof getPublishedServices>;
  websiteImages: Promise<WebsiteImages>;
}) {
  let published;
  try {
    published = await services;
  } catch (error) {
    if (error instanceof PublishedServicesUnavailable)
      return <ServicesUnavailable locale={locale} />;
    throw error;
  }
  if (published.length === 0)
    return (
      <p role="status">
        {locale === "he"
          ? "אין שירותים שפורסמו להצגה כרגע."
          : "No published services are available to display yet."}
      </p>
    );
  return (
    <ServiceDirectory
      services={published}
      locale={locale}
      overrides={(await websiteImages).overrides}
    />
  );
}
