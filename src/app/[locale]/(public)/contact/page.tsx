import Link from "@/components/motion/motion-link";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { ContactForm } from "@/components/contact/contact-form";
import { FeatureCheck } from "@/components/public/experience-sections";
import { getPublicContactConfig } from "@/lib/contact-config";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getWebsitePageCopy } from "@/lib/website-page-copy-server";
import { Mail, MessageCircle, Phone } from "lucide-react";

const uuidSchema = z.string().uuid();

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim().slice(0, 200) : "";
}

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

async function getProductDisplayName(
  productId: string,
  locale: Locale,
): Promise<string | null> {
  try {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("name_he, name_en")
      .eq("id", productId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    const name = locale === "he" ? data.name_he : data.name_en;
    return (typeof name === "string" && name.trim()) || null;
  } catch {
    return null;
  }
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    product?: string | string[];
    variant?: string | string[];
    item?: string | string[];
  }>;
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const he = locale === "he";

  const productRaw = firstParam(query.product);
  const variantRaw = firstParam(query.variant);
  const itemRaw = firstParam(query.item);
  const productParsed = uuidSchema.safeParse(productRaw);
  const variantParsed = uuidSchema.safeParse(variantRaw);
  const productId = productParsed.success ? productParsed.data : null;
  const variantId = variantParsed.success ? variantParsed.data : null;

  const [t, contactConfig, productName, pageCopy] = await Promise.all([
    getTranslations({ locale, namespace: "pages.contact" }),
    getPublicContactConfig(),
    productId ? getProductDisplayName(productId, locale) : null,
    getWebsitePageCopy("contact", locale),
  ]);

  const contextItem =
    productName ?? (itemRaw || (productRaw && !productId ? productRaw : ""));
  const hasProductContext = Boolean(contextItem);
  const source = hasProductContext ? "product_page" : "contact_page";
  const contextLine = contextItem
    ? t("form.productContext", { item: contextItem })
    : null;

  const formCopy = {
    name: t("form.name"),
    email: t("form.email"),
    phone: t("form.phone"),
    message: t("form.message"),
    company: t("form.company"),
    submit: t("form.submit"),
    sending: t("form.sending"),
    success: t("form.success"),
    invalidInput: t("form.invalidInput"),
    rateLimited: t("form.rateLimited"),
    unavailable: t("form.unavailable"),
    errors: {
      name: t("form.errors.name"),
      email: t("form.errors.email"),
      phone: t("form.errors.phone"),
      message: t("form.errors.message"),
    },
  };

  const address = he ? contactConfig.addressHe : contactConfig.addressEn;
  const hours = he ? contactConfig.hoursHe : contactConfig.hoursEn;
  const hasDirectContact = Boolean(
    contactConfig.phoneHref ||
    contactConfig.whatsapp ||
    contactConfig.email ||
    address ||
    hours,
  );

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
        <div className="experience-contact-copy" data-page-heading-copy>
          <p className="experience-overline">
            {pageCopy.eyebrow}
          </p>
          <h1>
            {pageCopy.title}
            <em>{pageCopy.accent}</em>
          </h1>
          <p className="experience-description">
            {pageCopy.description}
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
          {hasDirectContact ? (
            <section
              className="experience-contact-prep"
              aria-labelledby="contact-direct-title"
            >
              <h2 id="contact-direct-title">{t("directTitle")}</h2>
              <ul className="experience-contact-methods">
                {contactConfig.phone && contactConfig.phoneHref ? (
                  <li>
                    <a
                      className="experience-text-link"
                      href={`tel:${contactConfig.phoneHref}`}
                      dir="ltr"
                    >
                      <Phone size={17} aria-hidden="true" />
                      <span>{contactConfig.phone}</span>
                    </a>
                  </li>
                ) : null}
                {contactConfig.whatsapp ? (
                  <li>
                    <a
                      className="experience-text-link"
                      href={`https://wa.me/${contactConfig.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={17} aria-hidden="true" />
                      <span>{t("whatsappAction")}</span>
                    </a>
                  </li>
                ) : null}
                {contactConfig.email ? (
                  <li>
                    <a
                      className="experience-text-link"
                      href={`mailto:${contactConfig.email}`}
                      dir="ltr"
                    >
                      <Mail size={17} aria-hidden="true" />
                      <span>{contactConfig.email}</span>
                    </a>
                  </li>
                ) : null}
              </ul>
              {address ? <p className="experience-note">{address}</p> : null}
              {hours ? <p className="experience-note">{hours}</p> : null}
            </section>
          ) : null}
          <Link
            href={withLocale(locale, "services")}
            className="experience-text-link mt-6"
          >
            {he
              ? "בינתיים, הכירו את הפתרונות"
              : "Explore the solutions in the meantime"}
          </Link>
        </div>
        <ContactForm
          key={contextItem || "general"}
          locale={locale}
          copy={formCopy}
          source={source}
          productId={productId}
          variantId={variantId}
          contextLine={contextLine}
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
