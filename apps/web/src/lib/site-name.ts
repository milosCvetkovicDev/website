/**
 * The site's name: its Open Graph site name, the feed's title and author, and the H1 of
 * `/llms.txt`. `lib/metadata.ts` re-exports it for the head and the feed.
 *
 * It lives here rather than in `metadata.ts` so that `lib/serialise.ts` can read it without that
 * module, which imports `og-image.tsx` and through it `next/og`: the serialiser is part of `/mcp`,
 * the site's one server function, which would otherwise ship the image renderer it never calls.
 */
export const SITE_NAME = 'Milos Cvetkovic';
