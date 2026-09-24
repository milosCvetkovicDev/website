import { expect, test } from '@playwright/test';
import { CASE_STUDY_ROUTES, NOT_FOUND_ROUTE } from './routes';

/**
 * The six static security headers every page, asset and 404 should carry.
 *
 * Row R30 of the RED manifest, fixed by #48: `next.config.ts` declares one `headers()` entry whose
 * `source` is `/:path*`, so every path gets the same headers from one place: R30's five, plus the
 * `Cross-Origin-Opener-Policy` that #48's live-8 asks for as well. The values
 * themselves, the CSP above all, are pinned by `src/test/next-config.test.ts` and explained in
 * `docs/adr/0023-static-security-headers.md`; this spec proves they reach the wire, under `next start`
 * (CI) and `next dev` (locally) alike.
 *
 * Four surfaces rather than one, because a `headers()` entry is matched by path and it is easy to write
 * one that covers the pages and misses everything else: a page, a case study (a statically prerendered
 * route), a `/_next/static` chunk (served by the asset handler) and a 404 (rendered through the error
 * path). A header missing on the chunk is not academic — `X-Content-Type-Options` is exactly what stops
 * a script chunk being sniffed as something else.
 *
 * Not every answer is covered, and ADR 0023 records the exceptions: Next's router sends the 308s
 * that strip a trailing slash or collapse repeated slashes, and the plain 500 for a malformed
 * percent-encoding, before it applies `headers()`. No browser renders or frames those bodies.
 *
 * Deliberately excluded, and recorded here so the next reader does not go looking: HSTS itself.
 * `Strict-Transport-Security` is meaningless over the plain HTTP this suite serves and is set by the
 * platform in production, and its `includeSubDomains` / `preload` attributes are a hosting-level
 * decision that #48 verifies against the deployment and #52 re-checks. The same applies to the
 * `X-Robots-Tag` on the public `vercel.app` alias: it cannot be observed from localhost.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

/**
 * Header -> what an acceptable value looks like. Deliberately loose on most values: the row is that a
 * header is present on every surface, and the exact policy is pinned by the unit test, where a change
 * to it is one line in one diff. A CSP in particular only has to exist and mention a directive here.
 */
const REQUIRED_HEADERS: { name: string; accepts: RegExp; why: string }[] = [
  {
    name: 'x-content-type-options',
    accepts: /^nosniff$/i,
    why: 'stops a response being sniffed as a type it did not declare',
  },
  {
    name: 'x-frame-options',
    accepts: /^(deny|sameorigin)$/i,
    why: 'stops the site being framed for clickjacking',
  },
  {
    name: 'referrer-policy',
    accepts: /no-referrer|same-origin|strict-origin/i,
    why: 'stops the full URL leaking to third parties',
  },
  {
    name: 'content-security-policy',
    accepts: /(default|script|frame-ancestors)-src|frame-ancestors/i,
    why: 'the one header that limits what an injected script could do',
  },
  {
    name: 'permissions-policy',
    // Each of the three features with an empty allowlist, in any order.
    accepts: /^(?=.*\bcamera=\(\))(?=.*\bmicrophone=\(\))(?=.*\bgeolocation=\(\))/,
    why: 'denies camera, microphone and geolocation, none of which this site uses',
  },
  {
    name: 'cross-origin-opener-policy',
    accepts: /^same-origin$/,
    why: 'leaves a cross-origin page that opens the site no handle on its window',
  },
];

test('a page, a case study, a chunk and a 404 carry the six static security headers', async ({
  request,
}) => {
  // A real chunk URL rather than a guessed one: the hashed filename changes every build, so it is read
  // out of the home page's own markup.
  const html = await (await request.get('/')).text();
  const chunk = html.match(/["'](\/_next\/static\/[^"']+\.(?:js|css))["']/)?.[1];
  expect(chunk, 'the home page must reference a /_next/static asset to check').toBeTruthy();

  const surfaces = [
    { what: 'a page', path: '/' },
    { what: 'a case study', path: CASE_STUDY_ROUTES[0] },
    { what: 'a static chunk', path: chunk as string },
    { what: 'a 404', path: NOT_FOUND_ROUTE },
  ];

  const missing: string[] = [];
  for (const { what, path } of surfaces) {
    const response = await request.get(path);
    const headers = response.headers();
    for (const { name, accepts, why } of REQUIRED_HEADERS) {
      const value = headers[name];
      if (value === undefined) missing.push(`${what} (${path}): no ${name} — ${why}`);
      else if (!accepts.test(value)) missing.push(`${what} (${path}): ${name} is "${value}"`);
    }
  }

  expect(
    missing,
    'next.config.ts sends these from one `headers()` entry whose source is `/:path*`. A header missing ' +
      'here means that entry, or its source, no longer covers pages, prerendered routes, assets and ' +
      'the error path alike.',
  ).toEqual([]);
});

test('the four surfaces this row measures all answer, so the row is about headers', async ({
  request,
}) => {
  // The control: R30 would also fail convincingly against a server that answered nothing at all, and
  // before #48 it did fail, as an expected failure. This says each surface is really there, so a
  // failure above is about headers.
  const html = await (await request.get('/')).text();
  const chunk = html.match(/["'](\/_next\/static\/[^"']+\.(?:js|css))["']/)?.[1];
  expect(chunk).toBeTruthy();

  for (const [path, status] of [
    ['/', 200],
    [CASE_STUDY_ROUTES[0], 200],
    [chunk as string, 200],
    [NOT_FOUND_ROUTE, 404],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), `${path} should answer ${status}`).toBe(status);
  }
});
