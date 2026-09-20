import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const locales = ['he', 'en'];
  const publicPaths = [
    '',
    'services',
    'services/home',
    'services/business',
    'about',
    'contact',
    'privacy',
    'terms',
    'accessibility',
  ];

  const routes: MetadataRoute.Sitemap = [];

  // Add homepage for each locale
  locales.forEach((locale) => {
    routes.push({
      url: `${baseUrl}/${locale}/`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    });
  });

  // Add other public paths for each locale
  locales.forEach((locale) => {
    publicPaths.forEach((path) => {
      if (path === '') return; // skip empty path as we already added homepage
      routes.push({
        url: `${baseUrl}/${locale}/${path}`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      });
    });
  });

  return routes;
}
