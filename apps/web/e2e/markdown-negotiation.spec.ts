import { get as httpGet } from 'node:http';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { MARKDOWN_TWINS } from './endpoints';
import { NOT_FOUND_ROUTE, caseStudyRoute } from './routes';
import { ASKS_FOR_MARKDOWN, BROWSER_ACCEPT, MARKDOWN, varyOf } from './support/negotiation';

/**
 * Content negotiation on `Accept` (#59, AC 15; ADR 0030): the canonical URL of every page with a
 * Markdown twin answers with the twin to a request that asks for `text/markdown`, and with the page
 * to everyone else. `next.config.ts` does it with one `beforeFiles` rewrite per route, so both
 * representations stay prerendered and no function is added; `src/test/next-config.test.ts` pins
 * the rules, and this spec proves what reaches the wire, under `next start` (CI) and `next dev`
 * (locally) alike.
 *
 * `Vary: Accept`: every negotiated Markdown answer names `Accept` in its `Vary`, so no cache that
 * honours `Vary` hands the twin to a request that did not ask for it; the twin's own URL serves one
 * representation and does not vary. On an HTML page Next writes its own `Vary` after `headers()`
 * has run and the `Accept` entry does not survive there (measured under `next start`, 2026-10-01,
 * and recorded in ADR 0030); what this spec holds for the page is that Next's own `Vary` is left
 * intact, `rsc` standing for it. Whether the CDN in front of the deployment keys its cache on
 * `Accept` only the deployed site can show: `e2e-live/markdown-negotiation.spec.ts` checks that.
 *
 * The routes come from `endpoints.ts`, so a new static route or case study is checked here without
 * touching this file.
 */

test.describe.configure({ timeout: 60_000 });

/**
 * Chromium's `Accept` for a navigation, a bare `text/html`, the wildcard range (what Playwright's
 * request context sends when a call names none) and an explicit refusal of Markdown, which
 * RFC 9110 spells as a weight of zero.
 */
const PAGE_ACCEPTS = [BROWSER_ACCEPT, 'text/html', '*/*', 'text/markdown;q=0, text/html'];

const get = (request: APIRequestContext, path: string, accept?: string) =>
  request.get(path, accept === undefined ? undefined : { headers: { accept } });

/**
 * A request with no `Accept` header at all, which Playwright's request context cannot send (it
 * fills in the wildcard range): `node:http` sends only `Host` and `Connection`.
 */
const getWithoutAccept = (url: string) =>
  new Promise<{ status: number; contentType: string; vary: string[] }>((resolve, reject) => {
    httpGet(url, (response) => {
      response.resume();
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          contentType: response.headers['content-type'] ?? '',
          vary: (response.headers.vary ?? '')
            .split(',')
            .map((token) => token.trim().toLowerCase())
            .filter(Boolean),
        }),
      );
      response.on('error', reject);
    }).on('error', reject);
  });

for (const { route, twin } of MARKDOWN_TWINS) {
  test(`${route} answers with its twin to a request for Markdown, and with the page otherwise`, async ({
    request,
    baseURL,
  }) => {
    const direct = await get(request, twin);
    expect(direct.status(), `${twin} should answer 200`).toBe(200);

    const negotiated = await get(request, route, ASKS_FOR_MARKDOWN);
    expect(negotiated.status(), `${route} [${ASKS_FOR_MARKDOWN}] should answer 200`).toBe(200);
    expect(negotiated.headers()['content-type'], `${route} should negotiate Markdown`).toBe(
      MARKDOWN,
    );
    expect(await negotiated.text(), `${route} should serve exactly its twin`).toBe(
      await direct.text(),
    );
    // The security headers still reach a negotiated response; nosniff matters most on a type a
    // browser would otherwise guess at.
    expect(negotiated.headers()['x-content-type-options']).toBe('nosniff');

    expect(varyOf(negotiated), `the negotiated answer for ${route} varies on Accept`).toContain(
      'accept',
    );
    expect(varyOf(direct), `${twin} serves one representation`).not.toContain('accept');

    for (const accept of PAGE_ACCEPTS) {
      const page = await get(request, route, accept);
      const label = `${route} [${accept}]`;
      expect(page.status(), `${label} should answer 200`).toBe(200);
      expect(page.headers()['content-type'], `${label} should serve the page`).toMatch(
        /^text\/html\b/,
      );
      // Next's own Vary on an App Router page, which a `headers()` entry must never replace.
      expect(varyOf(page), `${label} keeps Next's own Vary`).toContain('rsc');
    }

    const bare = await getWithoutAccept(new URL(route, baseURL).href);
    expect(bare.status, `${route} [no Accept] should answer 200`).toBe(200);
    expect(bare.contentType, `${route} [no Accept] should serve the page`).toMatch(/^text\/html\b/);
    expect(bare.vary, `${route} [no Accept] keeps Next's own Vary`).toContain('rsc');
  });
}

test('a path with no twin answers its normal 404 to a request for Markdown', async ({
  request,
}) => {
  for (const path of [NOT_FOUND_ROUTE, '/nope', caseStudyRoute('does-not-exist')]) {
    const plain = await get(request, path);
    const asked = await get(request, path, ASKS_FOR_MARKDOWN);
    expect(plain.status(), `${path} should answer 404`).toBe(404);
    expect(asked.status(), `${path} [${ASKS_FOR_MARKDOWN}] should answer 404`).toBe(404);
    expect(asked.headers()['content-type'], `${path} should not be rewritten`).toBe(
      plain.headers()['content-type'],
    );
    expect(asked.headers()['content-type'] ?? '').toMatch(/^text\/html\b/);
    expect(varyOf(asked), `${path} negotiates nothing`).not.toContain('accept');
  }
});

test('assets, metadata routes and the twins themselves answer as before to a request for Markdown', async ({
  request,
}) => {
  const html = await (await get(request, '/')).text();
  // A chunk URL may carry a query (`?dpl=` on Vercel, `?v=` under `next dev`): keep it.
  const chunk = html.match(/["'](\/_next\/static\/[^"'?]+\.js(?:\?[^"']*)?)["']/)?.[1];
  expect(chunk, 'the home page must reference a /_next/static chunk to check').toBeTruthy();

  const twin = MARKDOWN_TWINS.find(({ route }) => route === '/about')?.twin;
  expect(twin, '/about must have a twin').toBeTruthy();

  for (const path of [chunk as string, '/robots.txt', '/sitemap.xml', twin as string]) {
    const plain = await get(request, path);
    const asked = await get(request, path, ASKS_FOR_MARKDOWN);
    expect(plain.status(), `${path} should answer 200`).toBe(200);
    expect(asked.status(), `${path} [${ASKS_FOR_MARKDOWN}] should answer 200`).toBe(200);
    expect(asked.headers()['content-type'], `${path} keeps its own type`).toBe(
      plain.headers()['content-type'],
    );
    expect(await asked.text(), `${path} keeps its own body`).toBe(await plain.text());
  }
});
