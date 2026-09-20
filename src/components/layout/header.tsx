import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { usePathname, useRouter } from 'next/navigation';
import { Sun, Moon } from 'lucide-react';

export function Header() {
  const t = useTranslations('layout.header');
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const isDark = theme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const toggleLanguage = () => {
    const targetLocale = locale === 'he' ? 'en' : 'he';
    const pathParts = pathname.split('/');
    pathParts[1] = targetLocale;
    const newPath = pathParts.join('/');
    router.push(newPath);
  };

  const navLinks = [
    { href: '/', label: t('nav.home') },
    { href: '/services', label: t('nav.services') },
    { href: '/about', label: t('nav.about') },
    { href: '/contact', label: t('nav.contact') },
  ];

  return (
    <header className="border-b border-border-control bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <span className="text-xl font-bold text-foreground">
            {t('logo')}
          </span>
        </div>

        {/* Navigation */}
        <div className="hidden md:flex space-x-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'text-muted-foreground hover:text-foreground',
                pathname === link.href ? 'text-foreground underline' : '',
              ].join(' ')}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-4">
          {/* Request Quote Button */}
          <Link
            href="/contact"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary-hover"
          >
            {t('actions.requestQuote')}
          </Link>

          {/* Account Link (placeholder) */}
          <Link
            href="/account"
            className="text-muted-foreground hover:text-foreground"
          >
            {t('actions.account')}
          </Link>

          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('actions.languageSwitch')}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t('actions.themeToggle')}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}