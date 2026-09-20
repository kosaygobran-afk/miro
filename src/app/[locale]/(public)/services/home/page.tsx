import { useTranslations } from 'next-intl';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

export const generateMetadata = async ({ params }: { params: { locale: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  return {
    title: messages.pages.services.home.title,
    description: messages.site.description,
  };
};

export default function HomeServicesPage() {
  const t = useTranslations('pages.services.home');

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-4 text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mb-6 text-lg text-muted-foreground">{t('subtitle')}</p>
        <div className="prose prose-lg text-muted-foreground max-w-none">
          <p>{t('content')}</p>
        </div>
      </div>
    </section>
  );
}