import type { MetadataRoute } from 'next';
import { caseStudies } from '@/data/case-studies';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

// Every `lastmod` is a content date: `STATIC_ROUTE_UPDATED` for the static routes and each case
// study's `updatedAt`. It used to be the build clock on every entry, which told crawlers the whole
// site changed on every deploy, and they learn to ignore a field that says that.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: STATIC_ROUTE_UPDATED['/'],
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: STATIC_ROUTE_UPDATED['/about'],
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/work`,
      lastModified: STATIC_ROUTE_UPDATED['/work'],
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/skills`,
      lastModified: STATIC_ROUTE_UPDATED['/skills'],
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // No /blog while it is a Coming Soon placeholder: the page is noindex (`blog/page.tsx`), and a
    // sitemap offering it would contradict that. Add it back when the first post ships, together
    // with deleting `index: false` there.
    {
      url: `${baseUrl}/contact`,
      lastModified: STATIC_ROUTE_UPDATED['/contact'],
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];

  const caseStudyPages: MetadataRoute.Sitemap = caseStudies.map((cs) => ({
    url: `${baseUrl}/work/${cs.slug}`,
    lastModified: cs.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticPages, ...caseStudyPages];
}
