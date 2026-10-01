import { expect, test, type APIRequestContext } from '@playwright/test';
import { MARKDOWN_TWINS } from '../e2e/endpoints';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from '../e2e/routes';
import { ASKS_FOR_MARKDOWN, BROWSER_ACCEPT, MARKDOWN, varyOf } from '../e2e/support/negotiation';

/**
 * What only the deployed site can show about content negotiation (#59, ADR 0030): whether the CDN
 * in front of it keeps the two representations of a page apart. `next start` has no shared cache,
 * so `e2e/markdown-negotiation.spec.ts` proves the rewrite and the `Vary: Accept` it sends, and
 * nothing about a cache that stores the first answer for a URL and replays it.
 *
 * On every route with a Markdown twin (`e2e/endpoints.ts`, the static routes and every case study),
 * in both orders, back to back and without a cache-busting query, which would give each request a
 * cache entry of its own and measure nothing:
 *
 * - a request for Markdown, then a browser's request: the browser must get `text/html`. A cache
 *   that keys on the URL alone would replay the Markdown, and a browser must never be served
 *   Markdown at a page's URL;
 * - a browser's request, then a request for Markdown: the agent must get
 *   `text/markdown; charset=utf-8` with `accept` in its `Vary`, so that a cache downstream keeps
 *   it apart from the page too.
 *
 * What the cache held before the first request is whatever the deployment, earlier runs and
 * visitors left there, `analytics.spec.ts` loading every page included. That does not blunt either
 * order: a cache that ignores `Accept` and already holds the page fails the Markdown request, and
 * one that holds nothing stores the first answer and fails the second.
 */
const ROUTES = MARKDOWN_TWINS.map(({ route }) => route);

const get = (request: APIRequestContext, path: string, accept: string) =>
  request.get(path, { headers: { accept } });

async function expectMarkdown(request: APIRequestContext, path: string) {
  const label = `${path} [${ASKS_FOR_MARKDOWN}]`;
  const response = await get(request, path, ASKS_FOR_MARKDOWN);
  expect(response.status(), `${label} status`).toBe(200);
  expect(response.headers()['content-type'], `${label} should be the Markdown twin`).toBe(MARKDOWN);
  expect(varyOf(response), `${label} should vary on Accept`).toContain('accept');
}

async function expectPage(request: APIRequestContext, path: string) {
  const label = `${path} [browser]`;
  const response = await get(request, path, BROWSER_ACCEPT);
  expect(response.status(), `${label} status`).toBe(200);
  expect(response.headers()['content-type'], `${label} should be the page`).toMatch(
    /^text\/html\b/,
  );
}

test('there are routes to check, static and case studies', () => {
  expect(ROUTES.some((route) => (STATIC_ROUTES as readonly string[]).includes(route))).toBe(true);
  expect(ROUTES.some((route) => CASE_STUDY_ROUTES.includes(route))).toBe(true);
});

for (const path of ROUTES) {
  test(`${path} serves the page to a browser after a request for Markdown`, async ({ request }) => {
    await expectMarkdown(request, path);
    await expectPage(request, path);
  });

  test(`${path} serves Markdown to an agent after a browser's request`, async ({ request }) => {
    await expectPage(request, path);
    await expectMarkdown(request, path);
  });
}
