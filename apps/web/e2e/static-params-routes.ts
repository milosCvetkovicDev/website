/**
 * Every route under `src/app` that exports `generateStaticParams`, as its App Router pattern: the
 * routes `e2e/global-setup.ts` warms on the dev server before any worker starts (#264).
 * `src/test/global-setup.test.ts` scans `src/app` and fails when this list and the route files
 * disagree. It lives apart from `global-setup.ts` so that test never loads `@playwright/test`.
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

/**
 * The slug the warm-up requests: no case study or post has it, so every route answers it with a
 * 404, which `next dev` only decides after writing the route's static params into the manifest.
 * An unknown slug rather than a real one keeps the warm-up independent of the data: it covers the
 * blog routes while no post is published, when `next dev` still gives them a placeholder entry
 * (`src/lib/post-static-params.ts`), and it needs no slug to exist on every sub-route.
 */
export const WARM_UP_SLUG = 'does-not-exist';

export const warmUpPath = (pattern: string): string => pattern.replace('[slug]', WARM_UP_SLUG);
