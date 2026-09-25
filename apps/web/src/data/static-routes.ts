/**
 * When the visible content of each static route last changed, as ISO dates (`YYYY-MM-DD`). The
 * sitemap sends them as `lastmod`; a crawler that sees every page claim to change on every deploy
 * learns to ignore the field. Bump a route's date by hand in the commit that changes what it says.
 * A case study's dates live on its entry in `case-studies.ts`.
 *
 * From git, the last commit to change what each route visibly says: `/`, /about and /work
 * 2026-09-25 (the self-healing agent's RETIRED badge and past-tense copy), /skills and /contact
 * 2026-09-23 (d1da60f, #116, which changed the hero subtitle and the eyebrows) and /blog 2026-01-27
 * (696c2ef). The later commits to /blog changed only formatting, colour tokens, metadata or Open
 * Graph images.
 */
export const STATIC_ROUTE_UPDATED = {
  '/': '2026-09-25',
  '/about': '2026-09-25',
  '/work': '2026-09-25',
  '/skills': '2026-09-23',
  '/blog': '2026-01-27',
  '/contact': '2026-09-23',
} as const satisfies Record<string, string>;

export type StaticRoute = keyof typeof STATIC_ROUTE_UPDATED;
