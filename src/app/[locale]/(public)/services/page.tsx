import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
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
  return (
    <>
      <section className="experience-services-hero">
        <div className="miro-container experience-services-hero-inner">
          <div>
            <nav
              className="experience-breadcrumb"
              aria-label={he ? "פירורי לחם" : "Breadcrumb"}
            >
              <Link href={withLocale(locale)}>{he ? "בית" : "Home"}</Link>
              <span>/</span>
              <span>{he ? "שירותים" : "Services"}</span>
            </nav>
            <p className="experience-overline">
              {he
                ? "פתרונות מיגון ותקשורת"
                : "SECURITY & COMMUNICATION SOLUTIONS"}
            </p>
            <h1>
              {he ? (
                <>
                  כל החיבורים.
                  <br />
                  <em>במקום אחד.</em>
                </>
              ) : (
                <>
                  Every connection.
                  <br />
                  <em>One considered plan.</em>
                </>
              )}
            </h1>
            <p className="experience-description">
              {he
                ? "מתכנון הכניסה ועד לכיסוי הרשת. בונים תמונה שלמה של הצרכים שלכם, ומחברים בין הטכנולוגיה הנכונה למרחב הנכון."
                : "From your front entrance to your network coverage. Build a complete picture of what you need and connect the right technology to the right space."}
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
          <ServiceCategoryGrid locale={locale} />
        </div>
      </section>
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
      <FaqSection locale={locale} />
      <ConsultationBand locale={locale} />
    </>
  );
}
