import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('layout.footer');

  const getCurrentYear = () => {
    return new Date().getFullYear();
  };

  const footerLinks = [
    { href: '/', label: t('links.home') },
    { href: '/services', label: t('links.services') },
    { href: '/about', label: t('links.about') },
    { href: '/contact', label: t('links.contact') },
    { href: '/privacy', label: t('links.privacy') },
    { href: '/terms', label: t('links.terms') },
    { href: '/accessibility', label: t('links.accessibility') },
  ];

  return (
    <footer className="border-t border-border-control mt-20">
      <div className="mx-auto flex max-w-7xl flex-col items-center px-6 py-10 text-center">
        <div className="space-x-8 md:space-x-12 mb-6">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <p className="text-muted-foreground">
          {t('copyright', { year: getCurrentYear() })}
        </p>
      </div>
    </footer>
  );
}
