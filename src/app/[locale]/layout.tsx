import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
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
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{try{const k='miro-theme';const s=localStorage.getItem(k);const m=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=s||(m?'dark':'light')}catch{document.documentElement.dataset.theme='dark'}})();",
          }}
        />
      </head>
      <body>
        <Header locale={locale} />
        <main className="miro-main">{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
