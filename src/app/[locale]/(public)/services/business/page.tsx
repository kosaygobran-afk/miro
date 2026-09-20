import Link from "next/link";
import { Building2, Camera, Network, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isLocale, withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.businessServices" });
  return pageMetadata({ locale, path: "services/business", title: t("title"), description: t("description") });
}

export default async function BusinessServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "he";
  const t = await getTranslations({ locale, namespace: "pages.services.business" });
  const common = await getTranslations({ locale, namespace: "common" });

  return (
    <section className="miro-section">
      <div className="miro-container">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">{common("ownerReview")}</p>
            <h1 className="mt-3 text-4xl font-black">{t("title")}</h1>
            <p className="mt-4 text-xl text-muted-foreground">{t("subtitle")}</p>
            <p className="mt-6 text-muted-foreground">{t("content")}</p>
            <Link href={withLocale(locale, "contact")} className="miro-button miro-button-primary mt-8">
              {common("learnMore")}
            </Link>
          </div>
          <div className="miro-card grid grid-cols-2 gap-4 p-5">
            {[Building2, Camera, Network, Shield].map((Icon, index) => (
              <div key={index} className="grid min-h-36 place-items-center rounded-xl border border-border-subtle bg-background">
                <Icon className="size-14 text-primary" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
