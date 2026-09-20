import './globals.css';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

// We'll create these components later
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export const generateMetadata = async ({ params }: { params: { locale: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  return {
    title: {
      template: `%s | ${messages.layout.header.logo}`,
      default: `${messages.layout.header.logo} - Security & Communications`,
    },
    description: messages.site.description || 'MIRO provides professional security and communications installations in Israel.',
    alternates: {
      languages: {
        en: '/en',
        he: '/he',
      },
    },
  };
};

export const generateStaticParams = async () => {
  return [{ locale: 'he' }, { locale: 'en' }];
};

export default function RootLocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const messages = useMessages();

  // Determine text direction based on locale
  const isRTL = locale === 'he';

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'}>
      <body className={isRTL ? 'rtl' : 'ltr'}>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <NextIntlClientProvider messages={messages} locale={locale}>
            <Header />
            <main className="min-h-screen">{children}</main>
            <Footer />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
