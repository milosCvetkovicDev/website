/**
 * When the visible content of each static route last changed, as ISO dates (`YYYY-MM-DD`). The
 * sitemap sends them as `lastmod`; a crawler that sees every page claim to change on every deploy
 * learns to ignore the field. Bump a route's date by hand in the commit that changes what it says.
 * A case study's dates live on its entry in `case-studies.ts`.
 *
 * TODO(milos): confirm. From git, the last visible change to each: /about and /contact 2026-02-23
 * (7d31606, "Go live"), /blog 2026-01-27 (696c2ef). `/`, /work, /skills and /contact changed again
 * in the 2026-09-23 SEO pull request (the hero subtitle and the eyebrows), so they carry that day:
 * bump them to the day it merges.
 */
export const STATIC_ROUTE_UPDATED = {
  '/': '2026-09-23',
  '/about': '2026-02-23',
  '/work': '2026-09-23',
  '/skills': '2026-09-23',
  '/blog': '2026-01-27',
  '/contact': '2026-09-23',
} as const satisfies Record<string, string>;

export type StaticRoute = keyof typeof STATIC_ROUTE_UPDATED;
