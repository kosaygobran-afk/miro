import Link from "next/link";
import { Layers3, ScanLine, SlidersHorizontal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  ConsultationBand,
  DirectionArrow,
} from "@/components/public/experience-sections";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.about" });
  return pageMetadata({
    locale,
    path: "about",
    title: t("title"),
    description: t("description"),
  });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";
  const values = he
    ? [
        {
          Icon: ScanLine,
          title: "מתחילים מהתמונה המלאה",
          copy: "איך נכנסים, איפה עובדים ואילו חיבורים כבר קיימים. כל פרט במרחב עוזר לבנות תכנית טובה יותר.",
        },
        {
          Icon: SlidersHorizontal,
          title: "מתאימים את הטכנולוגיה",
          copy: "הפתרון צריך להתאים לשימוש, לתקציב ולסביבה. המטרה היא מערכת שנוחה לחיות ולעבוד איתה.",
        },
        {
          Icon: Layers3,
          title: "חושבים על החיבור הבא",
          copy: "תכנון מסודר מביא בחשבון גם תחזוקה, שינויים וצמיחה. כך אפשר לקבל החלטות עם מבט קדימה.",
        },
      ]
    : [
        {
          Icon: ScanLine,
          title: "Start with the full picture",
          copy: "How people enter, where they work and what is already connected. Every detail helps shape a more considered plan.",
        },
        {
          Icon: SlidersHorizontal,
          title: "Make the technology fit",
          copy: "A solution should fit the use, the budget and the environment. The aim is a system that feels natural to live and work with.",
        },
        {
          Icon: Layers3,
          title: "Think about what comes next",
          copy: "Good planning makes room for maintenance, change and growth, helping you make decisions with the future in view.",
        },
      ];
  return (
    <>
      <section className="miro-container experience-reading">
        <nav
          className="experience-breadcrumb"
          aria-label={he ? "פירורי לחם" : "Breadcrumb"}
        >
          <Link href={withLocale(locale)}>{he ? "בית" : "Home"}</Link>
          <span>/</span>
          <span>{he ? "אודות" : "About"}</span>
        </nav>
        <div className="experience-reading-heading">
          <p className="experience-overline">
            {he ? "נעים להכיר. מירו." : "MEET MIRO"}
          </p>
          <h1>
            {he ? (
              <>
                טכנולוגיה שמחברת.<em>אנשים שבמרכז.</em>
              </>
            ) : (
              <>
                Technology that connects.<em>People at the centre.</em>
              </>
            )}
          </h1>
          <p className="experience-description">
            {he
              ? "הבית, העסק והדברים שחשובים לכם. מירו מחברת בין עולמות המיגון והתקשורת, עם גישה שמתחילה בהבנת המרחב וממשיכה לתכנון שלם."
              : "Your home, your business and the things that matter to you. MIRO brings security and communications together, with an approach that starts by understanding the space."}
          </p>
        </div>
        <div className="experience-values">
          {values.map(({ Icon, title, copy }) => (
            <article className="experience-value" key={title}>
              <span className="experience-icon">
                <Icon aria-hidden="true" />
              </span>
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="experience-section-heading">
          <div>
            <p className="experience-overline">
              {he
                ? "מיגון. כניסה. תקשורת."
                : "SECURITY. ACCESS. COMMUNICATIONS."}
            </p>
            <h2 className="experience-heading">
              {he
                ? "כל חלק חשוב. החיבור ביניהם עוד יותר."
                : "Every part matters. The connection matters more."}
            </h2>
            <p className="experience-description">
              {he
                ? "מצלמות אבטחה, מערכות אזעקה, אינטרקום ורשתות הן חלקים של אותה תמונה. כשמתכננים אותן יחד, אפשר להבין טוב יותר מה באמת דרוש למרחב שלכם."
                : "Cameras, alarm systems, intercoms and networks are parts of the same picture. Considering them together makes it easier to understand what your space really needs."}
            </p>
          </div>
        </div>
        <Link
          href={withLocale(locale, "services")}
          className="experience-text-link"
        >
          {he ? "להכיר את תחומי השירות" : "Explore our service areas"}
          <DirectionArrow locale={locale} />
        </Link>
        <p className="experience-note mt-8">
          {he
            ? "עמוד בהכנה: פרטי החברה, הצוות ופרויקטים נבחרים יתווספו לאחר אישור בעל העסק."
            : "Page in preparation: company details, team profiles and selected projects will be added after business-owner approval."}
        </p>
      </section>
      <ConsultationBand locale={locale} />
    </>
  );
}
