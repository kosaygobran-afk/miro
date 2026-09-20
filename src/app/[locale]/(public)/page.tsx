import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { processSteps, faqs, serviceIcons } from "@/lib/service-content";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";

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
  const [t, services, common] = await Promise.all([
    getTranslations({ locale, namespace: "pages.home" }),
    getTranslations({ locale, namespace: "pages.services" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const categories = services.raw("categories") as Array<{
    id: string;
    title: string;
    description: string;
  }>;
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;

  return (
    <>
      <section className="miro-hero">
        <div className="miro-hero-media" aria-hidden="true">
          <Image
            src="/images/security-studio.png"
            alt=""
            fill
            sizes="(max-width: 639px) 100vw, (max-width: 1279px) 75vw, 960px"
            preload
            className="miro-hero-image"
          />
        </div>
        <div className="miro-container miro-hero-inner">
          <div className="miro-hero-copy">
            <p className="miro-eyebrow">
              <span />
              {t("hero.eyebrow")}
            </p>
            <h1 className="miro-text-balance miro-hero-title">
              {t("hero.title")}
            </h1>
            <p className="miro-hero-description">{t("hero.subtitle")}</p>
            <div className="miro-hero-actions">
              <Link
                href={withLocale(locale, "contact")}
                className="miro-button miro-button-primary"
              >
                {t("hero.primaryAction")}
                <Arrow className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={withLocale(locale, "services")}
                className="miro-button miro-button-secondary"
              >
                {t("hero.secondaryAction")}
              </Link>
            </div>
          </div>
        </div>
        <div className="miro-hero-caption miro-container">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("hero.caption")}
        </div>
      </section>

      <section className="miro-section">
        <div className="miro-container">
          <div className="miro-section-heading">
            <h2 className="miro-heading">{t("categoriesTitle")}</h2>
            <Link
              href={withLocale(locale, "services")}
              className="flex items-center gap-2 font-bold text-accent-text"
            >
              {common("viewAll")}{" "}
              <Arrow className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="miro-service-grid">
            {categories.map((category) => {
              const Icon = serviceIcons[category.id] || LockKeyhole;
              return (
                <Link
                  key={category.id}
                  href={withLocale(locale, `services/${category.id}`)}
                  className="miro-card miro-service-card group"
                >
                  <div className="miro-service-symbols">
                    <Icon
                      className="miro-service-icon text-foreground"
                      aria-hidden="true"
                    />
                    <Arrow
                      className="size-5 text-primary transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="miro-card-title">{category.title}</h3>
                  <p className="miro-card-description">
                    {category.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="miro-business-band border-y border-border-subtle">
        <div className="miro-container miro-business-inner">
          <p className="miro-band-label">Business Security Solutions</p>
          <div>
            <h2 className="miro-heading">{t("businessBandTitle")}</h2>
            <p className="mt-2 text-muted-foreground">
              {t("businessBandText")}
            </p>
          </div>
          <Link
            href={withLocale(locale, "services/business")}
            className="miro-button miro-button-primary justify-self-start lg:justify-self-end"
          >
            {common("learnMore")}
          </Link>
        </div>
      </section>

      <section className="miro-section">
        <div className="miro-container miro-details-grid">
          <div>
            <h2 className="miro-heading mb-5">{t("processTitle")}</h2>
            <div className="grid gap-3">
              {processSteps[locale].map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-5 border-b border-border-subtle py-5"
                >
                  <span className="miro-step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-bold">{step}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="miro-heading mb-5">{t("faqTitle")}</h2>
            <div className="space-y-3">
              {faqs[locale].map(([question, answer]) => (
                <details
                  key={question}
                  className="border-b border-border-subtle py-5"
                >
                  <summary className="cursor-pointer font-black">
                    {question}
                  </summary>
                  <p className="mt-2 text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="miro-contact-band miro-section">
        <div className="miro-container grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="miro-heading">{t("ctaTitle")}</h2>
            <p className="mt-2 text-muted-foreground">{t("ctaText")}</p>
          </div>
          <Link
            className="miro-button miro-button-primary"
            href={withLocale(locale, "contact")}
          >
            {t("hero.primaryAction")}
            <Arrow className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
