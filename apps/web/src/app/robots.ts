import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

  // No Disallow: `/_next/` holds the CSS, scripts and fonts a crawler needs to render a page, and
  // the app has no `/api/` segment. Add a rule only for a path the site actually serves.
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
