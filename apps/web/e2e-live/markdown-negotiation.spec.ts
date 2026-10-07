import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { MARKDOWN_TWINS } from '../e2e/endpoints';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from '../e2e/routes';
import { ASKS_FOR_MARKDOWN, BROWSER_ACCEPT, MARKDOWN, varyOf } from '../e2e/support/negotiation';

/**
 * What only the deployed site can show about content negotiation (#59, ADR 0030): whether the CDN
 * in front of it keeps the two representations of a page apart, and whether what it sends keeps a
 * cache further down the line, a proxy's or a client's, from mixing them up. `next start` has no
 * shared cache, so `e2e/markdown-negotiation.spec.ts` proves the rewrite and the `Vary: Accept` it
 * sends, and nothing about a cache that stores the first answer for a URL and replays it.
 *
 * On every route with a Markdown twin (`e2e/endpoints.ts`, the static routes and every case study),
 * in both orders, back to back and without a cache-busting query, which would give each request a
 * cache entry of its own and measure nothing:
 *
 * - a request for Markdown, then a browser's request: the browser must get `text/html`. A cache
 *   that keys on the URL alone would replay the Markdown, and a browser must never be served
 *   Markdown at a page's URL;
 * - a browser's request, then a request for Markdown: the agent must get
 *   `text/markdown; charset=utf-8`.
 *
 * Each test then checks that a downstream cache holding one of the two answers cannot hand it to a
 * request for the other. `next.config.ts` puts `Accept` in the negotiated answer's `Vary` for that,
 * and under `next start` it arrives. On Vercel it does not: the negotiated answer is a prerendered
 * route's, and the platform sends Next's own `Vary` on it (`rsc` and the three `next-router-*`
 * request headers) while the security headers from the same `headers()` arrive, measured on the
 * apex on 2026-10-07 (#217). So the check passes on either of two grounds:
 *
 * - the Markdown answer's `Vary` lists `accept`: a cache that honours `Vary` stores the twin under a
 *   key of its own, and a browser's request never matches it. This is what `next start` sends;
 * - or the Markdown answer leaves a cache nothing to replay without asking, which is what Vercel
 *   sends. Its `Cache-Control` makes every cache revalidate before each reuse: `no-cache`, or
 *   `max-age=0` with `must-revalidate`, and no `s-maxage`, `stale-while-revalidate` or
 *   `stale-if-error`, each of which would let a shared cache answer from what it holds. It carries
 *   an entity tag that differs from the page's at the same URL, compared weakly as `If-None-Match`
 *   compares them (RFC 9110, 13.1.2), so the revalidation names the representation the cache holds.
 *   And the site answers that revalidation with the representation asked for, in both directions:
 *   a browser's `Accept` with the twin's tag gets `200 text/html`, an agent's with the page's tag
 *   gets `200` Markdown, never the `304` that would tell the cache to reuse what it holds.
 *
 * The limit: a cache that ignores `must-revalidate` or `no-cache` and serves what it holds anyway
 * breaks RFC 9111 (5.2.2.2, 5.2.2.4), as one that ignores `Vary` does, and is out of scope. So is
 * the page's own answer, which carries no `accept` in its `Vary` even under `next start` (ADR 0030):
 * the revalidation in the agent's direction is checked, the page's `Cache-Control` is not.
 *
 * What the cache held before the first request is whatever the deployment, earlier runs and
 * visitors left there, `analytics.spec.ts` loading every page included. That does not blunt either
 * order: a cache that ignores `Accept` and already holds the page fails the Markdown request, and
 * one that holds nothing stores the first answer and fails the second.
 */
const ROUTES = MARKDOWN_TWINS.map(({ route }) => route);

const get = (request: APIRequestContext, path: string, accept: string, ifNoneMatch?: string) =>
  request.get(path, {
    headers: ifNoneMatch === undefined ? { accept } : { accept, 'if-none-match': ifNoneMatch },
  });

async function expectMarkdown(request: APIRequestContext, path: string) {
  const label = `${path} [${ASKS_FOR_MARKDOWN}]`;
  const response = await get(request, path, ASKS_FOR_MARKDOWN);
  expect(response.status(), `${label} status`).toBe(200);
  expect(response.headers()['content-type'], `${label} should be the Markdown twin`).toBe(MARKDOWN);
  return response;
}

async function expectPage(request: APIRequestContext, path: string) {
  const label = `${path} [browser]`;
  const response = await get(request, path, BROWSER_ACCEPT);
  expect(response.status(), `${label} status`).toBe(200);
  expect(response.headers()['content-type'], `${label} should be the page`).toMatch(
    /^text\/html\b/,
  );
  return response;
}

/**
 * One `cache-directive` (RFC 9111, 5.2): a name, then optionally `=` and a token or a quoted string,
 * which may hold a comma. The names and tokens are RFC 9110's `tchar`.
 */
const CACHE_DIRECTIVE = /([\w!#$%&'*+.^`|~-]+)(?:=(?:"((?:[^"\\]|\\.)*)"|([\w!#$%&'*+.^`|~-]+)))?/g;

/**
 * Every directive on a response's `Cache-Control` lines, by lower-cased name, with every value it
 * was given there (`undefined` for none), so a directive sent twice is seen twice.
 */
function cacheDirectives(response: APIResponse) {
  const directives = new Map<string, (string | undefined)[]>();
  for (const { name, value } of response.headersArray()) {
    if (name.toLowerCase() !== 'cache-control') {
      continue;
    }
    for (const [, directive, quoted, token] of value.matchAll(CACHE_DIRECTIVE)) {
      const key = directive.toLowerCase();
      const given = quoted === undefined ? token : quoted.replace(/\\(.)/g, '$1');
      directives.set(key, [...(directives.get(key) ?? []), given]);
    }
  }
  return directives;
}

/**
 * Whether every cache must ask the origin before each reuse of the response: `no-cache`, or
 * `max-age=0` with `must-revalidate`, and none of `s-maxage`, `stale-while-revalidate` and
 * `stale-if-error`, which let a shared cache answer from what it holds. A `no-cache` that names
 * fields holds only those back (RFC 9111, 5.2.2.4), so it does not count, and a `max-age` sent twice
 * counts only when both are zero.
 */
function forcesRevalidation(response: APIResponse) {
  const directives = cacheDirectives(response);
  const loopholes = ['s-maxage', 'stale-while-revalidate', 'stale-if-error'];
  if (loopholes.some((name) => directives.has(name))) {
    return false;
  }
  if (directives.get('no-cache')?.includes(undefined)) {
    return true;
  }
  const maxAge = directives.get('max-age') ?? [];
  return (
    maxAge.length > 0 &&
    maxAge.every((value) => value !== undefined && /^0+$/.test(value)) &&
    directives.has('must-revalidate')
  );
}

/** An entity tag as `If-None-Match` compares it: weakly, so `W/"x"` and `"x"` match. */
const opaqueTag = (etag: string) => etag.trim().replace(/^W\//, '');

/**
 * That no cache downstream can hand the Markdown answer to a browser's request, or the page to an
 * agent's revalidation: `Vary` lists `accept`, or the answer must be revalidated, under a tag of
 * its own, and the revalidation gets the representation it asked for.
 */
async function expectKeptApart(
  request: APIRequestContext,
  path: string,
  markdown: APIResponse,
  page: APIResponse,
) {
  const vary = varyOf(markdown);
  if (vary.includes('accept')) {
    return;
  }
  const why = `${path}: the Markdown answer's Vary (${vary.join(', ') || 'none'}) lacks accept, so`;

  expect(
    forcesRevalidation(markdown),
    `${why} its Cache-Control must make every cache revalidate it (no-cache, or max-age=0 with ` +
      'must-revalidate, and no s-maxage, stale-while-revalidate or stale-if-error); it sent ' +
      `"${markdown.headers()['cache-control'] ?? ''}"`,
  ).toBe(true);

  const markdownTag = markdown.headers().etag ?? '';
  const pageTag = page.headers().etag ?? '';
  expect(markdownTag, `${why} it must carry an ETag for a revalidation to name`).not.toBe('');
  expect(
    pageTag,
    `${why} the page at ${path} must carry an ETag for a revalidation to name`,
  ).not.toBe('');
  expect(
    opaqueTag(markdownTag),
    `${why} its ETag (${markdownTag}) must differ from the page's (${pageTag}), compared weakly`,
  ).not.toBe(opaqueTag(pageTag));

  const browser = `${path} [browser, If-None-Match: ${markdownTag}]`;
  const asPage = await get(request, path, BROWSER_ACCEPT, markdownTag);
  expect(asPage.status(), `${why} ${browser} must get the page, not a 304`).toBe(200);
  expect(asPage.headers()['content-type'], `${why} ${browser} must get the page`).toMatch(
    /^text\/html\b/,
  );

  const agent = `${path} [${ASKS_FOR_MARKDOWN}, If-None-Match: ${pageTag}]`;
  const asMarkdown = await get(request, path, ASKS_FOR_MARKDOWN, pageTag);
  expect(asMarkdown.status(), `${why} ${agent} must get the Markdown twin, not a 304`).toBe(200);
  expect(asMarkdown.headers()['content-type'], `${why} ${agent} must get the Markdown twin`).toBe(
    MARKDOWN,
  );
}

test('there are routes to check, static and case studies', () => {
  expect(ROUTES.some((route) => (STATIC_ROUTES as readonly string[]).includes(route))).toBe(true);
  expect(ROUTES.some((route) => CASE_STUDY_ROUTES.includes(route))).toBe(true);
});

for (const path of ROUTES) {
  test(`${path} serves the page to a browser after a request for Markdown`, async ({ request }) => {
    const markdown = await expectMarkdown(request, path);
    const page = await expectPage(request, path);
    await expectKeptApart(request, path, markdown, page);
  });

  test(`${path} serves Markdown to an agent after a browser's request`, async ({ request }) => {
    const page = await expectPage(request, path);
    const markdown = await expectMarkdown(request, path);
    await expectKeptApart(request, path, markdown, page);
  });
}
