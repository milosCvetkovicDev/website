/**
 * The slug a development server is given for `/blog/[slug]` while no post is published. The
 * leading underscore is outside the slug pattern `posts.test.ts` holds every post to, so no post
 * can ever take it, and `getPost()` finds nothing for it: requested by hand, it is a not-found.
 */
export const NO_PUBLISHED_POST_SLUG = '_no-published-post';

/**
 * `generateStaticParams` for the post page and its card: one entry per published post (ADR 0028),
 * so with `dynamicParams = false` any other slug is a routing-level 404 (ADR 0015).
 *
 * Plus one exception, for `next dev` only. Next 16's development server enforces
 * `dynamicParams = false` only for a route whose list holds at least one entry
 * (`next-dev-server.js`, "This matches the hasGenerateStaticParams logic we do during build"). With
 * an empty list it renders the page for any slug, and the page's `notFound()` then serves Next's
 * bare recovery shell without the theme init script, which is the defect ADR 0015 fixed for
 * `/work/[slug]`: `e2e/not-found-shell.spec.ts`, `hydration-marker.spec.ts`,
 * `console-clean.spec.ts` and `blog.spec.ts` all fail on `/blog/does-not-exist` on the local
 * (dev server) Playwright path. A production build is not affected: it 404s every slug of an
 * empty list at the router, as the CI path proves. So in development, and only while nothing is
 * published, the list holds one placeholder that no post can match, and the dev server 404s every
 * real request at the router as a build does. It drops out once the first post is published.
 */
export function postStaticParams(
  posts: readonly { slug: string }[],
  environment: string | undefined = process.env.NODE_ENV,
): { slug: string }[] {
  const params = posts.map(({ slug }) => ({ slug }));
  if (params.length === 0 && environment === 'development') {
    return [{ slug: NO_PUBLISHED_POST_SLUG }];
  }
  return params;
}
