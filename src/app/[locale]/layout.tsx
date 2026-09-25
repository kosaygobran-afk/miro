import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { notFound } from "next/navigation";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";
import "@/styles/premium.css";
import "@/styles/experience.css";
import "@/styles/storefront.css";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { RecoveryRedirect } from "@/components/auth/recovery-redirect";
import { SiteChrome } from "@/components/layout/site-chrome";
import "@/styles/workspace.css";
import {
  getDirection,
  getMessages,
  isLocale,
  locales,
  type Locale,
} from "@/lib/i18n";
import { getSiteUrl, localizedUrl } from "@/lib/seo";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  display: "swap",
  variable: "--font-miro",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "he";
  const messages = getMessages(locale);

  return {
    title: {
      template: `%s | ${messages.site.name}`,
      default: messages.site.defaultTitle,
    },
    description: messages.site.description,
    metadataBase: new URL(getSiteUrl()),
    alternates: {
      canonical: localizedUrl(locale),
      languages: Object.fromEntries(
        locales.map((item) => [item, localizedUrl(item)]),
      ),
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale: Locale = rawLocale;
  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={heebo.variable}
      suppressHydrationWarning
    >
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{try{const k='miro-theme';const themes=['dark','medium','light'];const saved=localStorage.getItem(k);const prefersDark=matchMedia('(prefers-color-scheme: dark)').matches;const prefersLight=matchMedia('(prefers-color-scheme: light)').matches;let preferred=saved&&themes.includes(saved)?saved:(prefersDark?'dark':(prefersLight?'light':'medium'));document.documentElement.dataset.theme=preferred;}catch{document.documentElement.dataset.theme='dark';}})();",
          }}
        />
      </head>
      <body>
        <RecoveryRedirect locale={locale} />
        <a className="premium-skip-link" href="#main-content">
          {locale === "he" ? "דילוג לתוכן הראשי" : "Skip to main content"}
        </a>
        <SiteChrome>
          <Header locale={locale} />
        </SiteChrome>
        <main id="main-content" tabIndex={-1} className="miro-main">
          {children}
        </main>
        <SiteChrome>
          <Footer locale={locale} />
        </SiteChrome>
        {process.env.VERCEL ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
