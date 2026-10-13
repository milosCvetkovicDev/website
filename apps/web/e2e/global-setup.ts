import { expect, request, type FullConfig } from '@playwright/test';

import { caseStudies } from '../src/data/case-studies';
import { publishedPosts } from '../src/data/posts';

/**
 * Serves one path of every route with `generateStaticParams`, one at a time, before any worker
 * starts, so `next dev` has written them all into `prerender-manifest.json` before parallel
 * traffic arrives (#264).
 *
 * `next dev` (Next.js 16.3.8) adds a dynamic route to that manifest on the route's first request
 * with a read, edit and plain `writeFile`, no lock and no rename (`next-dev-server.js:656-691`), and
 * any render that loads the manifest meanwhile can read it empty and answer 500 with
 * `SyntaxError: Unexpected end of JSON input`: vercel/next.js#96259. The step writes only when the
 * manifest changes, and one request per route covers every slug, so once each route has been
 * served the file is no longer written. Playwright starts the web server before global setup, so
 * the server is up here.
 *
 * Only the dev server writes the manifest; the production build `CI` serves never does, so the
 * config sets this for the dev server alone. A route whose params are empty writes nothing, so a
 * blog route joins the warm-up with the first published post.
 */
const FIRST_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Every route under `src/app` that exports `generateStaticParams`, as its App Router pattern.
 * `src/test/global-setup.test.ts` fails when this list and the route files disagree.
 */
export const STATIC_PARAMS_ROUTES = [
  '/work/[slug]',
  '/work/[slug]/og-image.png',
  '/work/[slug]/index.md',
  '/work/[slug]/index.json',
  '/blog/[slug]',
  '/blog/[slug]/og-image.png',
  '/blog/[slug]/index.md',
] as const;

/** The first slug each dynamic segment's data has, or none when it has no entries yet. */
function firstSlug(pattern: string): string | undefined {
  if (pattern.startsWith('/work/')) return caseStudies[0]?.slug;
  if (pattern.startsWith('/blog/')) return publishedPosts[0]?.slug;
  throw new Error(`No data source for ${pattern}: add one to e2e/global-setup.ts`);
}

/** One servable path per route in `STATIC_PARAMS_ROUTES`, skipping routes with no entries. */
export function staticParamsPaths(): string[] {
  return STATIC_PARAMS_ROUTES.flatMap((pattern) => {
    const slug = firstSlug(pattern);
    return slug === undefined ? [] : [pattern.replace('[slug]', encodeURIComponent(slug))];
  });
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) {
    throw new Error('global setup needs `use.baseURL` in playwright.config.ts to find the server.');
  }
  const context = await request.newContext({ baseURL });
  try {
    for (const path of staticParamsPaths()) {
      const response = await context.get(path, {
        maxRedirects: 0,
        timeout: FIRST_REQUEST_TIMEOUT_MS,
      });
      await expect(response, `${path} must be served before the workers start`).toBeOK();
    }
  } finally {
    await context.dispose();
  }
}
