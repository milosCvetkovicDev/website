import { expect, test, type APIRequestContext } from '@playwright/test';
import { PRODUCTION_ALIAS_HOST } from '../production-alias';
import { CASE_STUDY_ROUTES, NOT_FOUND_ROUTE } from './routes';

/**
 * The public Vercel production alias answers `X-Robots-Tag: noindex`, and no other host does.
 *
 * live-3 and pages-7 (#48, #52's AC 18): the alias serves the same bytes as the apex, not behind a
 * Vercel login, so without this a search engine could index a second copy of the site. ADR 0025
 * records the choice: a second `headers()` entry in `next.config.ts` keyed on
 * `has: [{ type: 'host', value: PRODUCTION_ALIAS_HOST }]`. `src/test/next-config.test.ts` pins the
 * entry itself; this spec proves that the server really matches it on the request's Host, under
 * `next start` (CI) and `next dev` (locally) alike, by sending the alias as the Host header to the
 * local server. The live alias itself is checked after the deploy, with the curl in ADR 0025.
 *
 * The same four surfaces as `security-headers.spec.ts`, for the same reason: a page, a prerendered
 * case study, a `/_next/static` chunk and a 404 each leave Next's router by a different path.
 *
 * The other half matters as much: the apex must never be told `noindex`. The entry is keyed on the
 * alias being present, never on the apex being absent, and the last test sends the apex's own Host
 * and the local default to prove neither gets the header.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

/** The four surfaces, with the status each should answer, the chunk read out of the home page. */
async function surfaces(request: APIRequestContext) {
  const html = await (await request.get('/')).text();
  const chunk = html.match(/["'](\/_next\/static\/[^"']+\.(?:js|css))["']/)?.[1];
  expect(chunk, 'the home page must reference a /_next/static asset to check').toBeTruthy();

  return [
    { what: 'a page', path: '/', status: 200 },
    { what: 'a case study', path: CASE_STUDY_ROUTES[0], status: 200 },
    { what: 'a static chunk', path: chunk as string, status: 200 },
    { what: 'a 404', path: NOT_FOUND_ROUTE, status: 404 },
  ];
}

test('the production alias answers X-Robots-Tag: noindex on a page, a case study, a chunk and a 404', async ({
  request,
}) => {
  const checked = await surfaces(request);
  const found: string[] = [];
  for (const { what, path } of checked) {
    const response = await request.get(path, { headers: { host: PRODUCTION_ALIAS_HOST } });
    const headers = response.headers();
    // The status and a security header say the alias request was served like any other, so a
    // failure below is about the robots header and not about a server that refused the Host.
    found.push(
      `${what} (${path}): ${response.status()}, x-robots-tag ${headers['x-robots-tag'] ?? '(none)'}, ` +
        `x-content-type-options ${headers['x-content-type-options'] ?? '(none)'}`,
    );
  }

  const expected = checked.map(
    ({ what, path, status }) =>
      `${what} (${path}): ${status}, x-robots-tag noindex, x-content-type-options nosniff`,
  );
  expect(
    found,
    `next.config.ts sends X-Robots-Tag: noindex from a headers() entry keyed on the host ` +
      `${PRODUCTION_ALIAS_HOST}. A surface without it here means that entry, its source or its ` +
      `host no longer covers the alias.`,
  ).toEqual(expected);
});

test('the apex and the local default host get no X-Robots-Tag on the same four surfaces', async ({
  request,
}) => {
  const leaked: string[] = [];
  for (const { what, path, status } of await surfaces(request)) {
    for (const host of ['miloscvetkovic.dev', undefined]) {
      const response = await request.get(path, host ? { headers: { host } } : undefined);
      const label = `${what} (${path}) on ${host ?? 'the default host'}`;
      expect(response.status(), `${label} should answer ${status}`).toBe(status);
      const value = response.headers()['x-robots-tag'];
      if (value !== undefined) leaked.push(`${label}: x-robots-tag ${value}`);
    }
  }

  expect(
    leaked,
    'Only the production alias may be told noindex. A header here would take the real site out of ' +
      'search: the alias entry must stay keyed on the alias host, never on the apex being missing.',
  ).toEqual([]);
});
