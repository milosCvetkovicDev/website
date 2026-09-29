import { expect, test, type Page, type Request } from '@playwright/test';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from './routes';
import { gotoHydrated } from './support/hydration';
import { decidingRule, parseRobots, type RobotsGroup } from './support/robots';

/**
 * robots.txt against the subresources every page needs to render (#55, AC 5; FR-3).
 *
 * Googlebot's Web Rendering Service and Applebot are the two crawlers that document a renderer, and
 * both fetch a page's subresources under its robots.txt. Block the CSS and the scripts and they
 * render, and judge, a page that is unstyled and missing whatever the client adds: Apple says so
 * for Applebot (support.apple.com/en-us/119829, published 2026-09-04), and Google's JavaScript
 * SEO basics say so for Googlebot (2026-03-04). This site served such a robots.txt until #48: every
 * render-critical subresource on `/` comes from `/_next/static/`, and `robots.ts` disallowed
 * `/_next/`. No other gate saw it: Lighthouse's `is-crawlable` and `robots-txt` audits check the
 * document and the file's syntax, never the two against each other.
 *
 * The same Apple page says Applebot follows the Googlebot instructions when robots.txt names
 * Googlebot but not Applebot (read 2026-09-28), so Applebot is checked with its own fallback order:
 * the Applebot groups, else the Googlebot groups, else `*`. Googlebot is checked with its own groups,
 * and every other crawler without a group of its own obeys `*`. `Applebot-Extended` is not a
 * crawler: the same page says it "does not crawl webpages" and only governs how Applebot's crawl
 * may be used, so it needs no check here.
 *
 * So for every route this checks two sets of URLs against `/robots.txt`, matched the way RFC 9309
 * says (`support/robots.ts`), and fails listing every same-origin one that the `*` group, Googlebot
 * or Applebot may not fetch:
 *
 * - what the served HTML names: each `<script src>`, `<link rel="stylesheet">`,
 *   `<link rel="preload">` and `<link rel="modulepreload">` href, and each `<img>` `src` and
 *   `srcset` candidate, resolved against the response's own URL and any `<base href>`;
 * - what a browser actually requests while it renders the route, up to network idle: the scripts,
 *   stylesheets, fonts, images and media, which adds the fonts a stylesheet pulls in with `url()`
 *   and any chunk an `import()` loads on its own after hydration. GSAP on `/` is not among them: it
 *   waits for the visitor's first scroll, touch or key press, which no crawler sends, so a renderer
 *   never needs it either. A `fetch`, such as a route prefetch, is not render-critical and is left
 *   out.
 *
 * The matcher is proven first, on bodies written here, because a parser that finds no rule at all
 * would pass every page, and the collection has floors of its own for the same reason.
 *
 * `seo-surface.spec.ts` keeps its own robots.txt test, which reads the file's `Disallow` lines for
 * `/_next` and `/api` directly; this one asks the question a renderer asks, per URL.
 */

test.describe.configure({ retries: 0 });

/**
 * The crawlers checked, each with its product tokens in the order it falls back through them before
 * `*`: any crawler without a group of its own, Googlebot, and Applebot, which obeys Googlebot's
 * groups when none names it.
 */
const CRAWLERS: { name: string; tokens: readonly string[] }[] = [
  { name: 'the * group', tokens: ['*'] },
  { name: 'Googlebot', tokens: ['Googlebot'] },
  { name: 'Applebot', tokens: ['Applebot', 'Googlebot'] },
];

/** Why a URL is blocked for a crawler, or `undefined` when it may be fetched. */
function blockedBy(
  groups: RobotsGroup[],
  crawler: string | readonly string[],
  url: string,
): string | undefined {
  const rule = decidingRule(groups, crawler, url);
  return rule && !rule.allow ? `Disallow: ${rule.path}` : undefined;
}

test('the robots.txt matcher reads the rules that are actually there', () => {
  // Green, and the control for the test below, which passes when nothing is disallowed: a matcher
  // that never matched would make it pass whatever robots.txt said. Each case is RFC 9309 behaviour
  // the matcher claims, on a body written here rather than served, so it cannot depend on robots.ts.
  const beforeFix48 = [
    'User-Agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /_next/',
    '',
    'Sitemap: https://miloscvetkovic.dev/sitemap.xml',
  ].join('\n');
  const groupsToCombine = [
    'User-agent: Googlebot',
    'Allow: /_next/static/',
    '',
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: googlebot',
    'Disallow: /_next/',
  ].join('\n');
  const APPLEBOT = CRAWLERS[2]!.tokens;
  const cases: {
    what: string;
    body: string;
    crawler: string | readonly string[];
    url: string;
    allowed: boolean;
  }[] = [
    {
      what: "robots.ts before #48 blocks the site's own chunks",
      body: beforeFix48,
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'and Googlebot, which has no group of its own there, obeys `*`',
      body: beforeFix48,
      crawler: 'Googlebot',
      url: '/_next/static/css/app.css',
      allowed: false,
    },
    {
      what: 'while a page stays allowed by the shorter `Allow: /`',
      body: beforeFix48,
      crawler: '*',
      url: '/work/self-healing-agent',
      allowed: true,
    },
    {
      what: 'the longest match wins',
      body: 'User-agent: *\nDisallow: /_next/\nAllow: /_next/static/',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: 'the longest match wins the other way round too',
      body: 'User-agent: *\nAllow: /_next/\nDisallow: /_next/static/',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'Allow wins a tie',
      body: 'User-agent: *\nDisallow: /_next/\nAllow: /_next/',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: '`*` matches any run of characters',
      body: 'User-agent: *\nDisallow: /*.css',
      crawler: '*',
      url: '/_next/static/chunks/app.css?v=1',
      allowed: false,
    },
    {
      what: '`$` anchors the rule to the end of the URL',
      body: 'User-agent: *\nDisallow: /*.css$',
      crawler: '*',
      url: '/_next/static/chunks/app.css?v=1',
      allowed: true,
    },
    {
      what: 'a Googlebot group replaces `*` for Googlebot, whatever its case',
      body: 'User-agent: *\nDisallow: /\n\nuser-agent: GOOGLEBOT\nAllow: /',
      crawler: 'Googlebot',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: 'and leaves `*` as it was for every other crawler',
      body: 'User-agent: *\nDisallow: /\n\nuser-agent: GOOGLEBOT\nAllow: /',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: "consecutive user-agent lines share one group's rules",
      body: 'User-agent: Bingbot\nUser-agent: Googlebot\nDisallow: /_next/\n\nUser-agent: *\nAllow: /',
      crawler: 'Googlebot',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: "a crawler's groups combine: the rule from its second group applies",
      body: groupsToCombine,
      crawler: 'Googlebot',
      url: '/_next/image?url=%2Fog.png',
      allowed: false,
    },
    {
      what: 'and so does the longer rule from its first',
      body: groupsToCombine,
      crawler: 'Googlebot',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: 'comments and records outside RFC 9309 are skipped without ending the group',
      body: 'User-agent: * # everyone\nContent-Signal: search=yes, ai-train=no\nDisallow: /_next/ # no',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'an empty Disallow disallows nothing',
      body: 'User-agent: *\nDisallow:',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: 'a rule before any user-agent line belongs to no group',
      body: 'Disallow: /\nUser-agent: *\nAllow: /about',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: 'an Applebot group decides for Applebot over a Googlebot group',
      body: 'User-agent: Googlebot\nAllow: /\n\nUser-agent: Applebot\nDisallow: /_next/',
      crawler: APPLEBOT,
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'Applebot obeys the Googlebot group when no group names it, not `*`',
      body: 'User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /_next/',
      crawler: APPLEBOT,
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'and `*` when neither Applebot nor Googlebot has a group',
      body: 'User-agent: Bingbot\nAllow: /\n\nUser-agent: *\nDisallow: /_next/',
      crawler: APPLEBOT,
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: '`Allow: /$` allows the root itself under `Disallow: /`',
      body: 'User-agent: *\nDisallow: /\nAllow: /$',
      crawler: '*',
      url: '/',
      allowed: true,
    },
    {
      what: 'but nothing below it',
      body: 'User-agent: *\nDisallow: /\nAllow: /$',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'a `$` rule loses to a longer unanchored one',
      body: 'User-agent: *\nAllow: /*.js$\nDisallow: /_next/static/',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'a run of `*` matches like one',
      body: 'User-agent: *\nDisallow: /_next/**.js',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: false,
    },
    {
      what: 'the rules under an empty User-agent apply to nobody, not to the group before it',
      body: 'User-agent: *\nDisallow: /about\n\nUser-agent:\nDisallow: /_next/',
      crawler: '*',
      url: '/_next/static/chunks/app.js',
      allowed: true,
    },
    {
      what: 'a rule written in raw UTF-8 matches the percent-encoded URL',
      body: 'User-agent: *\nDisallow: /café',
      crawler: '*',
      url: '/café',
      allowed: false,
    },
    {
      what: 'robots.txt itself is always allowed',
      body: 'User-agent: *\nDisallow: /',
      crawler: '*',
      url: '/robots.txt',
      allowed: true,
    },
  ];

  const wrong = cases
    .filter(({ body, crawler, url, allowed }) => {
      const blocked = blockedBy(parseRobots(body), crawler, url) !== undefined;
      return blocked === allowed;
    })
    .map(
      ({ what, crawler, url, allowed }) =>
        `${what}: ${String(crawler)} ${url} should be ${allowed ? 'allowed' : 'disallowed'}`,
    );
  expect(wrong, 'the matcher in support/robots.ts reads these bodies unlike RFC 9309').toEqual([]);
});

/** What the served HTML names for a page to render, as written, and its `<base href>` if any. */
async function subresources(
  page: Page,
  html: string,
): Promise<{ base: string | null; scripts: string[]; stylesheets: string[]; others: string[] }> {
  // Parsed by the browser, as `servedText` does, and for the same reasons: a scripting-disabled
  // document, and the HTML parsing algorithm rather than patterns. `rel` is a case-insensitive
  // token list, so `rel="preload stylesheet"` counts and `rel="Stylesheet"` does too. An empty
  // attribute names no subresource (it would resolve to the page itself), so it is dropped.
  return page.evaluate((markup) => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const values = (selector: string, attribute: string) =>
      [...doc.querySelectorAll(selector)]
        .map((element) => element.getAttribute(attribute)?.trim() ?? '')
        .filter((value) => value !== '');
    // A srcset is a comma-separated list of candidates, each a URL and an optional descriptor.
    const candidates = (srcset: string) =>
      srcset
        .split(',')
        .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
        .filter((value) => value !== '');
    return {
      base: doc.querySelector('base[href]')?.getAttribute('href') ?? null,
      scripts: values('script[src]', 'src'),
      stylesheets: values('link[rel~="stylesheet" i][href]', 'href'),
      others: [
        ...values('link[rel~="preload" i][href], link[rel~="modulepreload" i][href]', 'href'),
        ...values('img[src]', 'src'),
        ...values('img[srcset], source[srcset]', 'srcset').flatMap(candidates),
      ],
    };
  }, html);
}

/** The request types a renderer needs to draw a page. A `fetch`, such as a route prefetch, is not. */
const RENDER_TYPES = new Set(['script', 'stylesheet', 'font', 'image', 'media']);

/** Every render-critical request a browser makes while it loads `path`, up to network idle. */
async function requestedWhileRendering(
  page: Page,
  path: string,
): Promise<{ url: string; type: string }[]> {
  const requests: { url: string; type: string }[] = [];
  const record = (request: Request) => {
    const type = request.resourceType();
    if (RENDER_TYPES.has(type)) requests.push({ url: request.url(), type });
  };
  page.on('request', record);
  try {
    await gotoHydrated(page, path);
    // Network idle, not only hydration, so a chunk an effect imports after hydration counts too.
    await page.waitForLoadState('networkidle');
  } finally {
    page.off('request', record);
  }
  return requests;
}

test('robots.txt allows every subresource a page needs to render', async ({ page, request }) => {
  // Ten routes, each loaded in the browser up to network idle as well as fetched.
  test.setTimeout(120_000);

  // Fetched without following redirects, and checked for its type: a crawler may treat a redirected
  // or HTML-typed robots.txt differently from the body parsed here.
  const robots = await request.get('/robots.txt', { maxRedirects: 0 });
  expect(robots.status(), '/robots.txt must answer 200 itself, not through a redirect').toBe(200);
  expect(
    robots.headers()['content-type'] ?? '',
    '/robots.txt must be served as text/plain',
  ).toMatch(/^text\/plain\b/);
  const groups = parseRobots(await robots.text());
  expect(
    groups.length,
    '/robots.txt parsed to no group at all, so every URL would count as allowed whatever it says',
  ).toBeGreaterThan(0);

  /** What the collection itself got wrong: a broken collector, not a robots.txt problem. */
  const collection: string[] = [];
  /** Each blocked URL, with the rule that blocks it for each crawler and the routes that load it. */
  const blocked = new Map<string, { rules: Set<string>; paths: Set<string> }>();
  let fontsRequested = 0;
  const routes = [...STATIC_ROUTES, ...CASE_STUDY_ROUTES];
  for (const path of routes) {
    const response = await request.get(path);
    expect(response.status(), `${path} must answer 200`).toBe(200);
    const { base, scripts, stylesheets, others } = await subresources(page, await response.text());

    // The floor that keeps this from passing on nothing: every route loads the framework's chunks
    // and the global stylesheet, so a route with no script or no stylesheet means the collection
    // broke, not that the route is clean.
    if (scripts.length === 0) collection.push(`${path}: no <script src> in the served HTML`);
    if (stylesheets.length === 0) collection.push(`${path}: no stylesheet in the served HTML`);

    const requested = await requestedWhileRendering(page, path);
    fontsRequested += requested.filter(({ type }) => type === 'font').length;

    // Relative URLs resolve as a crawler resolves them: against the URL the response came from,
    // after any redirect, then against the document's `<base href>`.
    const pageUrl = new URL(response.url());
    let baseUrl = pageUrl;
    if (base !== null) {
      try {
        baseUrl = new URL(base, pageUrl);
      } catch {
        collection.push(`${path}: unparseable <base href="${base}">`);
      }
    }

    let checked = 0;
    for (const raw of [...scripts, ...stylesheets, ...others, ...requested.map(({ url }) => url)]) {
      let url: URL;
      try {
        url = new URL(raw, baseUrl);
      } catch {
        collection.push(`${path}: unparseable subresource URL ${raw}`);
        continue;
      }
      // Another origin answers to its own robots.txt, not this one. The CSP (ADR 0023) refuses any
      // other origin today, so every URL collected here is this site's.
      if (url.origin !== pageUrl.origin) continue;
      checked += 1;
      const target = `${url.pathname}${url.search}`;
      for (const { name, tokens } of CRAWLERS) {
        const reason = blockedBy(groups, tokens, target);
        if (!reason) continue;
        const entry = blocked.get(target) ?? { rules: new Set(), paths: new Set() };
        entry.rules.add(`${name} (${reason})`);
        entry.paths.add(path);
        blocked.set(target, entry);
      }
    }
    if (checked === 0) collection.push(`${path}: no same-origin subresource was checked`);
  }
  // Every route sets its text in the self-hosted fonts, which only a stylesheet's `url()` names: a
  // walk that saw no font request is not recording what the browser fetches.
  if (fontsRequested === 0) collection.push('no route requested a font while rendering');

  expect
    .soft(
      collection,
      'the subresource collection found nothing to check or could not read what it found: ' +
        'the collector in this spec broke, not robots.txt',
    )
    .toEqual([]);

  const problems: string[] = [];
  for (const [url, { rules, paths }] of blocked) {
    const where = paths.size === routes.length ? 'every route' : [...paths].join(', ');
    problems.push(`${url}: disallowed for ${[...rules].join(' and ')}, on ${where}`);
  }
  expect(
    problems,
    'robots.txt disallows subresources these pages need to render, so Googlebot and Applebot ' +
      'render them unstyled and without their scripts. `src/app/robots.ts` must not disallow ' +
      '`/_next/` or anything under it.',
  ).toEqual([]);
});
