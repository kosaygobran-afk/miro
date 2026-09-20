import { useTranslations } from 'next-intl';
import Link from 'next/link';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

export const generateMetadata = async ({ params }: { params: { locale: string } }) => {
  const messages = params.locale === 'en' ? enMessages : heMessages;
  return {
    title: messages.pages.auth['forgot-password'].title,
    description: messages.site.description,
  };
};

export default function ForgotPasswordPage() {
  const t = useTranslations('pages.auth.forgot-password');

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="bg-surface rounded-lg p-6">
          <h1 className="mb-4 text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mb-6 text-lg text-muted-foreground">{t('subtitle')}</p>
          
          {/* Form preview - non-functional in development */}
          <form className="space-y-4">
            <div>
              <label className="block mb-2 text-muted-foreground font-medium">{t('form.email')}</label>
              <input type="email" placeholder={t('form.email')} className="w-full px-4 py-2 border border-border-control rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button type="submit" className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary-hover disabled:opacity-50">
              {t('form.submit')}
            </button>
          </form>
          
          {/* Development preview notice */}
          <div className="mt-6 p-4 bg-border-subtle rounded text-sm text-muted-foreground">
            <p>
              <strong>Development Preview:</strong> Authentication is not available in this setup.
              In production, this form would send a password reset link to your email.
            </p>
          </div>
          
          {/* Link to login */}
          <div className="mt-4 text-center">
            <p className="text-muted-foreground">
              Remember your password?{' '}
              <Link href="/auth/login" className="text-foreground hover:underline">
                {t('pages.auth.login.title')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}