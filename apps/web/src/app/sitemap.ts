import type { MetadataRoute } from 'next';
import { caseStudies } from '@/data/case-studies';
import { hasPublishedPosts, publishedPosts } from '@/data/posts';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

/** The later of `YYYY-MM-DD` days, which compare as strings. */
const latest = (days: readonly string[]): string => days.reduce((a, b) => (b > a ? b : a));

// Every `lastmod` is a content date: `STATIC_ROUTE_UPDATED` for the static routes, each case
// study's and each post's `updatedAt`, and for /blog the latest of its own date and its posts'. It
// used to be the build clock on every entry, which told crawlers the whole site changed on every
// deploy, and they learn to ignore a field that says that.
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
    // /blog only once a post is published (`hasPublishedPosts`, ADR 0028, #61). Until then it is a
    // noindex Coming Soon placeholder (`blog/page.tsx`), and a sitemap offering it would contradict
    // that. It lists the posts, so it last changed on the latest of its own date and their updates.
    ...(hasPublishedPosts
      ? [
          {
            url: `${baseUrl}/blog`,
            lastModified: latest([
              STATIC_ROUTE_UPDATED['/blog'],
              ...publishedPosts.map((post) => post.updatedAt),
            ]),
            changeFrequency: 'weekly' as const,
            priority: 0.6,
          },
        ]
      : []),
    {
      url: `${baseUrl}/contact`,
      lastModified: STATIC_ROUTE_UPDATED['/contact'],
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: STATIC_ROUTE_UPDATED['/privacy'],
      changeFrequency: 'yearly',
      priority: 0.1,
    },
  ];

  const caseStudyPages: MetadataRoute.Sitemap = caseStudies.map((cs) => ({
    url: `${baseUrl}/work/${cs.slug}`,
    lastModified: cs.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  // Empty while no post is published; drafts are never in `publishedPosts`.
  const postPages: MetadataRoute.Sitemap = publishedPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticPages, ...caseStudyPages, ...postPages];
}
