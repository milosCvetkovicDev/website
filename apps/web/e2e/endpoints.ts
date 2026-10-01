import { caseStudies } from '../src/data/case-studies';
import { markdownTwinPath } from '../src/lib/pathname';
import { STATIC_ROUTES, caseStudyRoute } from './routes';

/**
 * The one manifest of the machine-readable paths this site serves, or is about to.
 *
 * Every path an agent-facing endpoint answers on is written here once, and the specs and tasks that
 * build or test one import it rather than restating it: #59 (the Markdown twins), #60 (`/llms.txt`
 * and the JSON representation), #61 (the Atom feed) and #62 (the MCP server). The twins and the
 * case-study JSON are served; the rest are not yet. `machine-readable.spec.ts` holds one expected
 * failure per endpoint not yet served, and the task that ships an endpoint deletes its annotation in
 * the same change.
 *
 * The page routes come from `routes.ts`, so a new static route or case study gets a twin row without
 * touching this file.
 */

/**
 * The Markdown twin of a page route: `/` -> `/index.md`, `/about` -> `/about/index.md`,
 * `/work/<slug>` -> `/work/<slug>/index.md`. The function `buildMetadata()` advertises each twin
 * with (#59), imported rather than restated, so a spec cannot look for a twin at a path the site
 * does not link.
 *
 * One shape for every route, the owner's decision of 2026-09-12. The obvious alternative,
 * `/work/<slug>.md`, cannot be built: a folder named `[slug].md` is a literal segment, so Next types
 * its handler with no params at all and serves it at the percent-encoded `/work/%5Bslug%5D.md`
 * (reproduced in this repository on Next 16.3.4, 2026-09-12). A twin one segment below its route
 * works for a dynamic route and a static one alike.
 */
export { markdownTwinPath };

/**
 * One case study as JSON (#60), `/work/<slug>/index.json` for the same reason as the twins, served by
 * `src/app/work/[slug]/index.json/route.ts`.
 */
export function caseStudyJsonPath(slug: string): string {
  return `${caseStudyRoute(slug)}/index.json`;
}

/**
 * Every case study with each path an agent reads it at. The slugs come from the data file, so a new
 * case study gets its rows without touching a spec.
 */
export const CASE_STUDY_ENDPOINTS = caseStudies.map(({ slug }) => ({
  slug,
  route: caseStudyRoute(slug),
  twin: markdownTwinPath(caseStudyRoute(slug)),
  json: caseStudyJsonPath(slug),
}));

/**
 * Every page route with its twin: the static routes and every case study, not the 404. `/privacy`
 * and `/blog` included: every route that goes through `buildMetadata()` advertises a twin, so every
 * one serves one (#59).
 */
export const MARKDOWN_TWINS = [
  ...STATIC_ROUTES.map((route) => ({ route, twin: markdownTwinPath(route) })),
  ...CASE_STUDY_ENDPOINTS.map(({ route, twin }) => ({ route, twin })),
];

/** The llmstxt.org index of the site (#60). */
export const LLMS_TXT = '/llms.txt';

/**
 * Every case study as one JSON array (#60), served by `src/app/case-studies.json/route.ts`.
 * Deliberately not under `/api/`, and with the per-slug shape above matching the twins; both paths
 * are the ones #60 fixes.
 */
export const CASE_STUDIES_JSON = '/case-studies.json';

/** The Atom feed of the blog's published posts (#61). */
export const FEED = '/feed.xml';

/** The read-only, stateless MCP server over streamable HTTP (#62), the site's one server function. */
export const MCP = '/mcp';

/**
 * The origin the build writes into absolute URLs: `metadataBase` in `src/app/layout.tsx` reads the
 * same variable with the same fallback. A spec that meets an absolute link compares it with this,
 * so a link to another host (a preview deployment, localhost) fails rather than matching by path.
 */
export const SITE_ORIGIN = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev')
  .origin;
