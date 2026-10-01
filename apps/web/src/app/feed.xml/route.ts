import { publishedPosts } from '@/data/posts';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { ATOM_CONTENT_TYPE, buildAtomFeed } from '@/lib/atom';

// Prerendered at build time, as every handler here is: a `GET` handler is dynamic by default since
// Next 15, and would deploy as a server function serving the same bytes (`pnpm check:build-output`
// fails that build). Keep this export while the site does not set `cacheComponents`: Cache
// Components removes the `dynamic` segment option, and adopting it means moving this handler to
// `'use cache'`, not deleting the line.
export const dynamic = 'force-static';

// Built with no post published too, as a valid feed with no entries; `buildMetadata()` advertises
// it only once one is (#61, ADR 0028).
export function GET() {
  // Production when the variable is unset or blank, as the sitemap, robots and the twins fall back.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://miloscvetkovic.dev';
  const body = buildAtomFeed(publishedPosts, {
    siteUrl,
    fallbackUpdated: STATIC_ROUTE_UPDATED['/blog'],
  });
  return new Response(body, { headers: { 'Content-Type': ATOM_CONTENT_TYPE } });
}
