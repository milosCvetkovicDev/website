import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { MARKDOWN_TWINS } from '../e2e/endpoints';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from '../e2e/routes';
import { cacheBound, entityTag, variesOnAccept } from '../e2e/support/cache-control';
import { ASKS_FOR_MARKDOWN, BROWSER_ACCEPT, MARKDOWN, varyOf } from '../e2e/support/negotiation';

/**
 * What only the deployed site can show about content negotiation (#59, ADR 0030): whether the CDN
 * in front of it keeps the two representations of a page apart, and whether what it sends keeps a
 * cache further down the line, a proxy's or a client's, from handing the Markdown twin to a
 * browser. `next start` has no shared cache, so `e2e/markdown-negotiation.spec.ts` proves the
 * rewrite and the `Vary: Accept` it sends, and nothing about a cache that stores the first answer
 * for a URL and replays it.
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
 * A third test per route checks that a cache downstream holding the Markdown answer cannot hand it
 * to a browser. `next.config.ts` puts `Accept` in the negotiated answer's `Vary` for that, and
 * under `next start` it arrives. On Vercel it does not: the negotiated answer is a prerendered
 * route's, and the platform sends Next's own `Vary` on it (`rsc` and the three `next-router-*`
 * request headers) while the security headers from the same `headers()` arrive, measured on the
 * apex on 2026-10-07 (#217). So the test passes on either of two grounds:
 *
 * - the Markdown answer's `Vary` lists `accept`, or is `*`: a cache that honours `Vary` stores the
 *   twin under a key of its own, and a browser's request never matches it. This is what
 *   `next start` sends;
 * - or the Markdown answer leaves a cache nothing to replay without asking, which is what Vercel
 *   sends. Its `Cache-Control`, and any `Surrogate-Control` or targeted `<target>-Cache-Control`
 *   field (`CDN-Cache-Control`) a CDN downstream would obey instead, with nginx's `X-Accel-Expires`
 *   at zero if sent, forbids storing it or makes every cache revalidate before each reuse
 *   (`e2e/support/cache-control.ts` has the rules, `src/test/cache-control.test.ts` their cases).
 *   When it may be stored, it and the page each carry one entity tag, and the two differ, compared
 *   weakly as `If-None-Match` compares them (RFC 9110, 13.1.2), so the revalidation names the
 *   representation the cache holds. Each representation's own tag gets a `304`, which shows the
 *   conditional reaches the site at all. A browser's `Accept` with the twin's tag gets
 *   `200 text/html`, never the `304` that would tell the cache to reuse the twin, and with both
 *   tags, as a cache holding both sends them (RFC 9111, 4.3.1), a `304` naming the page's tag or a
 *   `200` page. The agent's direction is answered the same way, with the page's tag, so a cache
 *   that does revalidate the page for an agent gets the twin.
 *
 * The limits: a cache that ignores `must-revalidate` or `no-cache` and serves what it holds anyway
 * breaks RFC 9111 (5.2.2.2, 5.2.2.4), as one that ignores `Vary` does, and is out of scope. And the
 * page's own answer carries no `accept` in its `Vary`, even under `next start`, so a cache may hand
 * the page to an agent that asked for Markdown, the trade-off ADR 0030 accepts, so the page's
 * `Cache-Control` is not checked, and nothing here guarantees the agent the twin.
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

/** The response's one entity tag, or a failure naming whose tag a cache could not name. */
function expectTag(response: APIResponse, why: string, whose: string) {
  const etag = entityTag(response.headersArray());
  if (etag.reason !== undefined) {
    throw new Error(
      `${why} ${whose} must carry one entity tag for a revalidation to name; ${etag.reason}`,
    );
  }
  return etag;
}

/**
 * That no cache downstream can hand the Markdown answer to a browser's request: `Vary` keys it on
 * `Accept`, or it is never stored, or every reuse is revalidated under a tag of its own and the
 * revalidation gets the representation it asked for.
 */
async function expectKeptApart(request: APIRequestContext, path: string) {
  const markdown = await expectMarkdown(request, path);
  const vary = varyOf(markdown);
  if (variesOnAccept(vary)) {
    return;
  }
  const why = `${path}: the Markdown answer's Vary (${vary.join(', ') || 'none'}) lacks accept, so`;

  const bound = cacheBound(markdown.headersArray());
  expect(
    bound.reason,
    `${why} its caching fields must forbid storing it (no-store) or make every cache revalidate ` +
      'it (a bare no-cache, or max-age=0 with must-revalidate, and no s-maxage above 0, ' +
      `stale-while-revalidate, stale-if-error or X-Accel-Expires other than 0); ${bound.reason}`,
  ).toBeUndefined();
  if (bound.bound === 'no-store') {
    return;
  }

  const page = await expectPage(request, path);
  const markdownTag = expectTag(markdown, why, 'it');
  const pageTag = expectTag(page, why, `the page at ${path}`);
  // A production deployment between the two answers gives them different tags for the wrong
  // reason, and leaves neither matching what the site serves now. Asking again rules that out.
  const again = expectTag(await expectMarkdown(request, path), why, 'it, asked again,');
  expect(
    again.opaque,
    `${why} its ETag must not change between requests (${markdownTag.tag}, then ${again.tag}); ` +
      'a deployment landing mid-test does that, and the next run settles it',
  ).toBe(markdownTag.opaque);
  expect(
    markdownTag.opaque,
    `${why} its ETag (${markdownTag.tag}) must differ from the page's (${pageTag.tag}), ` +
      'compared weakly',
  ).not.toBe(pageTag.opaque);

  const asks = [
    {
      who: 'browser',
      accept: BROWSER_ACCEPT,
      own: pageTag,
      other: markdownTag,
      type: /^text\/html\b/,
    },
    {
      who: ASKS_FOR_MARKDOWN,
      accept: ASKS_FOR_MARKDOWN,
      own: markdownTag,
      other: pageTag,
      type: /^text\/markdown; charset=utf-8$/,
    },
  ];
  for (const { who, accept, own, other, type } of asks) {
    const label = (tags: string) => `${why} ${path} [${who}, If-None-Match: ${tags}]`;

    // The control: without it, an If-None-Match lost on the way would let every check below pass.
    const control = await get(request, path, accept, own.tag);
    expect(
      control.status(),
      `${label(own.tag)} must get a 304 for its own representation's tag`,
    ).toBe(304);

    const cross = await get(request, path, accept, other.tag);
    expect(cross.status(), `${label(other.tag)} must get its own representation, not a 304`).toBe(
      200,
    );
    expect(cross.headers()['content-type'], `${label(other.tag)} content type`).toMatch(type);

    const bothTags = `${other.tag}, ${own.tag}`;
    const both = await get(request, path, accept, bothTags);
    if (both.status() === 304) {
      const named = entityTag(both.headersArray());
      expect(
        named.reason === undefined ? named.opaque : named.reason,
        `${label(bothTags)} answered 304, so it must name its own representation's tag`,
      ).toBe(own.opaque);
    } else {
      expect(both.status(), `${label(bothTags)} must get a 304 or its own representation`).toBe(
        200,
      );
      expect(both.headers()['content-type'], `${label(bothTags)} content type`).toMatch(type);
    }
  }
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

  test(`${path} leaves no cache downstream able to hand its Markdown to a browser`, async ({
    request,
  }) => {
    await expectKeptApart(request, path);
  });
}
