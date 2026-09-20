import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isLocale, locales, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { serviceIcons } from "@/lib/service-content";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  const slugs = ["security-cameras", "alarm-systems", "intercom-access", "network-wifi"];
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "pages.services" });
  const categories = t.raw("categories") as Array<{ id: string; title: string; description: string }>;
  const category = categories.find((item) => item.id === slug);

  if (!category) {
    return pageMetadata({ locale, path: `services/${slug}`, title: "Service not found", noIndex: true });
  }

  return pageMetadata({ locale, path: `services/${slug}`, title: category.title, description: category.description });
}

export default async function ServiceDetailPage({ params }: { params: Params }) {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.services" });
  const common = await getTranslations({ locale, namespace: "common" });
  const categories = t.raw("categories") as Array<{ id: string; title: string; description: string }>;
  const category = categories.find((item) => item.id === slug);

  if (!category) notFound();

  const Icon = serviceIcons[category.id];

  return (
    <section className="miro-section">
      <div className="miro-container max-w-4xl">
        <Link href={withLocale(locale, "services")} className="font-bold text-accent-text">
          {common("viewAll")}
        </Link>
        <div className="miro-card mt-6 p-8">
          {Icon ? <Icon className="mb-6 size-16 text-primary" aria-hidden="true" /> : null}
          <p className="text-sm font-black uppercase tracking-[0.35em] text-muted-foreground">{common("draft")}</p>
          <h1 className="mt-3 text-4xl font-black">{category.title}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{category.description}</p>
          <p className="mt-6 text-muted-foreground">
            {common("ownerReview")}
          </p>
        </div>
      </div>
    </section>
  );
}
