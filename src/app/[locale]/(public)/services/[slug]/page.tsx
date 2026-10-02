import Link from "@/components/motion/motion-link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getPublishedServiceBySlug } from "@/lib/public-services";
import { serviceIcons } from "@/lib/service-content";
import {
  ConsultationBand,
  DirectionArrow,
  FeatureCheck,
} from "@/components/public/experience-sections";

type Params = Promise<{ locale: string; slug: string }>;

// This page reads request-time locale/session context through the shared layout.
// New published services must render immediately without a static path list.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const service = await getPublishedServiceBySlug(slug);

  if (!service) {
    return pageMetadata({
      locale,
      path: `services/${slug}`,
      title: "Service not found",
      noIndex: true,
    });
  }

  return pageMetadata({
    locale,
    path: `services/${slug}`,
    title:
      locale === "he"
        ? (service.seo_title_he ?? service.name_he)
        : (service.seo_title_en ?? service.name_en),
    description:
      locale === "he"
        ? (service.seo_description_he ??
          service.short_description_he ??
          service.description_he ??
          "")
        : (service.seo_description_en ??
          service.short_description_en ??
          service.description_en ??
          ""),
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Params;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";

  const service = await getPublishedServiceBySlug(slug);

  if (!service) notFound();

  const Icon = serviceIcons[service.slug];

  // Extract considerations from service content (process_steps or features)
  const considerations =
    service.content?.process_steps?.map((step) =>
      locale === "he" ? step.title_he : step.title_en,
    ) ??
    service.content?.features?.map((feature) =>
      locale === "he" ? feature.text_he : feature.text_en,
    ) ??
    [];

  return (
    <>
      <section className="miro-container experience-reading">
        <nav
          className="experience-breadcrumb"
          aria-label={he ? "פירורי לחם" : "Breadcrumb"}
        >
          <Link href={withLocale(locale)}>{he ? "בית" : "Home"}</Link>
          <span>/</span>
          <Link href={withLocale(locale, "services")}>
            {he ? "פתרונות" : "Solutions"}
          </Link>
          <span>/</span>
          <span>{locale === "he" ? service.name_he : service.name_en}</span>
        </nav>
        <div className="experience-detail-layout">
          <div className="experience-reading-heading">
            <p className="experience-overline">
              {he
                ? "פתרון שמתחיל בהבנה"
                : "A SOLUTION THAT STARTS WITH UNDERSTANDING"}
            </p>
            <h1>{locale === "he" ? service.name_he : service.name_en}</h1>
            <p className="experience-description">
              {locale === "he"
                ? (service.short_description_he ?? service.description_he ?? "")
                : (service.short_description_en ??
                  service.description_en ??
                  "")}
            </p>
            <div className="experience-contact-prep">
              <h2>{he ? "מה מביאים בחשבון?" : "What goes into the plan?"}</h2>
              <ul className="experience-checks">
                {considerations.map((point, index) => (
                  <FeatureCheck key={`${point}-${index}`}>{point}</FeatureCheck>
                ))}
                {service.content?.faq?.map((faq, index) => (
                  <FeatureCheck key={`faq-${index}`}>
                    {locale === "he" ? faq.question_he : faq.question_en}
                  </FeatureCheck>
                ))}
              </ul>
            </div>
            {service.content?.cta && (
              <Link
                href={withLocale(locale, service.content.cta.href)}
                className="experience-text-link mt-6"
              >
                {he ? service.content.cta.text_he : service.content.cta.text_en}
                <DirectionArrow locale={locale} />
              </Link>
            )}
            {!service.content?.cta && (
              <Link
                href={withLocale(locale)}
                className="experience-text-link mt-6"
              >
                {he
                  ? "לגלות את קולקציית המוצרים"
                  : "Explore the product collection"}
                <DirectionArrow locale={locale} />
              </Link>
            )}
          </div>
          <aside className="experience-detail-aside">
            {Icon && (
              <span className="experience-icon">
                <Icon aria-hidden="true" />
              </span>
            )}
            {service.image_url && (
              <Image
                src={service.image_url}
                alt=""
                width={400}
                height={300}
                className="experience-service-image"
                aria-hidden="true"
              />
            )}
            <h2>
              {he ? "בונים את התמונה יחד." : "Bring the picture together."}
            </h2>
            <p>
              {he
                ? "ספרו לנו על המבנה, הציוד הקיים ומה תרצו לשפר. אלה הפרטים שיעזרו לתכנן את הצעד הבא."
                : "Tell us about your space, your current equipment and what you would like to improve. These details shape the next step."}
            </p>
            <Link
              href={withLocale(locale, "contact")}
              className="miro-button miro-button-primary"
            >
              {he ? "לתכנון הפרויקט" : "Plan your project"}
              <DirectionArrow locale={locale} />
            </Link>
          </aside>
        </div>
      </section>
      <ConsultationBand locale={locale} />
    </>
  );
}
