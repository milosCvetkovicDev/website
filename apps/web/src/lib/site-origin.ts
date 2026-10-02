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
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://miloscvetkovic.dev';
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
