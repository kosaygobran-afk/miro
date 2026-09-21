import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import {
  CapabilityStrip,
  ConnectedSystem,
  ConsultationBand,
  DirectionArrow,
  FaqSection,
  FeatureCheck,
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
  const t = await getTranslations({ locale, namespace: "metadata.home" });
  return pageMetadata({
    locale,
    title: t("title"),
    description: t("description"),
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";

  return (
    <>
      <section className="experience-hero">
        <div className="experience-hero-media" aria-hidden="true">
          <Image
            src="/images/security-studio.png"
            alt=""
            fill
            sizes="100vw"
            preload
            className="experience-hero-image"
          />
        </div>
        <div className="miro-container experience-hero-inner">
          <div className="experience-hero-copy">
            <p className="experience-overline">
              <span className="experience-live-dot" />
              {he
                ? "מיגון. תקשורת. שקט בראש."
                : "SECURITY. CONNECTION. PEACE OF MIND."}
            </p>
            <h1>
              {he ? (
                <>
                  העולם שלכם.
                  <br />
                  <em>בטוח יותר.</em>
                  <br />
                  מחובר יותר.
                </>
              ) : (
                <>
                  Your world.
                  <br />
                  <em>More secure.</em>
                  <br />
                  More connected.
                </>
              )}
            </h1>
            <p className="experience-hero-description">
              {he
                ? "מצלמות, אזעקות, בקרת כניסה ורשתות. פתרונות חכמים שמתחברים לבית שלכם, לעסק שלכם ולדרך שבה אתם חיים."
                : "Cameras, alarms, smart access and networks. Thoughtful solutions for your home, your business and the way you live."}
            </p>
            <div className="experience-actions">
              <Link
                href={withLocale(locale, "store")}
                className="miro-button miro-button-primary"
              >
                {he ? "לגלות את המוצרים" : "Explore the collection"}
                <DirectionArrow locale={locale} />
              </Link>
              <Link
                href={withLocale(locale, "contact")}
                className="miro-button miro-button-secondary"
              >
                {he ? "נתכנן את הפרויקט שלכם" : "Plan your project"}
              </Link>
            </div>
            <div className="experience-hero-meta">
              <ShieldCheck aria-hidden="true" />
              <span>
                {he
                  ? "מיגון חכם מתחיל בתכנון נכון"
                  : "Smarter security starts with a considered plan"}
              </span>
            </div>
          </div>
          <span className="experience-hero-side" lang="en" dir="ltr">
            SECURE / SMART / CONNECTED
          </span>
          <div className="experience-hero-bottom">
            <a href="#solutions">
              {he ? "כל החיבורים מתחילים כאן" : "Discover what connects us"}
              <ArrowDown aria-hidden="true" />
            </a>
            <small>
              {he ? "הציוד להמחשה בלבד" : "Equipment shown for illustration"}
            </small>
          </div>
        </div>
      </section>
      <section
        className="experience-category-strip"
        aria-label={he ? "תחומי המומחיות" : "Explore our expertise"}
      >
        <div className="miro-container">
          <ServiceCategoryGrid locale={locale} compact />
        </div>
      </section>
      <section className="experience-section" id="solutions">
        <div className="miro-container">
          <div className="experience-section-heading">
            <div>
              <p className="experience-overline">
                {he ? "המרחב שלכם. הפתרון שלכם." : "YOUR SPACE. YOUR SOLUTION."}
              </p>
              <h2 className="experience-heading">
                {he
                  ? "לכל מרחב יש את החיבור הנכון."
                  : "The right connection for every space."}
              </h2>
            </div>
            <Link
              className="experience-text-link"
              href={withLocale(locale, "services")}
            >
              {he ? "לכל הפתרונות" : "All solutions"}
              <DirectionArrow locale={locale} />
            </Link>
          </div>
          <SolutionCards locale={locale} />
        </div>
      </section>
      <section className="experience-system-section">
        <div className="miro-container experience-system-layout">
          <div className="experience-system-copy">
            <p className="experience-overline">
              {he ? "רואים את התמונה הגדולה" : "THE BIGGER PICTURE"}
            </p>
            <h2 className="experience-heading">
              {he ? (
                <>
                  טכנולוגיה חכמה.
                  <br />
                  <span>חיבורים פשוטים.</span>
                </>
              ) : (
                <>
                  Smart technology.
                  <br />
                  <span>Simple connections.</span>
                </>
              )}
            </h2>
            <p className="experience-description">
              {he
                ? "מערכת טובה מתחילה בחיבור בין כל הפרטים. בוחנים יחד את המצלמות, הכניסות והתשתיות, כדי לבנות תכנית שמתאימה למרחב שלכם גם בהמשך."
                : "A good system connects the details. Consider cameras, entrances and infrastructure together, with a plan built around your space and what comes next."}
            </p>
            <ul className="experience-checks">
              <FeatureCheck>
                {he
                  ? "תכנון שמתחשב בתשתית הקיימת"
                  : "Planning that considers your existing infrastructure"}
              </FeatureCheck>
              <FeatureCheck>
                {he
                  ? "מפרט שמתאים לשימוש ולתקציב"
                  : "A specification shaped around use and budget"}
              </FeatureCheck>
              <FeatureCheck>
                {he
                  ? "חשיבה על הרחבה ותחזוקה בהמשך"
                  : "Room for future expansion and maintenance"}
              </FeatureCheck>
            </ul>
            <Link
              href={withLocale(locale, "services/business")}
              className="experience-text-link"
            >
              {he ? "לפתרונות לעסק" : "Explore business solutions"}
              <DirectionArrow locale={locale} />
            </Link>
          </div>
          <ConnectedSystem locale={locale} />
        </div>
      </section>
      <section className="experience-section">
        <div className="miro-container">
          <div className="experience-section-heading">
            <div>
              <p className="experience-overline">
                {he ? "מהרעיון למערכת" : "FROM IDEA TO INSTALLATION"}
              </p>
              <h2 className="experience-heading">
                {he
                  ? "תהליך מסודר. מהחיבור הראשון."
                  : "A clear process. From the first connection."}
              </h2>
            </div>
            <p className="experience-description">
              {he
                ? "ארבעה שלבים שהופכים שאלות לתכנית ברורה."
                : "Four considered steps from your first questions to a clear plan."}
            </p>
          </div>
          <ProcessSteps locale={locale} />
        </div>
      </section>
      <div className="experience-capability-band">
        <div className="miro-container">
          <CapabilityStrip locale={locale} />
        </div>
      </div>
      <FaqSection locale={locale} />
      <ConsultationBand locale={locale} />
    </>
  );
}
