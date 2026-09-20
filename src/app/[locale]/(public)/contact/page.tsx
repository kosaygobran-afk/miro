import { useTranslations } from 'next-intl';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

export const generateMetadata = async ({ params }: { params: { locale: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  return {
    title: messages.pages.contact.title,
    description: messages.site.description,
  };
};

export default function ContactPage() {
  const t = useTranslations('pages.contact');
  const tf = useTranslations('pages.contact.form');

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="mb-4 text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mb-6 text-lg text-muted-foreground">{t('subtitle')}</p>
        
        {/* Form preview - non-functional in development */}
        <div className="bg-surface rounded-lg p-6">
          <h2 className="mb-4 text-xl font-bold text-foreground">{tf('name')}</h2>
          <p className="text-muted-foreground">
            This form is a development preview. Form submission is not available in this setup.
            In production, this form would submit an enquiry to MIRO.
          </p>
          <div className="mt-4 p-4 bg-border-subtle rounded">
            <p className="text-muted-foreground">
              <strong>{tf('name')}:</strong> John Doe<br />
              <strong>{tf('email')}:</strong> john@example.com<br />
              <strong>{tf('phone')}:</strong> 050-1234567<br />
              <strong>{tf('message')}:</strong> I am interested in security camera installation for my home.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}