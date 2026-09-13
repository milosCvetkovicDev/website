import { caseStudies } from '../src/data/case-studies';

/**
 * The one route list every e2e spec reads.
 *
 * Before this file, `console-clean.spec.ts` kept its own array and `accessibility.spec.ts` audited a
 * hand-picked two, while `src/app/sitemap.ts` restated the static six a third time. Three copies of
 * one fact: a route added to the app reached at most one of them. The static six are still written
 * out by hand here — they are the App Router's own directory layout and nothing exports them — but
 * they are written out *once*, and the case studies are derived from the data file, so a new case
 * study reaches every gate without touching a spec.
 *
 * Consolidating the *source* side, so `src/app/sitemap.ts` reads this same set, belongs to the SEO
 * task (#48): a module under `src/app` importing from `e2e/` would ship the spec directory into the
 * build. `src/app/__tests__/sitemap.test.ts` asserts the two agree in the meantime.
 */

/** The six routes backed by a `page.tsx` under `src/app`, in navigation order. */
export const STATIC_ROUTES = ['/', '/about', '/work', '/skills', '/blog', '/contact'] as const;

/** `/work/<slug>` for every case study in the data file. */
export const CASE_STUDY_ROUTES = caseStudies.map(({ slug }) => `/work/${slug}`);

/**
 * A path that resolves to no route, so the not-found page renders. `/work/does-not-exist` is the
 * second one worth having — `dynamicParams = false` keeps an unknown slug at the routing layer
 * rather than in a render-time `notFound()` (ADR 0015) — and specs that need both list them
 * themselves; this is the one every route-walking gate includes.
 */
export const NOT_FOUND_ROUTE = '/no-such-page';

/**
 * Every page a visitor can land on: the static six, the case studies, and a 404. Ten entries today.
 * This is the list the axe and console gates walk, which is what "all ten page routes" in the
 * acceptance criteria refers to.
 */
export const PAGE_ROUTES = [...STATIC_ROUTES, ...CASE_STUDY_ROUTES, NOT_FOUND_ROUTE];

/** The status the document itself answers with, for a spec that asserts on the response. */
export const expectedStatus = (path: string): number => (path === NOT_FOUND_ROUTE ? 404 : 200);
