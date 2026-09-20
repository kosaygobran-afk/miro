import { useTranslations } from 'next-intl';
import Link from 'next/link';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

export const generateMetadata = async ({ params }: { params: { locale: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  return {
    title: messages.pages.home.hero.title,
    description: messages.site.description,
  };
};

export default function HomePage() {
  const t = useTranslations('pages.home.hero');

  return (
    <section className="relative bg-background">
      {/* Hero section */}
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="mb-4 text-3xl font-bold text-foreground">
          {t('title')}
        </h1>
        <p className="mb-6 text-lg text-muted-foreground max-w-xl mx-auto">
          {t('subtitle')}
        </p>
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <Link
            href="/contact"
            className="flex-1 bg-primary text-primary-foreground px-6 py-3 rounded-md text-center hover:bg-primary-hover"
          >
            {t('primaryAction')}
          </Link>
          <Link
            href="/services"
            className="flex-1 border border-border-control text-foreground px-6 py-3 rounded-md text-center hover:bg-surface-hover"
          >
            {t('secondaryAction')}
          </Link>
        </div>
      </div>

      {/* Reserved visual area placeholder */}
      <div className="mt-20">
        <div className="mx-auto max-w-4xl min-h-[300px] bg-surface-muted rounded-lg flex items-center justify-center">
          <p className="text-muted-foreground">Visual placeholder for hero image</p>
        </div>
      </div>
    </section>
  );
}