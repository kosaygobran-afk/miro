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
import {
  CapabilityStrip,
  ConnectedSystem,
  ConsultationBand,
  DirectionArrow,
  FaqSection,
  ProcessSteps,
  ServiceCategoryGrid,
  SolutionCards,
} from "@/components/public/experience-sections";

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

  // Fetch published services from database
  const services = getPublishedServices();
  const websiteImages = getPublicWebsiteImages();
  const pageCopy = await getWebsitePageCopy("services", locale);

  return (
    <>
      <section className="experience-services-hero">
        <div className="miro-container experience-services-hero-inner">
          <div data-page-heading-copy>
            <nav
              className="experience-breadcrumb"
              aria-label={he ? "פירורי לחם" : "Breadcrumb"}
            >
              <Link href={withLocale(locale)}>{he ? "בית" : "Home"}</Link>
              <span>/</span>
              <span>{he ? "שירותים" : "Services"}</span>
            </nav>
            <p className="experience-overline">
              {pageCopy.eyebrow}
            </p>
            <h1>
              {pageCopy.title}
              <br />
              <em>{pageCopy.accent}</em>
            </h1>
            <p className="experience-description">
              {pageCopy.description}
            </p>
            <div className="experience-actions">
              <Link
                href={withLocale(locale, "contact")}
                className="miro-button miro-button-primary"
              >
                {he ? "לתכנון הפרויקט שלכם" : "Plan your project"}
                <DirectionArrow locale={locale} />
              </Link>
              <a href="#expertise" className="experience-text-link">
                {he ? "לגלות את השירותים" : "Explore the services"}
              </a>
            </div>
          </div>
          <ConnectedSystem locale={locale} />
        </div>
      </section>
      <div className="experience-capability-band">
        <div className="miro-container">
          <CapabilityStrip locale={locale} />
        </div>
      </div>
      <section className="experience-section" id="expertise">
        <div className="miro-container">
          <div className="experience-section-heading">
            <div>
              <p className="experience-overline">
                {he ? "תחומי המומחיות" : "OUR EXPERTISE"}
              </p>
              <h2 className="experience-heading">
                {he
                  ? "כל פרט מחובר לתמונה הגדולה."
                  : "Every detail connects to the bigger picture."}
              </h2>
            </div>
            <p className="experience-description">
              {he
                ? "ארבעה תחומים משלימים. תכנון אחד שמתחשב בכולם."
                : "Four complementary disciplines. One plan that considers them all."}
            </p>
          </div>
          <Suspense
            fallback={
              <ServiceGridSkeleton
                label={he ? "טוען שירותים…" : "Loading services…"}
              />
            }
          >
            <PublishedServiceGrid locale={locale} services={services} />
          </Suspense>
        </div>
      </section>
      <Suspense>
        <WebsitePhotoSection
          placement="services"
          locale={locale}
          settings={websiteImages}
        />
      </Suspense>
      <section className="experience-section experience-muted-section">
        <div className="miro-container">
          <div className="experience-section-heading">
            <div>
              <p className="experience-overline">
                {he ? "מתאימים למרחב שלכם" : "SHAPED AROUND YOUR SPACE"}
              </p>
              <h2 className="experience-heading">
                {he ? "מה חשוב לכם לחבר?" : "What would you like to connect?"}
              </h2>
            </div>
          </div>
          <SolutionCards locale={locale} />
        </div>
      </section>
      <section className="experience-section">
        <div className="miro-container">
          <div className="experience-section-heading">
            <div>
              <p className="experience-overline">
                {he ? "הדרך לפרויקט שלכם" : "THE PATH TO YOUR PROJECT"}
              </p>
              <h2 className="experience-heading">
                {he
                  ? "מהשיחה הראשונה לתכנית ברורה."
                  : "From a first conversation to a clear plan."}
              </h2>
            </div>
          </div>
          <ProcessSteps locale={locale} />
        </div>
      </section>
      <Suspense>
        <WebsitePhotoSection
          placement="serviceDetails"
          locale={locale}
          settings={websiteImages}
        />
      </Suspense>
      <FaqSection locale={locale} />
      <ConsultationBand locale={locale} />
    </>
  );
}

async function PublishedServiceGrid({
  locale,
  services,
}: {
  locale: Locale;
  services: ReturnType<typeof getPublishedServices>;
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
    <div className="motion-content-reveal">
      <ServiceCategoryGrid locale={locale} services={published} />
    </div>
  );
}
