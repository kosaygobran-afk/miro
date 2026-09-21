import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isLocale, locales, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { serviceIcons } from "@/lib/service-content";
import {
  ConsultationBand,
  DirectionArrow,
  FeatureCheck,
} from "@/components/public/experience-sections";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  const slugs = [
    "security-cameras",
    "alarm-systems",
    "intercom-access",
    "network-wifi",
  ];
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "pages.services" });
  const categories = t.raw("categories") as Array<{
    id: string;
    title: string;
    description: string;
  }>;
  const category = categories.find((item) => item.id === slug);

  if (!category) {
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
    title: category.title,
    description: category.description,
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Params;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.services" });
  const categories = t.raw("categories") as Array<{
    id: string;
    title: string;
    description: string;
  }>;
  const category = categories.find((item) => item.id === slug);

  if (!category) notFound();

  const Icon = serviceIcons[category.id];

  const he = locale === "he";
  const considerations: Record<string, { he: string[]; en: string[] }> = {
    "security-cameras": {
      he: [
        "מגדירים מה חשוב לראות ובאילו שעות",
        "מתאימים זוויות צילום ותנאי תאורה",
        "מתכננים הקלטה והרשאות גישה תוך שמירה על פרטיות",
      ],
      en: [
        "Define what you need to see and when",
        "Consider viewing angles and lighting conditions",
        "Plan recording and access permissions with privacy in mind",
      ],
    },
    "alarm-systems": {
      he: [
        "ממפים פתחים ואזורי גישה",
        "מתאימים גלאים לשגרת השימוש",
        "בוחנים תשתית קיימת ואפשרויות הרחבה",
      ],
      en: [
        "Map entrances and access areas",
        "Match sensors to everyday use",
        "Review existing infrastructure and expansion options",
      ],
    },
    "intercom-access": {
      he: [
        "בודקים התאמה לדלת ולתשתית",
        "מגדירים משתמשים והרשאות כניסה",
        "משלבים את הכניסה בתכנון המערכת הכוללת",
      ],
      en: [
        "Check compatibility with your door and wiring",
        "Define users and access permissions",
        "Bring entry management into the wider system plan",
      ],
    },
    "network-wifi": {
      he: [
        "ממפים אזורי עבודה ומכשירים מחוברים",
        "מתכננים כיסוי לפי המבנה והעומס",
        "בוחנים כבילה, מתגים ונקודות גישה",
      ],
      en: [
        "Map work areas and connected devices",
        "Plan coverage around the layout and demand",
        "Consider cabling, switches and access points",
      ],
    },
  };
  const points = considerations[slug][locale];
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
          <span>{category.title}</span>
        </nav>
        <div className="experience-detail-layout">
          <div className="experience-reading-heading">
            <p className="experience-overline">
              {he
                ? "פתרון שמתחיל בהבנה"
                : "A SOLUTION THAT STARTS WITH UNDERSTANDING"}
            </p>
            <h1>{category.title}</h1>
            <p className="experience-description">{category.description}</p>
            <div className="experience-contact-prep">
              <h2>{he ? "מה מביאים בחשבון?" : "What goes into the plan?"}</h2>
              <ul className="experience-checks">
                {points.map((point) => (
                  <FeatureCheck key={point}>{point}</FeatureCheck>
                ))}
              </ul>
            </div>
            <p className="experience-description">
              {he
                ? "כל מרחב שונה. המפרט הסופי, התאמת הציוד ואופן ההתקנה נקבעים לאחר בירור הצרכים ובדיקת התשתית."
                : "Every space is different. The final specification, equipment compatibility and installation approach depend on your requirements and existing infrastructure."}
            </p>
            <Link
              href={withLocale(locale, "store")}
              className="experience-text-link mt-6"
            >
              {he
                ? "לגלות את קולקציית המוצרים"
                : "Explore the product collection"}
              <DirectionArrow locale={locale} />
            </Link>
          </div>
          <aside className="experience-detail-aside">
            {Icon && (
              <span className="experience-icon">
                <Icon aria-hidden="true" />
              </span>
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
