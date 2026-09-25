import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  CircuitBoard,
  ClipboardCheck,
  ScanLine,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProductsClient } from "@/components/products/ProductsClient";
import { ProductSubNav } from "@/components/products/ProductSubNav";
import { SecurityComposition } from "@/components/products/ProductVisual";
import { isLocale, withLocale } from "@/lib/i18n";
import { storeCopy } from "@/features/catalog/store-copy";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import type { Locale } from "@/lib/i18n";
import { getStoreCatalog, getStoreViewer } from "@/lib/store-data";

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

export async function generateMetadata({
  params,
}: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.products" });
  return pageMetadata({
    locale: locale as Locale,
    path: "store",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ProductsPage({
  params,
  searchParams,
}: ProductsPageProps) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const copy = storeCopy[locale];
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;

  const viewer = await getStoreViewer();
  const catalog = await getStoreCatalog(locale, viewer.role);
  const savedProductIds = new Set(viewer.savedProductIds);

  const categories = catalog.categories.map((category) => ({
    ...category,
    href: `/${locale}${category.href}`,
  }));
  const assuranceIcons = [ScanLine, CircuitBoard, ClipboardCheck, Building2];
  const initialQuery = typeof query.q === "string" ? query.q.slice(0, 200) : "";

  return (
    <div className="sf-storefront">
      <section className="sf-hero" aria-labelledby="store-title">
        <div className="sf-hero-image">
          <Image
            src="/images/security-studio.png"
            alt=""
            fill
            sizes="(max-width: 700px) 100vw, 75vw"
            preload
          />
        </div>
        <div className="sf-hero-grid" aria-hidden="true" />
        <div className="miro-container sf-hero-inner">
          <div className="sf-hero-copy">
            <p className="sf-eyebrow">
              <span />
              {copy.eyebrow}
            </p>
            <h1 id="store-title">
              {copy.title}
              <span>{copy.titleAccent}</span>
            </h1>
            <p className="sf-hero-intro">{copy.intro}</p>
            <div className="sf-hero-actions">
              <a
                href="#store-items"
                className="miro-button miro-button-primary"
              >
                {copy.browse}
                <Arrow size={18} aria-hidden="true" />
              </a>
              <Link
                href={withLocale(locale, "contact")}
                className="sf-hero-secondary"
              >
                {copy.consult}
                <Arrow size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="sf-hero-signature" aria-hidden="true">
              <span>SECURE.</span>
              <span>SMART.</span>
              <span>CONNECTED.</span>
            </div>
          </div>
          <span className="sf-hero-caption">MIRO SYSTEMS / COLLECTION 01</span>
        </div>
      </section>

      <ProductSubNav categories={categories} ariaLabel={copy.category} />

      <section
        className="sf-collection-section"
        id="store-items"
        aria-labelledby="collection-title"
      >
        <div className="miro-container">
          <div className="sf-section-heading">
            <div>
              <p className="sf-eyebrow">{copy.catalogLabel}</p>
              <h2 id="collection-title">{copy.collection}</h2>
            </div>
            <p>{copy.collectionText}</p>
          </div>
          <ProductsClient
            key={initialQuery}
            products={catalog.products}
            categories={catalog.categories}
            locale={locale}
            initialQuery={initialQuery}
            savedProductIds={Array.from(savedProductIds)}
          />
          <p className="sf-preview-note">
            <span aria-hidden="true" />
            {copy.demo}
          </p>
        </div>
      </section>

      <section className="sf-bundle-section">
        <div className="miro-container">
          <div className="sf-bundle">
            <div className="sf-bundle-copy">
              <p className="sf-eyebrow">{copy.bundleEyebrow}</p>
              <h2>{copy.bundleTitle}</h2>
              <p>{copy.bundleText}</p>
              <div className="sf-bundle-tags">
                {copy.bundleTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <Link
                href={withLocale(locale, "services/business")}
                className="miro-button miro-button-primary"
              >
                {copy.bundleAction}
                <Arrow size={17} aria-hidden="true" />
              </Link>
            </div>
            <SecurityComposition />
            <span className="sf-bundle-watermark" aria-hidden="true">
              MIRO.
            </span>
          </div>
          <div className="sf-assurance-grid">
            {copy.assurance.map((item, index) => {
              const Icon = assuranceIcons[index];
              return (
                <div className="sf-assurance" key={item.title}>
                  <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sf-guide-section">
        <div className="miro-container">
          <div className="sf-section-heading">
            <div>
              <p className="sf-eyebrow">
                {locale === "he"
                  ? "מחשבה לפני הטכנולוגיה"
                  : "PURPOSE BEFORE TECHNOLOGY"}
              </p>
              <h2>{copy.quickTitle}</h2>
            </div>
            <p>{copy.quickText}</p>
          </div>
          <div className="sf-guide-grid">
            {copy.buying.map((item) => (
              <article className="sf-guide-card" key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <div className="sf-guide-rule" aria-hidden="true" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sf-faq-section">
        <div className="miro-container sf-faq-layout">
          <div>
            <p className="sf-eyebrow">{copy.faqEyebrow}</p>
            <h2>{copy.faqTitle}</h2>
            <Link href={withLocale(locale, "contact")} className="sf-text-link">
              {copy.consult}
              <Arrow size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="sf-faq-list">
            {copy.faqs.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <ChevronDown size={19} aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
