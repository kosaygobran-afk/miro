import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContactPreviewForm } from "@/components/contact/contact-preview-form";
import { FeatureCheck } from "@/components/public/experience-sections";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.contact" });
  return pageMetadata({
    locale,
    path: "contact",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";
  const t = await getTranslations({ locale, namespace: "pages.contact" });
  const product =
    typeof query.product === "string" ? query.product.trim().slice(0, 200) : "";
  const form = {
    name: t("form.name"),
    email: t("form.email"),
    phone: t("form.phone"),
    message: t("form.message"),
    submit: t("form.submit"),
  };
  const initialMessage = product
    ? he
      ? `אשמח לקבל מידע והצעת מחיר עבור: ${product}`
      : `I would like information and a quote for: ${product}`
    : "";

  return (
    <section className="miro-container experience-reading">
      <nav
        className="experience-breadcrumb"
        aria-label={he ? "פירורי לחם" : "Breadcrumb"}
      >
        <Link href={withLocale(locale)}>{he ? "בית" : "Home"}</Link>
        <span>/</span>
        <span>{he ? "יצירת קשר" : "Contact"}</span>
      </nav>
      <div className="experience-contact-layout">
        <div className="experience-contact-copy">
          <p className="experience-overline">
            {he
              ? "מתחילים בחיבור אנושי"
              : "A GOOD CONNECTION STARTS WITH A CONVERSATION"}
          </p>
          <h1>
            {he ? (
              <>
                המרחב שלכם.<em>בואו נדבר עליו.</em>
              </>
            ) : (
              <>
                Your space.<em>Let’s talk about it.</em>
              </>
            )}
          </h1>
          <p className="experience-description">
            {he
              ? "בית חדש, עסק בצמיחה או מערכת שצריכה שדרוג. ספרו לנו מה חשוב לכם, ונבנה את התמונה יחד."
              : "A new home, a growing business or a system that needs an upgrade. Tell us what matters to you and we can start shaping the picture."}
          </p>
          <div className="experience-contact-prep">
            <h2>
              {he ? "מה כדאי להכין לשיחה?" : "A few useful things to prepare"}
            </h2>
            <ul className="experience-checks">
              <FeatureCheck>
                {he
                  ? "סוג הנכס והאזור שבו הוא נמצא"
                  : "The property type and general location"}
              </FeatureCheck>
              <FeatureCheck>
                {he
                  ? "מה תרצו לשפר או לחבר"
                  : "What you would like to improve or connect"}
              </FeatureCheck>
              <FeatureCheck>
                {he
                  ? "פרטים על תשתית או ציוד קיימים"
                  : "Details of existing equipment or infrastructure"}
              </FeatureCheck>
            </ul>
          </div>
          <p className="experience-note">
            {he
              ? "תצוגת הדגמה: הטופס עדיין אינו שולח פניות. אין להזין פרטים אישיים אמיתיים. פרטי קשר מאושרים יתווספו לקראת ההשקה."
              : "Design preview: this form does not send enquiries yet. Please do not enter real personal details. Verified contact details will be added before launch."}
          </p>
          <Link
            href={withLocale(locale, "services")}
            className="experience-text-link mt-6"
          >
            {he
              ? "בינתיים, הכירו את הפתרונות"
              : "Explore the solutions in the meantime"}
          </Link>
        </div>
        <ContactPreviewForm
          key={product}
          labels={form}
          notice={t("notice")}
          initialMessage={initialMessage}
          title={he ? "הפרויקט הבא שלכם" : "Your next project"}
          intro={
            he
              ? "מקום לכל הפרטים שיחברו את התמונה."
              : "Bring the details of your project together."
          }
        />
      </div>
    </section>
  );
}
