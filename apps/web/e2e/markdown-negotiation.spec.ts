import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { MARKDOWN_TWINS } from './endpoints';
import { NOT_FOUND_ROUTE, caseStudyRoute } from './routes';

/**
 * Content negotiation on `Accept` (#59, AC 15; ADR 0030): the canonical URL of every page with a
 * Markdown twin answers with the twin to a request that asks for `text/markdown`, and with the page
 * to everyone else. `next.config.ts` does it with one `beforeFiles` rewrite per route, so both
 * representations stay prerendered and no function is added; `src/test/next-config.test.ts` pins
 * the rules, and this spec proves what reaches the wire, under `next start` (CI) and `next dev`
 * (locally) alike.
 *
 * `Vary: Accept`: every response that carries Markdown names `Accept` in its `Vary`, so no cache
 * hands the twin to a request that did not ask for it. On an HTML page Next writes its own `Vary`
 * after `headers()` has run and the `Accept` entry does not survive there (measured under
 * `next start`, 2026-10-01, and recorded in ADR 0030); what this spec holds for the page is that
 * Next's own `Vary` is left intact.
 *
 * The routes come from `endpoints.ts`, so a new static route or case study is checked here without
 * touching this file.
 */

test.describe.configure({ timeout: 60_000 });

/** RFC 7763's type with the charset it requires, as `markdownResponse()` writes it. */
const MARKDOWN = 'text/markdown; charset=utf-8';

/** What Claude Code and the other clients acceptmarkdown.com lists send. */
const ASKS_FOR_MARKDOWN = 'text/markdown, */*';

/** Chromium's `Accept` for a navigation, and a bare `text/html`. */
const BROWSER_ACCEPTS = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'text/html',
];

/** Every token of every `Vary` header on a response, lower-cased: the header may come twice. */
const varyOf = (response: APIResponse): string[] =>
  response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'vary')
    .flatMap(({ value }) => value.split(','))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

const get = (request: APIRequestContext, path: string, accept?: string) =>
  request.get(path, accept === undefined ? undefined : { headers: { accept } });

for (const { route, twin } of MARKDOWN_TWINS) {
  test(`${route} answers with its twin to a request for Markdown, and with the page otherwise`, async ({
    request,
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

    for (const response of [negotiated, direct]) {
      expect(varyOf(response), `every Markdown answer for ${route} varies on Accept`).toContain(
        'accept',
      );
    }

    for (const accept of [...BROWSER_ACCEPTS, undefined]) {
      const page = await get(request, route, accept);
      const label = `${route} [${accept ?? 'no Accept'}]`;
      expect(page.status(), `${label} should answer 200`).toBe(200);
      expect(page.headers()['content-type'], `${label} should serve the page`).toMatch(
        /^text\/html\b/,
      );
      // Next's own Vary on an App Router page, which a `headers()` entry must never replace.
      expect(varyOf(page), `${label} keeps Next's own Vary`).toContain('rsc');
    }
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
  const chunk = html.match(/["'](\/_next\/static\/[^"']+\.js)["']/)?.[1];
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
