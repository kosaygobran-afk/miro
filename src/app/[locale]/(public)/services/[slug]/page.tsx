import { useLocale } from 'next-intl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

export const generateMetadata = async ({ params }: { params: { locale: string; slug: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  const category = messages.pages.services.categories.find((cat) => cat.id === params.slug);
  if (!category) {
    // If category not found, we still want to return some metadata to avoid errors, but the page will show notFound.
    // We'll return a generic title.
    return {
      title: 'Service Not Found',
      description: '',
    };
  }
  return {
    title: category.title,
    description: messages.site.description,
  };
};

export default function ServiceDetailPage({ params: { slug } }: { params: { slug: string } }) {
  const locale = useLocale();
  const messages = locale === 'en' ? enMessages : heMessages;
  const categories = messages.pages.services.categories;
  const category = categories.find((cat) => cat.id === slug);

  if (!category) {
    notFound();
  }

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">{category.title}</h1>
          <Link
            href="/services"
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back to Services
          </Link>
        </div>
        <p className="mb-6 text-lg text-muted-foreground">{category.description}</p>
        
        {/* Placeholder for service details */}
        <div className="bg-surface rounded-lg p-6">
          <h2 className="mb-4 text-xl font-bold text-foreground">Service Details</h2>
          <p className="text-muted-foreground">
            Detailed information about this service package, including equipment options, installation process, and pricing.
          </p>
        </div>
      </div>
    </section>
  );
}