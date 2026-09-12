import { expect, test } from '@playwright/test';
import { CASE_STUDY_ROUTES, NOT_FOUND_ROUTE } from './routes';

/**
 * The five static security headers every response should carry.
 *
 * Row R30 of the RED manifest, fixed by #48. `nextConfig` (`next.config.ts:33-43`) sets only
 * `turbopack.root` and `distDir`: there is no `headers()` and no `vercel.json`, so the only security
 * header the site sends is the platform's default HSTS, and that only in production.
 *
 * Four surfaces rather than one, because a `headers()` entry is matched by path and it is easy to write
 * one that covers the pages and misses everything else: a page, a case study (a statically prerendered
 * route), a `/_next/static` chunk (served by the asset handler) and a 404 (rendered through the error
 * path). A header missing on the chunk is not academic — `X-Content-Type-Options` is exactly what stops
 * a script chunk being sniffed as something else.
 *
 * Deliberately excluded, and recorded here so the next reader does not go looking: HSTS itself.
 * `Strict-Transport-Security` is meaningless over the plain HTTP this suite serves and is set by the
 * platform in production, and its `includeSubDomains` / `preload` attributes are a hosting-level
 * decision that #48 verifies against the deployment and #52 re-checks. The same applies to the
 * `X-Robots-Tag` on the public `vercel.app` alias: it cannot be observed from localhost.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

/**
 * Header -> what an acceptable value looks like. Deliberately loose on the values: the row is that the
 * header is absent, and #48 picks the policy. A CSP in particular is a judgement call this baseline
 * must not pre-empt, so it only has to exist and mention a directive.
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
    accepts: /=\(/,
    why: 'denies camera, microphone and geolocation, none of which this site uses',
  },
];

test('every kind of response carries the five static security headers', async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R30, #48' });

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
    'next.config.ts has no `headers()` and there is no vercel.json, so none of these is sent. Add ' +
      'them in one place so they cover pages, prerendered routes, assets and the error path alike.',
  ).toEqual([]);
});

test('the four surfaces this row measures all answer, so the row is about headers', async ({
  request,
}) => {
  // Green, and the control: R30 asserts that headers are absent, so it would also "fail" convincingly
  // against a server that answered nothing at all. This says each surface is really there.
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
