import { useLocale } from 'next-intl';
import Link from 'next/link';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

export const generateMetadata = async ({ params }: { params: { locale: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  return {
    title: messages.pages.services.title,
    description: messages.site.description,
  };
};

export default function ServicesPage() {
  const locale = useLocale();
  const messages = locale === 'en' ? enMessages : heMessages;
  const categories = messages.pages.services.categories;

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-bold text-foreground">{messages.pages.services.title}</h1>
        <p className="mb-8 text-lg text-muted-foreground">{messages.pages.services.subtitle}</p>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {categories.map((category: (typeof categories)[number]) => (
            <Link
              key={category.id}
              href={`/services/${category.id}`}
              className="bg-surface rounded-lg p-6 hover:bg-surface-hover transition-colors"
            >
              <h2 className="mb-3 text-xl font-bold text-foreground">{category.title}</h2>
              <p className="text-muted-foreground flex-1">{category.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
