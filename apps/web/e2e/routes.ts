import { caseStudies } from '../src/data/case-studies';

/**
 * The one route list every e2e spec reads.
 *
 * Before this file, `console-clean.spec.ts` kept its own array and `accessibility.spec.ts` audited a
 * hand-picked two, while `src/app/sitemap.ts` restated the static six a third time. Three copies of
 * one fact: a route added to the app reached at most one of them. The static routes are still written
 * out by hand here — they are the App Router's own directory layout and nothing exports them — but
 * they are written out *once*, and the case studies are derived from the data file, so a new case
 * study reaches every gate without touching a spec.
 *
 * The *source* side stays separate: `src/app/sitemap.ts` lists the static routes itself, dated from
 * `src/data/static-routes.ts`, because a module under `src/app` importing from `e2e/` would ship the
 * spec directory into the build. `src/app/__tests__/sitemap.test.ts` asserts the two agree.
 */

/** The six routes the header navigation links to, in its order (`components/navigation.tsx`). */
export const NAV_ROUTES = ['/', '/about', '/work', '/skills', '/blog', '/contact'] as const;

/**
 * The seven routes backed by a `page.tsx` under `src/app`: the navigation's six, then /privacy, which
 * only the footer links to. A spec about the menu counts `NAV_ROUTES`, not this.
 */
export const STATIC_ROUTES = [...NAV_ROUTES, '/privacy'] as const;

/** The page route of one case study, `/work/<slug>`. */
export const caseStudyRoute = (slug: string): string => `/work/${encodeURIComponent(slug)}`;

/** `/work/<slug>` for every case study in the data file. */
export const CASE_STUDY_ROUTES = caseStudies.map(({ slug }) => caseStudyRoute(slug));

/**
 * A path that resolves to no route, so the not-found page renders. `/work/does-not-exist` is the
 * second one worth having — `dynamicParams = false` keeps an unknown slug at the routing layer
 * rather than in a render-time `notFound()` (ADR 0015) — and specs that need both list them
 * themselves; this is the one every route-walking gate includes.
 */
export const NOT_FOUND_ROUTE = '/no-such-page';

/**
 * Every page a visitor can land on: the static seven, the case studies, and a 404. Eleven entries
 * today. This is the list the axe and console gates walk; the acceptance criteria's "all ten page
 * routes" was written before /privacy made it eleven.
 */
export const PAGE_ROUTES = [...STATIC_ROUTES, ...CASE_STUDY_ROUTES, NOT_FOUND_ROUTE];

/** The status the document itself answers with, for a spec that asserts on the response. */
export const expectedStatus = (path: string): number => (path === NOT_FOUND_ROUTE ? 404 : 200);
