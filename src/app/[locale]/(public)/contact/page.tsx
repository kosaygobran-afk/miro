import Link from "@/components/motion/motion-link";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { ContactForm } from "@/components/contact/contact-form";
import {
  DirectionArrow,
  FeatureCheck,
} from "@/components/public/experience-sections";
import { getPublicContactConfig } from "@/lib/contact-config";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { getWebsitePageCopy } from "@/lib/website-page-copy-server";
import {
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";

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
  const formCopy = {
    name: t("form.name"),
    email: t("form.email"),
    phone: t("form.phone"),
    message: t("form.message"),
    messageHint: t("form.messageHint"),
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
  const { phone, phoneHref, whatsapp, email } = contactConfig;
  const methods = [
    ...(phone && phoneHref
      ? [
          {
            label: t("phoneAction"),
            value: phone,
            valueDirection: "ltr" as const,
            href: `tel:${phoneHref}`,
            Icon: Phone,
          },
        ]
      : []),
    ...(whatsapp
      ? [
          {
            label: t("whatsappAction"),
            value: t("whatsappHint"),
            href: `https://wa.me/${whatsapp}`,
            Icon: MessageCircle,
            external: true,
          },
        ]
      : []),
    ...(email
      ? [
          {
            label: t("emailAction"),
            value: email,
            valueDirection: "ltr" as const,
            href: `mailto:${email}`,
            Icon: Mail,
          },
        ]
      : []),
  ];
  const hasDirectContact = methods.length > 0 || Boolean(address || hours);

  return (
    <section className="miro-container experience-reading experience-contact-page">
      <nav
        className="experience-breadcrumb"
        aria-label={he ? "פירורי לחם" : "Breadcrumb"}
      >
        <Link href={withLocale(locale, "home")}>{he ? "בית" : "Home"}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{he ? "יצירת קשר" : "Contact"}</span>
      </nav>
      <div className="experience-contact-layout">
        <header className="experience-contact-copy" data-page-heading-copy>
          <p className="experience-overline">{pageCopy.eyebrow}</p>
          <h1>
            {pageCopy.title} <em>{pageCopy.accent}</em>
          </h1>
          <p className="experience-description">{pageCopy.description}</p>
          {hasDirectContact ? (
            <a
              className="experience-text-link experience-contact-jump"
              href="#contact-direct"
            >
              {t("directTitle")} <DirectionArrow locale={locale} />
            </a>
          ) : null}
        </header>
        <ContactForm
          key={JSON.stringify([productId, variantId, contextItem])}
          locale={locale}
          copy={formCopy}
          source={contextItem ? "product_page" : "contact_page"}
          productId={productId}
          variantId={variantId}
          contextLine={
            contextItem
              ? t.rich("form.productContext", {
                  item: () => <bdi>{contextItem}</bdi>,
                })
              : null
          }
          title={t("form.title")}
          intro={t("form.intro")}
        />
        {hasDirectContact ? (
          <section
            className="experience-contact-direct"
            id="contact-direct"
            tabIndex={-1}
            aria-labelledby="contact-direct-title"
          >
            <h2 id="contact-direct-title">{t("directTitle")}</h2>
            {methods.length > 0 ? (
              <ul className="experience-contact-methods" role="list">
                {methods.map(
                  ({ label, value, valueDirection, href, Icon, external }) => (
                    <li key={href}>
                      <a
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                      >
                        <span className="experience-contact-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <span className="experience-contact-method-copy">
                          <strong>{label}</strong>
                          <bdi dir={valueDirection}>{value}</bdi>
                        </span>
                        {external ? (
                          <ExternalLink className="size-4" aria-hidden="true" />
                        ) : (
                          <DirectionArrow locale={locale} />
                        )}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            ) : null}
            {address || hours ? (
              <dl className="experience-contact-details">
                {address ? (
                  <div>
                    <dt>
                      <MapPin aria-hidden="true" />
                      {t("addressLabel")}
                    </dt>
                    <dd>
                      <bdi>{address}</bdi>
                    </dd>
                  </div>
                ) : null}
                {hours ? (
                  <div>
                    <dt>
                      <Clock aria-hidden="true" />
                      {t("hoursLabel")}
                    </dt>
                    <dd>
                      <bdi>{hours}</bdi>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </section>
        ) : null}
        <section
          className="experience-contact-prep"
          aria-labelledby="contact-prep-title"
        >
          <div className="experience-contact-prep-heading">
            <h2 id="contact-prep-title">{t("prep.title")}</h2>
            <Link
              href={withLocale(locale, "services")}
              className="experience-text-link"
            >
              {t("prep.servicesLink")} <DirectionArrow locale={locale} />
            </Link>
          </div>
          <ul className="experience-checks" role="list">
            <FeatureCheck>{t("prep.location")}</FeatureCheck>
            <FeatureCheck>{t("prep.goal")}</FeatureCheck>
            <FeatureCheck>{t("prep.equipment")}</FeatureCheck>
          </ul>
        </section>
      </div>
    </section>
  );
}
