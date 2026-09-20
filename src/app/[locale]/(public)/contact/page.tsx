import { getTranslations } from "next-intl/server";
import { ContactPreviewForm } from "@/components/contact/contact-preview-form";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.contact" });
  return pageMetadata({ locale, path: "contact", title: t("title"), description: t("description") });
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages.contact" });
  const form = {
    name: t("form.name"),
    email: t("form.email"),
    phone: t("form.phone"),
    message: t("form.message"),
    submit: t("form.submit"),
  };

  return (
    <section className="miro-section">
      <div className="miro-container grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <h1 className="text-4xl font-black">{t("title")}</h1>
          <p className="mt-4 text-xl text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-6 rounded-lg border border-border-subtle bg-surface-muted p-4 text-sm text-muted-foreground">{t("notice")}</p>
        </div>
        <ContactPreviewForm labels={form} notice={t("notice")} />
      </div>
    </section>
  );
}
