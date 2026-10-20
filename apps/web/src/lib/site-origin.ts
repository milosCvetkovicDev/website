/**
 * The site's origin in production: what `siteOrigin()` falls back to, and the origin a post may
 * not link to by its full URL, which `posts.test.ts` asks to be written as a path instead.
 */
export const PRODUCTION_ORIGIN = 'https://miloscvetkovic.dev';

/**
 * `NEXT_PUBLIC_SITE_URL`, or production when it is unset or blank, as the bare origin. A trailing
 * slash is dropped, so `https://x.dev/` cannot write `https://x.dev//about`; anything that is not an
 * http(s) origin (no scheme, a path, a query) throws at build time rather than ship broken URLs.
 *
 * `lib/serialise.ts` (the Markdown twins' and the JSON's links) and `lib/structured-data.ts` (every
 * JSON-LD `@id` and `url`) read the origin here, so the URLs they write match the canonical Next
 * resolves from `metadataBase`, which normalises the same value the same way.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || PRODUCTION_ORIGIN;
  let url: URL | undefined;
  try {
    url = new URL(configured);
  } catch {
    url = undefined;
  }
  if (
    !url ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL "${configured}" is not an origin such as https://miloscvetkovic.dev`,
    );
  }
  return url.origin;
}

/**
 * The absolute URL of a path on this site. The origin is `siteOrigin()`'s, from the variable and the
 * fallback `app/sitemap.ts` and `app/robots.ts` read, so a preview build names production like the
 * sitemap does, and the root is the bare origin, as its served canonical is. `metadataBase` cannot
 * help here: it resolves URLs in the head, and a Markdown body is plain text.
 *
 * It lives here rather than in `lib/serialise.ts`, which re-exports it, because a data module calls
 * it while it loads (`data/mcp-server.ts`) and the serialiser imports the data modules: importing it
 * from there closed a cycle in which the call ran before this module's binding existed.
 */
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`absoluteUrl: "${path}" is not a path on this site`);
  }
  const origin = siteOrigin();
  return path === '/' ? origin : `${origin}${path}`;
}
