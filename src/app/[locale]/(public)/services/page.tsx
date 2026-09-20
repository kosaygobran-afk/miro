import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { serviceIcons } from "@/lib/service-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.services" });
  return pageMetadata({
    locale,
    path: "services",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.services" });
  const common = await getTranslations({ locale, namespace: "common" });
  const categories = t.raw("categories") as Array<{
    id: string;
    title: string;
    description: string;
  }>;
  const Arrow = locale === "he" ? ArrowLeft : ArrowRight;

  return (
    <section className="miro-section">
      <div className="miro-container">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">
          {common("draft")}
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black text-foreground">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
          {t("subtitle")}
        </p>

        <div className="miro-service-grid miro-service-grid-wide mt-8">
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
                    className="size-6 text-primary transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="miro-card-title">{category.title}</h2>
                <p className="miro-card-description">{category.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
