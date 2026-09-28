import { expect, test, type Page } from '@playwright/test';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from './routes';
import { decidingRule, parseRobots, type RobotsGroup } from './support/robots';

/**
 * robots.txt against the scripts and stylesheets every page needs to render (#55, AC 5; FR-3).
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
 * Googlebot but not Applebot (read 2026-09-28), so a Googlebot group decides for both renderers,
 * and every other crawler without a group of its own obeys `*`.
 *
 * So for every route this collects each `<script src>` and `<link rel="stylesheet" href>` from the
 * served HTML, and fails listing every URL that the `*` group or a Googlebot group of `/robots.txt`
 * disallows, matched the way RFC 9309 says (`support/robots.ts`). The matcher is proven first,
 * on bodies written here, because a parser that finds no rule at all would pass every page.
 *
 * `seo-surface.spec.ts` keeps its own robots.txt test, which reads the file's `Disallow` lines for
 * `/_next` and `/api` directly; this one asks the question a renderer asks, per URL.
 */

test.describe.configure({ retries: 0 });

/** The crawlers whose groups decide: any crawler without a group of its own, and Googlebot. */
const CRAWLERS = ['*', 'Googlebot'] as const;

/** Why a URL is blocked for a crawler, or `undefined` when it may be fetched. */
function blockedBy(groups: RobotsGroup[], crawler: string, url: string): string | undefined {
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
  const cases: { what: string; body: string; crawler: string; url: string; allowed: boolean }[] = [
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
        `${what}: ${crawler} ${url} should be ${allowed ? 'allowed' : 'disallowed'}`,
    );
  expect(wrong, 'the matcher in support/robots.ts reads these bodies unlike RFC 9309').toEqual([]);
});

/** The `src` of every script and the `href` of every stylesheet in `html`, as written. */
async function subresources(
  page: Page,
  html: string,
): Promise<{ scripts: string[]; stylesheets: string[] }> {
  // Parsed by the browser, as `servedText` does, and for the same reasons: a scripting-disabled
  // document, and the HTML parsing algorithm rather than patterns. `rel` is a case-insensitive
  // token list, so `rel="preload stylesheet"` counts and `rel="Stylesheet"` does too.
  return page.evaluate((markup) => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const values = (selector: string, attribute: string) =>
      [...doc.querySelectorAll(selector)].map((element) => element.getAttribute(attribute) ?? '');
    return {
      scripts: values('script[src]', 'src'),
      stylesheets: values('link[rel~="stylesheet" i][href]', 'href'),
    };
  }, html);
}

test('robots.txt allows every script and stylesheet a page needs to render', async ({
  page,
  request,
  baseURL,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status(), '/robots.txt must answer 200').toBe(200);
  const groups = parseRobots(await robots.text());

  const problems: string[] = [];
  /** Each blocked URL, with the rule that blocks it for each crawler and the routes that load it. */
  const blocked = new Map<string, { rules: Set<string>; paths: Set<string> }>();
  const routes = [...STATIC_ROUTES, ...CASE_STUDY_ROUTES];
  for (const path of routes) {
    const response = await request.get(path);
    expect(response.status(), `${path} must answer 200`).toBe(200);
    const pageUrl = new URL(path, baseURL);
    const { scripts, stylesheets } = await subresources(page, await response.text());

    // The floor that keeps this from passing on nothing: every route loads the framework's chunks
    // and the global stylesheet, so a route with no script or no stylesheet means the collection
    // broke, not that the route is clean.
    if (scripts.length === 0) problems.push(`${path}: no <script src> collected`);
    if (stylesheets.length === 0) problems.push(`${path}: no stylesheet collected`);

    for (const raw of [...scripts, ...stylesheets]) {
      const url = new URL(raw, pageUrl);
      // Another origin answers to its own robots.txt, not this one. The CSP (ADR 0023) refuses any
      // other origin today, so every URL collected here is this site's.
      if (url.origin !== pageUrl.origin) continue;
      const target = `${url.pathname}${url.search}`;
      for (const crawler of CRAWLERS) {
        const reason = blockedBy(groups, crawler, target);
        if (!reason) continue;
        const entry = blocked.get(target) ?? { rules: new Set(), paths: new Set() };
        entry.rules.add(`${crawler === '*' ? 'the * group' : crawler} (${reason})`);
        entry.paths.add(path);
        blocked.set(target, entry);
      }
    }
  }
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
