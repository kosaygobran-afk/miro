import Link from "next/link";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { withLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { requireAuth, requireRole } from "@/lib/auth";

type PrivateKind = "account" | "worker" | "admin";

export function privateMetadata(kind: PrivateKind) {
  return async ({ params }: { params: Promise<{ locale: string }> }) => {
    const { locale } = await params;
    return pageMetadata({
      locale,
      path: kind,
      title: locale === "he" ? "החשבון שלי" : "Your account",
      description:
        locale === "he"
          ? "גישה מאובטחת לחשבון האישי ולסביבת העבודה."
          : "Secure access to your account and workspace.",
      noIndex: true,
    });
  };
}

export async function PrivateClosedPage({
  kind,
  locale,
}: {
  kind: PrivateKind;
  locale: Locale;
}) {
  if (kind === "account") {
    await requireAuth(locale);
  } else if (kind === "worker") {
    await requireRole(locale, ["worker"]);
  } else {
    await requireRole(locale, ["admin", "ceo"]);
  }
  const t = await getTranslations({ locale, namespace: "pages.protected" });

  return (
    <section className="miro-section">
      <div className="miro-container max-w-xl">
        <div className="miro-card p-8 text-center">
          <Lock
            className="mx-auto mb-5 size-14 text-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-black uppercase tracking-[0.24em] text-accent-text">
            {t("title")}
          </p>
          <h1 className="mt-3 text-3xl font-black">{t(kind)}</h1>
          <p className="mt-4 text-muted-foreground">{t("body")}</p>
          <Link
            href={withLocale(locale, "login")}
            className="miro-button miro-button-primary mt-7"
          >
            {t("login")}
          </Link>
        </div>
      </div>
    </section>
  );
}
