import { isDeepStrictEqual } from 'node:util';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { OWNER_TODO } from '../src/data/owner-todo';
import { yearsOfExperience } from '../src/data/profile';
import { yearsClausesAboutAi, yearsFigures } from '../src/test/experience-claims';
import {
  CASE_STUDY_ROUTES,
  NOT_FOUND_ROUTE,
  PAGE_ROUTES,
  POST_ROUTES,
  STATIC_ROUTES,
  caseStudyRoute,
  expectedStatus,
  postRoute,
} from './routes';
import { caseStudies, caseStudyMetricScope } from '../src/data/case-studies';
import { questions } from '../src/data/pages/about';
import { coreSkills, skillsCopy } from '../src/data/pages/skills';
import { workCopy } from '../src/data/pages/work';
import { hasPublishedPosts, publishedPosts } from '../src/data/posts';
import { RUNS_IN_PRODUCTION } from '../src/data/work-stats';
import { restatedMetrics, wordCount } from '../src/test/answer-copy';
import { formatContentDate } from '../src/lib/content-date';
import { STATIC_ROUTE_UPDATED } from '../src/data/static-routes';
import { fetchHead, first } from './support/served-head';
import { TABLES, expectedTable, servedTables } from './support/tables';
import { PAGE_HEADINGS } from './support/page-headings';
// #58's tables, counted from the data their records read (the last tests in this file).
import { facts, shownFacts, timeline } from '../src/data/pages/about';
import { skillCategories } from '../src/data/pages/skills';
// The Person's visible facts (57b, the describe at the end of this file).
import { servedText } from './support/served-text';
import { jsonLdNodes } from './support/json-ld';
// The scope every figure states (58e, the describe before the Person's).
import { visible } from '../src/test/markdown';
import {
  CASE_STUDIES_JSON,
  CASE_STUDY_ENDPOINTS,
  FEED,
  MARKDOWN_TWINS,
  markdownTwinPath,
} from './endpoints';

/**
 * The head every crawler and link-preview bot reads.
 *
 * Rows R22 to R29 of the RED manifest, all fixed by #48, plus the green floor around them. Nothing
 * tested this surface at all before: of the 22 test and spec files under `apps/web`, none matched
 * `sitemap`, `robots`, `canonical`, `og:`, `twitter:` or `ld+json`, and the only head assertion
 * anywhere was `toHaveTitle(/Milos Cvetkovic/)`, which CLAUDE.md itself calls a smoke check.
 *
 * Everything here reads the **served HTML** through `request.get(path)` rather than the hydrated DOM,
 * and that is the whole point rather than a convenience: no dedicated crawler or preview bot executes
 * JavaScript, so a tag React adds after hydration does not exist as far as they are concerned. The one
 * exception is R29's `color-scheme`, which is a computed style and can only be read in a page.
 *
 * The parsing is deliberately blunt — patterns over the `<head>` — because that is closer to what a bot
 * does than a DOM would be, and because Next also embeds a JSON-escaped copy of the head in the RSC
 * flight payload further down the document. Matching only inside `<head>` is what keeps the payload's
 * copy from answering for a tag that is not really there, the same trap `not-found-shell.spec.ts`
 * documents. The parser lives in `support/served-head.ts`, shared with `markdown-twins.spec.ts`.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

/** Every route a crawler can reach, with the status it answers. */
const routes = PAGE_ROUTES.map((path) => ({ path, status: expectedStatus(path) }));

/** A pathname from a head URL, with the trailing slash of anything but the root dropped. */
const pathOf = (url: string) =>
  new URL(url, 'https://miloscvetkovic.dev').pathname.replace(/(.)\/$/, '$1');

// A 404 is one prerendered document served for every unknown URL, so nothing in its head can name
// the URL that was asked for: a canonical or og:url there would name `/_not-found`, or the home page,
// and every broken link would claim that URL. Making the page render per request would fix that
// only by making every route dynamic. The owner decision of 2026-09-23: a 404 names no URL at all.
const NAMES_NO_URL = 'a 404 must name no URL: it is one static document for every unknown path';

test('the head parser reads the tags that are actually there', async ({ request }) => {
  // Green, and the control for all eight rows below. Every one of them asserts that something is
  // *missing*, so a parser that found nothing at all would make them all fail convincingly and the
  // fixes would be judged against an instrument that cannot see. The tags asserted here are ones the
  // site already serves.
  const head = await fetchHead(request, '/about');
  expect(head.status).toBe(200);
  expect(first(head.meta, 'description'), 'the About description must be parsed').toContain(
    'legacy codebases',
  );
  expect(first(head.meta, 'og:title')).toBe('About Milos Cvetkovic');
  expect(first(head.meta, 'twitter:card')).toBe('summary_large_image');
  expect(head.meta.get('robots')).toBeDefined();
  expect(head.raw).toContain('application/ld+json');
});

test('every page serves one canonical link for its own path, and a 404 serves none', async ({
  request,
}) => {
  const problems: string[] = [];
  for (const { path, status } of routes) {
    const head = await fetchHead(request, path);
    expect(head.status, `${path} should answer ${status}`).toBe(status);
    const canonicals = head.link.get('canonical') ?? [];
    if (status === 404) {
      if (canonicals.length > 0) problems.push(`${path}: ${NAMES_NO_URL}, got ${canonicals}`);
      continue;
    }
    if (canonicals.length !== 1) {
      problems.push(`${path}: ${canonicals.length} canonical links, expected 1`);
      continue;
    }
    // The path must be its own, not the home page's: one canonical pointing everywhere is worse than
    // none, because it tells a crawler these are all the same document.
    if (pathOf(canonicals[0]) !== path) {
      problems.push(`${path}: canonical points at ${canonicals[0]}`);
    }
  }

  expect(
    problems,
    'every page sets `alternates.canonical` to its own path through buildMetadata() ' +
      '(src/lib/metadata.ts); nothing in the root layout may, or it would reach the 404s.',
  ).toEqual([]);
});

test('every route serves an og:image that answers with an image', async ({ request }) => {
  const problems: string[] = [];
  const reachability = new Map<string, string>();
  for (const { path } of routes) {
    const head = await fetchHead(request, path);
    const image = first(head.meta, 'og:image');
    if (!image) {
      problems.push(`${path}: no og:image, while twitter:card is summary_large_image`);
      continue;
    }
    // Reachability, once per distinct URL: a card that references a 404 renders as a bare link.
    //
    // Fetched by *path* against the server this run started, not by the absolute URL in the tag.
    // `metadataBase` (`layout.tsx:38`) makes every metadata URL absolute to https://miloscvetkovic.dev,
    // so once #48 adds an `og:image` the tag will name the production origin — and fetching that would
    // check the deployed site rather than this build, would fail whenever production lags the branch,
    // and would make the suite need the network. The path is what this server can answer for. A tag
    // that ever points at a genuinely different host (a CDN) keeps its own URL and is fetched as-is.
    if (!reachability.has(image)) {
      const resolved = new URL(image, 'https://miloscvetkovic.dev');
      const target =
        resolved.host === 'miloscvetkovic.dev' ? `${resolved.pathname}${resolved.search}` : image;
      const response = await request.get(target);
      const type = response.headers()['content-type'] ?? '(none)';
      reachability.set(
        image,
        response.status() === 200 && type.startsWith('image/')
          ? ''
          : `answers ${response.status()} with content-type ${type}`,
      );
    }
    const failure = reachability.get(image);
    if (failure) problems.push(`${path}: og:image ${image} ${failure}`);
  }

  expect(
    problems,
    'no metadata sets `images:`, there is no `opengraph-image` file under src/app and ' +
      '/opengraph-image answers 404, while layout.tsx:75 promises `summary_large_image`. Every ' +
      'shared link renders as a bare URL.',
  ).toEqual([]);
});

test('every route serves the full Open Graph set and its own twitter:title', async ({
  request,
}) => {
  const problems: string[] = [];
  const twitterTitles = new Map<string, string>();
  for (const { path, status } of routes) {
    const head = await fetchHead(request, path);
    for (const key of ['og:site_name', 'og:locale', 'og:type']) {
      if (!first(head.meta, key)) problems.push(`${path}: no ${key}`);
    }
    const url = first(head.meta, 'og:url');
    if (status === 404) {
      if (url) problems.push(`${path}: ${NAMES_NO_URL}, got og:url ${url}`);
    } else if (!url) {
      problems.push(`${path}: no og:url`);
    } else if (pathOf(url) !== path) {
      // Its own URL, the same one the canonical names, not the home page's.
      problems.push(`${path}: og:url points at ${url}`);
    }
    const twitterTitle = first(head.meta, 'twitter:title');
    if (!twitterTitle) problems.push(`${path}: no twitter:title`);
    else twitterTitles.set(path, twitterTitle);
  }

  // A sub-page that serves the home page's twitter:title is a second bug with the same cause: an
  // `openGraph` or `twitter` object on a route *replaces* the root's rather than merging into it, so
  // the inherited fields vanish and the card falls back to whatever the root still declares.
  const home = twitterTitles.get('/');
  const borrowed = [...twitterTitles]
    .filter(([path, title]) => path !== '/' && title === home)
    .map(([path]) => path);
  if (borrowed.length > 0) {
    problems.push(`these routes serve the home page's twitter:title: ${borrowed.join(', ')}`);
  }

  expect(
    problems,
    'a per-route `openGraph` object replaces the root one instead of merging: every page builds ' +
      'its whole set through buildMetadata() (src/lib/metadata.ts).',
  ).toEqual([]);
});

test('robots.txt allows what the site serves and names nothing it does not', async ({
  request,
}) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  const body = await response.text();
  const disallowed = [...body.matchAll(/^\s*Disallow:\s*(\S+)\s*$/gim)].map(([, path]) => path);

  const problems: string[] = [];
  // `/_next/` holds every stylesheet, chunk and font. Disallowing it tells a crawler it may not fetch
  // the CSS, which is how a page gets rendered — and judged — unstyled.
  const nextRules = disallowed.filter((path) => path.startsWith('/_next'));
  if (nextRules.length > 0) problems.push(`robots.txt disallows ${nextRules.join(', ')}`);
  // A rule for a path the app has no route for is cargo cult: there is no `api` segment anywhere under
  // src/app, and a rule nobody can violate is a rule nobody maintains.
  for (const path of disallowed) {
    if (path.startsWith('/api')) problems.push(`robots.txt disallows ${path}, which is not served`);
  }

  expect(
    problems,
    "robots.ts:10 is `disallow: ['/api/', '/_next/']`. /_next/static holds the CSS, the chunks and " +
      'the fonts, and there is no api route in this app.',
  ).toEqual([]);
});

// R26 (#48), rewritten by #61 from "/blog is noindex while it is a placeholder" to the conditional
// contract: `hasPublishedPosts` (ADR 0028) is the switch, so the owner's commit that publishes the
// first post flips this row by data, and the same row then holds /blog to being indexable.
test('the /blog robots meta contains noindex if and only if publishedPosts is empty', async ({
  request,
}) => {
  const head = await fetchHead(request, '/blog');
  expect(head.status).toBe(200);
  const robots = head.meta.get('robots') ?? [];
  expect(robots, '/blog should serve one robots tag').toHaveLength(1);

  // The directives as tokens, so `noindex` is never read as containing `index`.
  const directives = robots[0].split(',').map((directive) => directive.trim().toLowerCase());
  if (hasPublishedPosts) {
    expect(
      directives,
      `with ${publishedPosts.length} post(s) published /blog lists them, and must be indexable`,
    ).toEqual(expect.arrayContaining(['index', 'follow']));
    expect(
      directives.filter((directive) => ['noindex', 'nofollow', 'none'].includes(directive)),
    ).toEqual([]);
  } else {
    expect(
      directives,
      'with no post published /blog is the Coming Soon placeholder, and an empty page offered to ' +
        'search is the defect #48 fixed: the owner decision of 2026-09-11 keeps the nav link and ' +
        'the placeholder, and makes it noindex',
    ).toContain('noindex');
  }
});

test('a 404 serves exactly one robots tag, and it says noindex', async ({ request }) => {
  const head = await fetchHead(request, NOT_FOUND_ROUTE);
  expect(head.status).toBe(404);
  const robots = head.meta.get('robots') ?? [];

  // Two tags that contradict each other are worse than the wrong one. Next injects `noindex` on every
  // 404, and anything the root layout's metadata declares reaches the not-found page too, which is how
  // it used to serve `index, follow` alongside it, plus a googlebot `index, follow`. So robots
  // directives are set per page (lib/metadata.ts) and never in the root layout.
  expect(
    { robots, googlebot: head.meta.get('googlebot') ?? [] },
    'a 404 must be noindex, and must not also claim index, follow.',
  ).toEqual({ robots: [expect.stringContaining('noindex')], googlebot: [] });
});

test('the icons and the web manifest are served, and the favicon is not boilerplate', async ({
  request,
}) => {
  const problems: string[] = [];
  for (const [path, expectedType] of [
    ['/icon', 'image/'],
    ['/apple-icon', 'image/'],
    ['/manifest.webmanifest', 'manifest'],
  ] as const) {
    const response = await request.get(path);
    const type = response.headers()['content-type'] ?? '(none)';
    if (response.status() !== 200 || !type.includes(expectedType)) {
      problems.push(`${path}: ${response.status()}, content-type ${type}`);
    }
  }

  // create-next-app's favicon is 25,931 bytes of Next.js logo. Anything the owner draws will differ;
  // pinning the size rather than the bytes keeps the assertion readable and still fails only on the
  // boilerplate.
  const favicon = await request.get('/favicon.ico');
  if (favicon.status() === 200 && (await favicon.body()).byteLength === 25_931) {
    problems.push("/favicon.ico is still create-next-app's 25,931-byte Next.js mark");
  }

  expect(
    problems,
    'there is no icon.*, apple-icon* or manifest* file under src/app, so a bookmark on iOS and an ' +
      'installed shortcut both fall back to a screenshot, and the tab still shows the Next.js logo.',
  ).toEqual([]);
});

test('the head declares theme-color and color-scheme, and color-scheme follows the theme', async ({
  page,
  request,
}) => {
  const head = await fetchHead(request, '/');
  const problems: string[] = [];
  if (!head.meta.get('theme-color')) problems.push('no theme-color in the served head');
  if (!head.meta.get('color-scheme')) problems.push('no color-scheme in the served head');

  // And the computed value, which is the half a served tag cannot prove. Without a `color-scheme`
  // declaration the browser paints its own form controls, scrollbars and canvas for the light scheme
  // even under the dark theme.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toContainClass('dark');
  const computed = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  );
  if (!computed.includes('dark')) {
    problems.push(`under the dark theme, getComputedStyle(html).colorScheme is "${computed}"`);
  }

  expect(
    problems,
    'neither declaration exists in apps/web/src — the only match for the string is the ' +
      "DARK_COLOR_SCHEME_QUERY media query at lib/theme.ts:6 — so the browser's own chrome " +
      '(scrollbars, form controls, the canvas behind the page) stays light under the dark theme.',
  ).toEqual([]);
});

test('the sitemap and robots.txt are served and agree with the routes', async ({ request }) => {
  // Green, and the only place the two metadata routes are fetched over HTTP: their *contents* are unit
  // tested in src/app/__tests__, which is faster and can assert the shape, but neither would catch a
  // route that stopped being served at all.
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  const xml = await sitemap.text();
  // Compared by pathname, not by full URL: the origin comes from NEXT_PUBLIC_SITE_URL with a fallback
  // (`baseUrl` in sitemap.ts), so pinning `https://miloscvetkovic.dev` would fail for anyone who sets that
  // variable — and the origin is not what this test is about. R31 pins the URL *set* against the data.
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) =>
    new URL(url).pathname.replace(/(.)\/$/, '$1'),
  );
  expect(listed.length, 'the sitemap must list something').toBeGreaterThan(0);
  // Every static route but /blog, which is there only once a post is published (#61): while none
  // is, the owner decision of 2026-09-11 keeps the noindex placeholder out of the sitemap. R31 pins
  // both sides on the sitemap() output itself.
  for (const path of STATIC_ROUTES.filter((route) => route !== '/blog')) {
    expect(listed, `the sitemap must list ${path}`).toContain(path);
  }
  expect(
    listed.includes('/blog'),
    hasPublishedPosts
      ? 'with a post published the sitemap must list /blog'
      : 'with no post published /blog is a noindex placeholder, and the sitemap must not offer it',
  ).toBe(hasPublishedPosts);

  // Every published post, dated by the day what it says last changed (AC 8). None yet, so this loop
  // runs once the owner publishes the first; `sitemap.test.ts` proves it over the fixture posts.
  // Keyed as `listed` is, trailing slash dropped; an entry with no <loc> has no key to be under.
  const lastmodOf = new Map(
    [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(([, entry]) => {
      const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
      if (!loc) return [];
      const path = new URL(loc).pathname.replace(/(.)\/$/, '$1');
      return [[path, entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]] as const];
    }),
  );
  for (const { slug, updatedAt } of publishedPosts) {
    const path = postRoute(slug);
    expect(listed, `the sitemap must list ${path}`).toContain(path);
    expect(lastmodOf.get(path), `${path}'s lastmod must be its updatedAt`).toBe(updatedAt);
  }

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const body = await robots.text();
  expect(body.toLowerCase()).toContain('user-agent: *');
  expect(body, 'robots.txt must point at the sitemap').toContain('Sitemap:');
});

test('no route, nor the sitemap, robots.txt or the manifest, serves an owner placeholder', async ({
  request,
}) => {
  // The publication rule of src/data/owner-todo.ts: whatever renders a value the owner has not
  // supplied yet omits it rather than printing its marker. A typed placeholder's `state` and every
  // `ownerTodo(...)` marker both contain OWNER_TODO, so one search of each served body covers both,
  // flight payload included. The social cards need no search of their own: each draws its title,
  // description and tags from the same data the page's head and body serve here. The status and a
  // non-empty body are the control, soft so that one broken route does not hide a leak on the next:
  // an error page or an empty response contains no marker either.
  const served = [
    ...routes,
    { path: '/sitemap.xml', status: 200 },
    { path: '/robots.txt', status: 200 },
    { path: '/manifest.webmanifest', status: 200 },
  ];
  const problems: string[] = [];
  for (const { path, status } of served) {
    const response = await request.get(path);
    const body = await response.text();
    expect.soft(response.status(), path).toBe(status);
    expect.soft(body.length, `${path} must serve a body`).toBeGreaterThan(0);
    const leaks = [...body.matchAll(new RegExp(OWNER_TODO, 'g'))];
    for (const { index } of leaks.slice(0, 5)) {
      problems.push(`${path} serves "${body.slice(Math.max(0, index - 40), index + 60)}"`);
    }
    if (leaks.length > 5) problems.push(`${path} serves ${leaks.length - 5} more`);
  }
  expect(
    problems,
    'a placeholder reached served output: omit the sentence, row or block until the owner fills it',
  ).toEqual([]);
});

/**
 * A route's JSON-LD nodes, its canonical links and its "Last updated" lines, as served. The nodes
 * come from `jsonLdNodes` in `support/json-ld.ts`, the module every spec reads JSON-LD through. The
 * browser's `DOMParser` reads the rest, as `servedCaseStudy()` below does: the canonical comes from
 * the parsed `<head>`, never from the copy of the head in the RSC flight payload, and only real
 * `<time>` elements count.
 */
async function servedGraph(request: APIRequestContext, page: Page, path: string) {
  const response = await request.get(path);
  expect(response.status(), `GET ${path}`).toBe(expectedStatus(path));
  const html = await response.text();
  const { canonicals, lastUpdated, title, lang } = await page.evaluate((markup) => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    return {
      title: doc.head.querySelector('title')?.textContent ?? null,
      lang: doc.documentElement.getAttribute('lang'),
      canonicals: [...doc.head.querySelectorAll('link[rel="canonical"]')].map(
        (link) => link.getAttribute('href') ?? '',
      ),
      lastUpdated: [...doc.body.querySelectorAll('p')]
        .filter((p) => (p.textContent ?? '').trim().startsWith('Last updated'))
        .map((p) => ({
          text: (p.textContent ?? '').trim(),
          datetimes: [...p.querySelectorAll('time')].map((time) => time.getAttribute('datetime')),
        })),
    };
  }, html);
  return { nodes: jsonLdNodes(html, path), canonicals, lastUpdated, title, lang };
}

/** Every string under a key that holds a link, at any depth, with where it sits. */
function linksIn(value: unknown, at = ''): { at: string; link: string }[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => linksIn(entry, `${at}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const where = at === '' ? key : `${at}.${key}`;
    if (['@id', 'url', 'item', 'image', 'sameAs'].includes(key)) {
      const strings = (Array.isArray(entry) ? entry : [entry]).filter(
        (link): link is string => typeof link === 'string',
      );
      if (strings.length > 0) return strings.map((link) => ({ at: where, link }));
    }
    return linksIn(entry, where);
  });
}

/** Every object below a node's root that carries an `@id`: the node's references to other nodes. */
function referencesIn(value: unknown, at = ''): { at: string; ref: Record<string, unknown> }[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => referencesIn(entry, `${at}[${i}]`));
  if (typeof value !== 'object' || value === null) return [];
  const own = at !== '' && '@id' in value ? [{ at, ref: value as Record<string, unknown> }] : [];
  return [
    ...own,
    ...Object.entries(value).flatMap(([key, entry]) =>
      referencesIn(entry, at === '' ? key : `${at}.${key}`),
    ),
  ];
}

test('every route serves its JSON-LD as one graph of pinned types, joined by @id (#57)', async ({
  page,
  request,
}) => {
  // `json-ld.tsx` writes its objects straight into script elements, so a malformed object would ship
  // as broken JSON with nothing failing; the escape they all go through is R32, unit tested in
  // src/components/__tests__/json-ld.test.tsx with the graph itself. This is the served half: the
  // layout's Person and WebSite on every route, the 404 included, then the page's own nodes. Every
  // node has an `@id` of its own, every reference names a node the same document serves and carries
  // nothing else, and a page node's `url` is the canonical link the same document serves.
  // A case study and a post are both an article on a page of their own, with #57's types and no
  // new one (#61, 61f).
  const articleRoutes: readonly string[] = [...CASE_STUDY_ROUTES, ...POST_ROUTES];
  const typesOf = (path: string) => {
    if (path === NOT_FOUND_ROUTE) return ['Person', 'WebSite'];
    if (path === '/about') return ['Person', 'WebSite', 'ProfilePage'];
    if (articleRoutes.includes(path)) {
      return ['Person', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'];
    }
    return ['Person', 'WebSite', 'WebPage'];
  };
  const problems: string[] = [];
  const canonicalOf = new Map<string, string>();
  const served = new Map<string, Record<string, unknown>[]>();
  // Every page a visitor can land on: the static routes, the case studies, the published posts and
  // the 404, so a route added to any of those lists is held to the same graph.
  for (const path of PAGE_ROUTES) {
    const { nodes, canonicals, title, lang } = await servedGraph(request, page, path);
    served.set(path, nodes);
    const types = JSON.stringify(nodes.map((node) => node['@type']));
    if (types !== JSON.stringify(typesOf(path))) {
      problems.push(`${path}: serves ${types}, expected ${JSON.stringify(typesOf(path))}`);
    }
    const ids = new Set<string>();
    for (const node of nodes) {
      const id = node['@id'];
      if (node['@context'] !== 'https://schema.org') {
        problems.push(`${path}: a ${String(node['@type'])} whose @context is not schema.org`);
      }
      if (typeof id !== 'string' || id === '') {
        problems.push(`${path}: a ${String(node['@type'])} with no @id`);
      } else if (ids.has(id)) problems.push(`${path}: two nodes with the @id ${id}`);
      else ids.add(id);
      // A relative link would resolve against whatever page a crawler found it on: every `@id`,
      // `url`, breadcrumb `item`, `image` and `sameAs`, at any depth, is absolute.
      for (const { at, link } of linksIn(node)) {
        if (!/^https?:\/\/[^/]/.test(link)) {
          problems.push(`${path}: ${String(node['@type'])}.${at} is ${link}, not absolute`);
        }
      }
      // The WebSite's language is the one the document declares.
      if (node['@type'] === 'WebSite' && node.inLanguage !== lang) {
        problems.push(
          `${path}: the WebSite's inLanguage is ${String(node.inLanguage)}, <html lang> ${lang}`,
        );
      }
    }
    for (const node of nodes) {
      for (const { at, ref } of referencesIn(node)) {
        const where = `${path}: ${String(node['@type'])}.${at}`;
        // But one, by name (57b): the Person is the main entity of /about's ProfilePage, which
        // only /about serves; the Person's own describe at the end of this file holds it there.
        // It still has to name something: a non-empty `@id`.
        const crossRoute = node['@type'] === 'Person' && at === 'mainEntityOfPage';
        const id = ref['@id'];
        if (crossRoute ? typeof id !== 'string' || id === '' : !ids.has(String(id))) {
          problems.push(`${where} names ${String(id)}, which this document does not serve`);
        }
        const extra = Object.keys(ref).filter((key) => key !== '@id');
        if (extra.length > 0) problems.push(`${where} carries ${extra.join(', ')} beside its @id`);
      }
    }
    if (path === NOT_FOUND_ROUTE) continue;
    if (canonicals.length !== 1) {
      problems.push(`${path}: ${canonicals.length} canonical links, expected 1`);
      continue;
    }
    canonicalOf.set(path, canonicals[0]);
    const pageNode = nodes.find(
      ({ '@type': type }) => type === 'WebPage' || type === 'ProfilePage',
    );
    if (pageNode && pageNode.url !== canonicals[0]) {
      problems.push(
        `${path}: the page node's url is ${String(pageNode.url)}, not ${canonicals[0]}`,
      );
    }
    // A WebPage's name is the title the route hands `buildMetadata()`, which the served <title>
    // carries alone (an absolute title) or through the root template. /about's ProfilePage is named
    // after the person instead (#57), so it is not compared.
    if (
      pageNode?.['@type'] === 'WebPage' &&
      title !== pageNode.name &&
      title !== `${String(pageNode.name)} | Milos Cvetkovic`
    ) {
      problems.push(
        `${path}: the WebPage's name is ${String(pageNode.name)}, the <title> ${title}`,
      );
    }
  }

  // A case study's or a post's article is its page's main entity, at `<canonical>#article`, dated
  // with the days its data holds (which its visible Published and Updated line reads too), and its
  // breadcrumb runs Home, the section, the article, in that order, each step at the canonical its
  // own document serves.
  const articles = [
    ...caseStudies.map((study) => ({
      path: caseStudyRoute(study.slug),
      list: 'CASE_STUDY_ROUTES',
      section: ['Work', '/work'],
      title: study.title,
      dates: [study.publishedAt, study.updatedAt],
    })),
    ...publishedPosts.map((post) => ({
      path: postRoute(post.slug),
      list: 'POST_ROUTES',
      section: ['Writing', '/blog'],
      title: post.title,
      dates: [post.publishedAt, post.updatedAt],
    })),
  ];
  // No post is published until the owner publishes the first, and an empty list checks nothing:
  // the report says how many post routes this test covered, rather than passing on none unseen.
  // Counted from the list the loop below walks, so the report says what was checked.
  const postArticles = articles.filter(({ list }) => list === 'POST_ROUTES').length;
  test.info().annotations.push({
    type: 'post routes',
    description:
      `${postArticles} post route(s) held to the case studies' types and checks` +
      (postArticles === 0 ? ': none is published, so no post was checked' : ''),
  });
  for (const { path, list, section, title, dates } of articles) {
    const nodes = served.get(path);
    if (!nodes) {
      problems.push(`${path}: not among the routes walked above (${list})`);
      continue;
    }
    const byType = (type: string) => nodes.find((node) => node['@type'] === type);
    const [webPage, article, crumbs] = ['WebPage', 'TechArticle', 'BreadcrumbList'].map(byType);
    if (!webPage || !article || !crumbs) {
      problems.push(`${path}: no WebPage, TechArticle or BreadcrumbList, so nothing below checked`);
      continue;
    }
    // The article's image is the route's card, fetched from this server by its path.
    const image = new URL(String(article.image));
    const response = await request.get(`${image.pathname}${image.search}`);
    const type = response.headers()['content-type'] ?? '(none)';
    if (response.status() !== 200 || !type.startsWith('image/')) {
      problems.push(
        `${path}: the TechArticle's image ${image.href} answers ${response.status()} ${type}`,
      );
    }
    // A route without one canonical was reported in the walk above; its checks here would only
    // compare against `undefined`.
    const canonical = canonicalOf.get(path);
    const sectionCanonical = canonicalOf.get(section[1]);
    if (!canonical || !sectionCanonical || !canonicalOf.has('/')) {
      problems.push(
        `${path}: no canonical for it, / or ${section[1]}, so its article is unchecked`,
      );
      continue;
    }
    if (article['@id'] !== `${canonical}#article`) {
      problems.push(`${path}: the TechArticle's @id is ${String(article['@id'])}`);
    }
    if ((article.mainEntityOfPage as { '@id'?: unknown })?.['@id'] !== webPage['@id']) {
      problems.push(`${path}: the TechArticle's mainEntityOfPage is not its WebPage`);
    }
    const marked = [article.datePublished, article.dateModified];
    if (!isDeepStrictEqual(marked, dates)) {
      problems.push(
        `${path}: the TechArticle is dated ${String(marked)}, its data ${String(dates)}`,
      );
    }
    if ((webPage.breadcrumb as { '@id'?: unknown })?.['@id'] !== crumbs['@id']) {
      problems.push(`${path}: the WebPage's breadcrumb is not its BreadcrumbList`);
    }
    const trail = JSON.stringify(crumbs.itemListElement);
    const expected = JSON.stringify(
      [
        ['Home', canonicalOf.get('/')],
        [section[0], sectionCanonical],
        [title, canonical],
      ].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
    );
    if (trail !== expected)
      problems.push(`${path}: the breadcrumb is ${trail}, expected ${expected}`);
  }

  expect(problems).toEqual([]);
});

test('/about shows the day its ProfilePage says it was modified (#57)', async ({
  page,
  request,
}) => {
  // Markup that asserts a date the page does not show breaks the structured-data rule this graph is
  // held to (ADR 0031), so /about prints its date as /privacy does, and the two must agree. The
  // <time> holds the stored day and its text writes that day as the case studies do.
  const { nodes, lastUpdated } = await servedGraph(request, page, '/about');
  const profile = nodes.find((node) => node['@type'] === 'ProfilePage');
  expect(profile, '/about serves a ProfilePage').toBeDefined();
  const dateModified = String(profile?.dateModified);
  expect(dateModified, 'the ProfilePage dateModified').toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(lastUpdated, 'one "Last updated" line, its <time> holding the dateModified').toEqual([
    { text: `Last updated ${formatContentDate(dateModified)}.`, datetimes: [dateModified] },
  ]);
});

test('/privacy shows its "Last updated" day as the case studies write theirs (#57)', async ({
  page,
  request,
}) => {
  // The line and the sitemap's lastmod read one value, the <time> holding it as stored.
  const updated = STATIC_ROUTE_UPDATED['/privacy'];
  const { lastUpdated } = await servedGraph(request, page, '/privacy');
  expect(lastUpdated, 'one "Last updated" line, its <time> holding the stored day').toEqual([
    { text: `Last updated ${formatContentDate(updated)}.`, datetimes: [updated] },
  ]);
});

test('the Person schema, the hero and the /about description carry one derived years figure, none of it framed as AI-native (#49)', async ({
  request,
}) => {
  // pages-9 and live-14: the Person schema once put the whole career down as AI-native work, which
  // the site's own timeline (AI from 2025) and /skills (AI/LLM Integration, 2+) contradict, while
  // /about said `10+`. The figure now comes from `yearsOfExperience()` in data/profile.ts, so every
  // surface a crawler reads has to carry that one number.
  const home = await request.get('/');
  expect(home.status(), 'GET /').toBe(200);
  const homeHtml = await home.text();
  const person = jsonLdNodes(homeHtml, '/').find((node) => node['@type'] === 'Person');
  // Without these, a missing Person or description would read as copy that lacks the phrase.
  expect(person, 'the layout serves a Person on /').toBeDefined();
  expect(typeof person?.description, 'the Person on / has a description').toBe('string');
  const about = await fetchHead(request, '/about');
  expect(about.status, 'GET /about').toBe(200);

  const surfaces = {
    'the Person JSON-LD description on /':
      typeof person?.description === 'string' ? person.description : '',
    'the /about meta description': first(about.meta, 'description') ?? '',
    'the /about og:description': first(about.meta, 'og:description') ?? '',
    // The player card's XP row, as served: a crawler reads it without running the hero.
    'the hero XP line on /': homeHtml.match(/>(\d+ years · 6 domains · 3 clouds)</)?.[1] ?? '',
  };

  const problems: string[] = [];
  const figures = new Map<string, number[]>();
  for (const [surface, text] of Object.entries(surfaces)) {
    figures.set(surface, yearsFigures(text));
    if (yearsFigures(text).length === 0)
      problems.push(`${surface} states no years figure: "${text}"`);
    for (const clause of yearsClausesAboutAi(text)) {
      problems.push(`${surface} ties the years to AI work: "${clause}"`);
    }
  }
  // One source: every surface states the same figure, whenever the build ran.
  const stated = new Set([...figures.values()].flat());
  if (stated.size > 1) {
    problems.push(`the surfaces disagree: ${JSON.stringify(Object.fromEntries(figures))}`);
  }
  expect(problems).toEqual([]);

  // And that figure is the derived one. The pages are prerendered, so it is the build's clock that
  // counts: a build made before 1 January and served after it states one year fewer, which is a
  // stale build rather than a second source, and the message says so.
  const expected = yearsOfExperience();
  const [served] = stated;
  expect(
    served,
    served === expected - 1
      ? `the build predates 1 January: it states ${served} years, the clock gives ${expected}; rebuild`
      : `yearsOfExperience() gives ${expected}`,
  ).toBe(expected);
});

test('/about answers three questions, each in one paragraph of 40 to 80 words that restates no case-study metric (#58)', async ({
  page,
  request,
}) => {
  // #58 AC 13. A question-shaped heading with a short answer under it is the unit an extractor can
  // lift whole, so the served HTML, which no crawler runs, has to carry it. The browser's
  // `DOMParser` reads the response, as `servedCaseStudy()` below does: the RSC flight payload
  // repeats every heading inside a script, and parsed, a script's text is never an element. The
  // served question headings are the `questions` of the page record, in order, so a stray `<h2>`
  // ending in `?` elsewhere on the page fails rather than being counted; each is followed by a
  // `<p>` holding its answer. Words and metrics are measured by `src/test/answer-copy.ts`, the
  // helpers the unit test on the data uses. No FAQPage, HowTo or speakable markup goes with it:
  // `scripts/ai-refusals.test.mjs` fails on those strings anywhere under apps/web/src.
  const response = await request.get('/about');
  expect(response.status(), 'GET /about').toBe(200);
  const headings = await page.evaluate(
    (markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const text = (element: Element | null) =>
        (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return [...doc.body.querySelectorAll('h2')].map((heading) => ({
        question: text(heading),
        next: heading.nextElementSibling?.localName ?? null,
        answer: text(heading.nextElementSibling),
      }));
    },
    await response.text(),
  );
  // The control: a parser that found no heading at all would find no question either.
  expect(headings.length, '/about should serve its section headings').toBeGreaterThan(0);

  expect(questions, 'the page record asks three questions').toHaveLength(3);
  const served = headings.filter(({ question }) => question.endsWith('?'));
  expect(
    served.map(({ question }) => question),
    "/about serves exactly its record's questions as the h2s that end in a question mark",
  ).toEqual(questions.map(({ question }) => question));

  const metrics = caseStudies.map(({ highlight }) => highlight.metric);
  expect(metrics, 'the case studies must define metrics for the check below').not.toHaveLength(0);
  for (const { question, next, answer } of served) {
    expect.soft(next, `"${question}" is followed by a paragraph`).toBe('p');
    const words = wordCount(answer);
    expect
      .soft(words, `"${question}" is answered in at least 40 words: "${answer}"`)
      .toBeGreaterThanOrEqual(40);
    expect
      .soft(words, `"${question}" is answered in at most 80 words: "${answer}"`)
      .toBeLessThanOrEqual(80);
    expect
      .soft(
        restatedMetrics(answer, metrics),
        `"${question}" restates a case-study metric, which is the study's to state`,
      )
      .toEqual([]);
  }
});

/** A date the served body shows: its `<dt>` label, then the `<time>` in the `<dd>` after it. */
interface ServedDate {
  label: string;
  datetime: string;
  text: string;
}

/**
 * A case study as served: how many `<time>` elements its body has, the labelled dates among them,
 * and its JSON-LD blocks (through `jsonLdNodes`). The browser's `DOMParser` reads the dates, as
 * `served-html.spec.ts` and `hydration-marker.spec.ts` do, and not a regular expression: the RSC
 * flight payload repeats the dates and both labels, and the JSON-LD's `datePublished` contains one
 * of them, all inside scripts where no reader sees them. Parsed, a script's text is never an
 * element, so only real `<time>` elements count, and a document made by `DOMParser` runs none
 * of its scripts. A label is read by structure, a `<dt>` whose next sibling is a `<dd>` holding
 * only the `<time>`, so a separator or hidden text added next to one reads as a changed line, not
 * as a wrong date.
 */
async function servedCaseStudy(request: APIRequestContext, page: Page, path: string) {
  const response = await request.get(path);
  expect(response.status(), `${path} should answer 200`).toBe(200);
  const html = await response.text();
  const { timeCount, dates } = await page.evaluate((markup) => {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const labelled: ServedDate[] = [];
    for (const dt of doc.body.querySelectorAll('dt')) {
      const dd = dt.nextElementSibling;
      const time = dd?.firstElementChild;
      if (dt.children.length > 0 || dd?.localName !== 'dd' || time?.localName !== 'time') continue;
      const onlyTheTime = [...dd.childNodes].every(
        (node) => node === time || (node instanceof Text && node.data.trim() === ''),
      );
      if (!onlyTheTime || time.children.length > 0) continue;
      labelled.push({
        label: (dt.textContent ?? '').trim(),
        datetime: time.getAttribute('datetime') ?? '',
        text: time.textContent ?? '',
      });
    }
    return {
      timeCount: doc.body.querySelectorAll('time').length,
      dates: labelled,
    };
  }, html);
  return { timeCount, dates, jsonLd: jsonLdNodes(html, path) };
}

/**
 * How an en-GB reader writes a stored day, from `Intl` rather than `formatContentDate`, so the text
 * the page shows is checked against an oracle that does not share the page's month table. The page
 * itself must not use `Intl` (it would freeze the build machine's ICU data into the HTML); a test
 * reading one release's output may.
 */
const readerDate = (stored: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${stored}T00:00:00Z`));

test('there are case studies for the date rows below to check', () => {
  // The rows are generated from the data; an emptied or broken import would generate none, and a
  // run with no rows would pass.
  expect(caseStudies.length).toBeGreaterThan(0);
});

// One test per study, so a failure on one page does not hide the next, and one fetch per page.
for (const { slug, publishedAt, updatedAt } of caseStudies) {
  const path = `/work/${slug}`;

  test(`${path}: shows its published and updated dates, labelled, and its TechArticle carries the same ones`, async ({
    page,
    request,
  }) => {
    const { timeCount, dates, jsonLd } = await servedCaseStudy(request, page, path);

    // #56: Google's publication-dates guidance wants a prominent, labelled date a reader can see, and
    // one that agrees with the markup. The attribute is the stored value byte for byte; the text is
    // what formatContentDate makes of it, and also what an en-GB reader would write.
    expect.soft(timeCount, `${path}: exactly two <time> elements in the served body`).toBe(2);
    expect.soft(dates, `${path}: Published then Updated, each a <dt> with its <dd><time>`).toEqual([
      { label: 'Published', datetime: publishedAt, text: formatContentDate(publishedAt) },
      { label: 'Updated', datetime: updatedAt, text: formatContentDate(updatedAt) },
    ]);
    for (const { label, datetime, text } of dates) {
      expect
        .soft(text, `${path}: the ${label} date as a reader writes it`)
        .toBe(readerDate(datetime));
    }

    // #57 AC 4: marked-up dates that differ from the visible ones are a structured-data policy
    // violation. The visible line and TechArticleJsonLd read the same two fields today; this is what
    // keeps a later change to either from separating them.
    const articles = jsonLd.filter((block) => block['@type'] === 'TechArticle');
    expect(articles, `${path}: one TechArticle`).toHaveLength(1);
    const { datePublished, dateModified } = articles[0];
    expect(typeof datePublished, `${path}: datePublished is a string`).toBe('string');
    expect(typeof dateModified, `${path}: dateModified is a string`).toBe('string');
    expect(datePublished, `${path}: datePublished`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateModified, `${path}: dateModified`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(
      String(dateModified) >= String(datePublished),
      `${path}: dateModified ${String(dateModified)} is before datePublished ${String(datePublished)}`,
    ).toBe(true);
    const shown = (label: string) => dates.find((date) => date.label === label)?.datetime;
    expect(
      { datePublished, dateModified },
      `${path}: the TechArticle's dates must be the ones the page shows`,
    ).toEqual({ datePublished: shown('Published'), dateModified: shown('Updated') });
  });
}

test('/work counts the studies running in production and serves no claim without a denominator (#58)', async ({
  page,
  request,
}) => {
  // #58 AC 10. The stats bar read "100% In Production" and "0 Left Unfinished", two literals no
  // record stood behind: the first went false when the self-healing agent was retired, and the
  // second had no denominator at all. The figure is now productionFigure() over the studies'
  // statuses, and "Left Unfinished" is gone until the owner supplies what it would count.
  const response = await request.get('/work');
  expect(response.status(), 'GET /work').toBe(200);
  const html = await response.text();
  // Neither withdrawn claim may be served anywhere: not in the raw body (the flight payload, the
  // meta tags and JSON-LD included), and not in the text a reader sees, where the old bar's value and
  // label sat in two elements and read "100%In Production". The context around a hit is the
  // message, rather than the whole document.
  const withdrawn = [/Left Unfinished/i, /100%\s*in production/i];
  const pageText = await page.evaluate(
    (markup) =>
      new DOMParser().parseFromString(markup, 'text/html').documentElement.textContent ?? '',
    html,
  );
  const around = (haystack: string, pattern: RegExp) => {
    const at = haystack.search(pattern);
    return at === -1 ? '' : haystack.slice(Math.max(0, at - 80), at + 40);
  };
  for (const pattern of withdrawn) {
    expect(around(html, pattern), `/work must not serve ${pattern} in its body`).toBe('');
    expect(around(pageText, pattern), `/work must not show ${pattern} as text`).toBe('');
  }

  // The bar is found by structure from its first label, the Projects count, which the base build
  // served too, so a missing figure fails on the figure rather than on the lookup. The label must
  // be the only leaf reading it, so another "Projects" in the page fails as an ambiguous lookup
  // rather than as a wrong bar. `DOMParser` runs no scripts, so only real elements answer.
  const [firstLabel] = workCopy.stats.map(({ label }) => label);
  const statuses = Object.keys(RUNS_IN_PRODUCTION);
  const served = await page.evaluate(
    ([markup, label, statusNames]) => {
      const main = new DOMParser()
        .parseFromString(markup, 'text/html')
        .querySelector('main#main-content');
      const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      const leaves = [...(main?.querySelectorAll('*') ?? [])].filter(
        (element) => element.children.length === 0,
      );
      const labelled = leaves.filter(
        (element) => element.localName === 'div' && text(element) === label,
      );
      // Each card's status badge, independent of the bar: the figure must agree with them.
      const badges = leaves.map(text).filter((value) => statusNames.includes(value));
      const bar = labelled.length === 1 ? labelled[0].parentElement?.parentElement : null;
      return {
        labelled: labelled.length,
        badges,
        stats: bar
          ? [...bar.children].map((item) => ({
              pieces: item.children.length,
              value: item.children[0] ? text(item.children[0]) : '',
              label: item.children[1] ? text(item.children[1]) : '',
            }))
          : null,
      };
    },
    [html, firstLabel, statuses] as const,
  );
  expect(served.labelled, `exactly one "${firstLabel}" label in /work's main`).toBe(1);
  const { stats } = served;
  expect(stats, `/work must serve a stats bar with a "${firstLabel}" figure`).not.toBeNull();
  const figures = (stats ?? []).map(({ value, label }) => ({ value, label }));

  // Each figure and its label stay two elements, the figure drawn large and the label small. (Axe
  // cannot decide either at rest, over the page's grid background, so they count against /work's
  // incomplete budget in accessibility.spec.ts, not its floor.)
  expect(
    (stats ?? []).map(({ pieces }) => pieces),
    'each figure is a value and a label',
  ).toEqual(workCopy.stats.map(() => 2));
  expect(figures, 'the bar serves the record, in order').toEqual([...workCopy.stats]);

  // The served figure agrees with the served cards, counted from their badges rather than from
  // the source: one badge per project, and the running ones by the classification the code uses.
  const running = served.badges.filter(
    (status) => RUNS_IN_PRODUCTION[status as keyof typeof RUNS_IN_PRODUCTION],
  ).length;
  expect(served.badges.length, 'a status badge on every served card').toBe(caseStudies.length);
  expect(figures, "the bar's figures agree with the served cards' badges").toEqual([
    { value: String(served.badges.length), label: firstLabel },
    { value: `${running} of ${served.badges.length}`, label: workCopy.stats[1].label },
  ]);
  for (const { value, label } of figures) {
    expect(value, `"${label}" must not be a bare percentage`).not.toMatch(/%/);
  }
});

test('/skills says above its proficiency bars that they are self-assessed (#58)', async ({
  page,
  request,
}) => {
  // #58 AC 11, the /skills half: the bars show a level out of 100 and the badges a number of years,
  // and nothing on the page said what either was a measure of. The line sits between the section's
  // heading and the bars, in the served HTML, so a reader without JavaScript meets it first.
  const response = await request.get('/skills');
  expect(response.status(), 'GET /skills').toBe(200);
  const served = await page.evaluate(
    ([markup, heading]) => {
      const main = new DOMParser()
        .parseFromString(markup, 'text/html')
        .querySelector('main#main-content');
      const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      const h2 = [...(main?.querySelectorAll('h2') ?? [])].find(
        (element) => text(element) === heading,
      );
      const note = h2?.nextElementSibling;
      const bars = note?.nextElementSibling;
      return {
        heading: Boolean(h2),
        note: note ? { tag: note.localName, text: text(note) } : null,
        skillsAfterNote: bars ? [...bars.querySelectorAll('h3')].map(text) : [],
        barNames: bars
          ? [...bars.querySelectorAll('[role="meter"]')].map(
              (bar) => bar.getAttribute('aria-label') ?? '',
            )
          : [],
      };
    },
    [await response.text(), skillsCopy.headings.coreSkills] as const,
  );

  expect(served.heading, `/skills must serve the "${skillsCopy.headings.coreSkills}" h2`).toBe(
    true,
  );
  expect(served.note, 'the paragraph straight after the heading is the note').toEqual({
    tag: 'p',
    text: skillsCopy.coreSkillsNote,
  });
  expect(skillsCopy.coreSkillsNote, 'the note says the levels are not measured').toMatch(
    /self-assessed/i,
  );
  expect(served.skillsAfterNote, 'the bars follow the note, every core skill among them').toEqual(
    coreSkills.map(({ name }) => name),
  );
  // A screen reader user moving through the bars hears each bar's name, not the note above them, so
  // every name carries the same qualifier.
  expect(served.barNames, 'one meter per core skill').toHaveLength(coreSkills.length);
  for (const name of served.barNames) {
    expect(name, 'each bar names its level as self-assessed').toMatch(/self-assessed/i);
  }
});

// #58 AC 5 and 6: the tech stacks, the /about quick facts and timeline, and the /skills toolkit are
// data tables, which an extractor can read as rows and columns and a grid of cards cannot be. The
// served HTML, which no crawler runs, carries each one whole: named by its caption, a `th` heading
// every column and every row, every cell as the record's `cellText()` reads it (the text the twin
// writes), in a plain box that does not scroll, and every element with its table role spelled out,
// which keeps a stacked table a table where the phone layout changes its display.
for (const [route, tables] of Object.entries(TABLES)) {
  test(`${route} serves its record's tables, captioned and headed both ways (#58)`, async ({
    page,
    request,
  }) => {
    const response = await request.get(route);
    expect(response.status(), `GET ${route}`).toBe(200);
    const served = await servedTables(page, await response.text());
    expect(served, `${route} serves its tables in page order`).toEqual(tables.map(expectedTable));
  });
}

test('the table rows are counted from the data the records read (#58)', () => {
  // The expectations above come from the records; this pins the records to their data, so a record
  // that dropped a row would not set its own, shorter, expectation.
  // A quick fact whose basis still holds the owner's placeholder is left out of the table (58e):
  // `shownFacts`, whose rule data/__tests__/pages.test.ts pins.
  expect(TABLES['/about']?.map(({ caption, rows }) => [caption, rows.length])).toEqual([
    ['Quick facts', shownFacts.length],
    ['Career timeline', timeline.length],
  ]);
  expect(TABLES['/skills']?.map(({ caption, rows }) => [caption, rows.length])).toEqual([
    ['Skills by category', skillCategories.length],
  ]);
  for (const study of caseStudies) {
    const tables = TABLES[caseStudyRoute(study.slug)];
    expect(tables, `${study.slug} serves one table`).toHaveLength(1);
    expect(tables?.[0]?.caption).toBe(`Tech stack for ${study.title}`);
    expect(tables?.[0]?.columns, 'two column headers').toHaveLength(2);
    expect(tables?.[0]?.rows).toHaveLength(study.techStack.length);
  }
});

// #58: the specs above, the axe table rules and the phone overflow check all run over `TABLES`, so
// a table served on a route `TABLES` does not list would get none of them. Every page route, the
// 404 included, serves exactly the tables `TABLES` lists for it, and a route it lists is a route.
test('every route serves exactly the tables TABLES lists for it (#58)', async ({
  page,
  request,
}) => {
  expect(PAGE_ROUTES, 'TABLES lists a route that is not a page').toEqual(
    expect.arrayContaining(Object.keys(TABLES)),
  );
  const counts: Record<string, number> = {};
  for (const route of PAGE_ROUTES) {
    const response = await request.get(route);
    expect(response.status(), `GET ${route}`).toBe(expectedStatus(route));
    counts[route] = (await servedTables(page, await response.text())).length;
  }
  expect(counts).toEqual(
    Object.fromEntries(PAGE_ROUTES.map((route) => [route, TABLES[route]?.length ?? 0])),
  );
});

// #58 AC 1 and 2 (58a): five routes opened on a hook that named neither the person nor the
// subject, so neither the outline nor a machine reading it said who or what a page was about. Each
// of them now serves the owner's line as its `h1`, and the hook as the `<p>` right after it,
// outside the heading. Read from the served HTML, which no crawler runs; `DOMParser` parses it, so
// the RSC flight payload's copy of every heading, inside a script, is never an element.
test('every page serves one non-empty h1 of its own, and five name their subject over their hook (#58)', async ({
  page,
  request,
}) => {
  type Served = {
    h1s: string[];
    next: { tag: string; text: string } | null;
    // The innermost elements whose whole text is the route's hook, and whether a heading holds any.
    hooks: { tag: string; inHeading: boolean }[];
  };
  const served: Record<string, Served> = {};
  const hookOf = (route: string): string | null =>
    route in PAGE_HEADINGS ? PAGE_HEADINGS[route as keyof typeof PAGE_HEADINGS].hook : null;
  for (const route of PAGE_ROUTES.filter((path) => path !== NOT_FOUND_ROUTE)) {
    const response = await request.get(route);
    expect(response.status(), `GET ${route}`).toBe(200);
    served[route] = await page.evaluate(
      ({ markup, hook }) => {
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        for (const inert of doc.body.querySelectorAll('script, style, template')) inert.remove();
        const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        const h1s = [...doc.body.querySelectorAll('h1')];
        const next = h1s[0]?.nextElementSibling;
        const hooks =
          hook === null
            ? []
            : [...doc.body.querySelectorAll('*')]
                .filter(
                  (element) =>
                    text(element) === hook &&
                    ![...element.children].some((child) => text(child) === hook),
                )
                .map((element) => ({
                  tag: element.localName,
                  inHeading: element.closest('h1, h2, h3, h4, h5, h6, [role="heading"]') !== null,
                }));
        return {
          h1s: h1s.map(text),
          next: next ? { tag: next.localName, text: text(next) } : null,
          hooks,
        };
      },
      { markup: await response.text(), hook: hookOf(route) },
    );
  }

  for (const [route, { h1s }] of Object.entries(served)) {
    expect(h1s, `${route} serves exactly one h1`).toHaveLength(1);
    expect(h1s[0], `${route} serves an empty h1`).not.toBe('');
  }
  const headings = Object.values(served).map(({ h1s }) => h1s[0]);
  expect(
    headings.filter((heading, index) => headings.indexOf(heading) !== index),
    'two routes serve the same h1',
  ).toEqual([]);

  // Every static route is either one of the five or named here with the reason it is not, so a
  // route added later cannot ship a hook-only h1 without being classified. `/blog` says "Writing"
  // (#61's line) and /privacy "Privacy"; both name their subject already.
  const NAMED_ALREADY = ['/blog', '/privacy'];
  expect(
    STATIC_ROUTES.filter((route) => !(route in PAGE_HEADINGS) && !NAMED_ALREADY.includes(route)),
    'a static route that is neither in PAGE_HEADINGS nor named as already naming its subject',
  ).toEqual([]);

  for (const [route, { heading, hook }] of Object.entries(PAGE_HEADINGS)) {
    const onRoute = served[route];
    expect(onRoute, `${route} is a page route`).toBeDefined();
    expect(onRoute?.h1s[0], `${route}'s h1 is the owner's line`).toBe(heading);
    expect(onRoute?.next, `${route}'s hook is the paragraph right after its h1`).toEqual({
      tag: 'p',
      text: hook,
    });
    // The hook is served once, as that paragraph, and no heading holds it (AC 2).
    expect(
      onRoute?.hooks,
      `${route} serves its hook once, as a paragraph outside any heading`,
    ).toEqual([{ tag: 'p', inHeading: false }]);
  }
});

// #58 AC 9, the /about half of AC 11 and AC 12 (58e): every figure says what it counted. A case
// study's metric panel prints `formatMetricScope()`'s sentence, which is the basis alone while the
// owner has yet to define the window and method, and the basis, the window and the method once they
// have; the twin writes the same sentence on its Basis line. /about's quick facts carry a Basis
// cell, and a fact whose basis is still the owner's placeholder is left out whole, on the page and
// in the twin. Read from the served HTML, which no crawler runs, and from the served twins.
test.describe('every figure states its scope, and no placeholder stands in for one (58e)', () => {
  /** The text of each paragraph in each "Headline result" panel of the served page. */
  const servedPanels = (page: Page, html: string) =>
    page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      return [
        ...doc.querySelectorAll('main#main-content section[aria-label="Headline result"]'),
      ].map((panel) =>
        [...panel.querySelectorAll('p')].map((p) =>
          (p.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ),
      );
    }, html);

  /** How many times `needle` occurs in `haystack`. */
  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  for (const study of caseStudies) {
    const path = caseStudyRoute(study.slug);

    test(`${path} serves its metric's scope sentence once, under the figure, and on its twin's Basis line`, async ({
      page,
      request,
    }) => {
      const { basis } = study.highlight.metric;
      // Throws, naming the study, when there is no basis to state, as the page and twin do.
      const scope = caseStudyMetricScope(study);

      const response = await request.get(path);
      expect(response.status(), `GET ${path}`).toBe(200);
      const html = await response.text();
      const panels = await servedPanels(page, html);
      expect(panels, `${path} serves one Headline result panel`).toHaveLength(1);
      expect(panels[0]?.at(-1), 'the panel ends with the scope sentence').toBe(scope);
      const body = await servedText(page, html, { root: 'body' });
      expect(occurrences(body, scope), `${path} serves its scope sentence exactly once`).toBe(1);
      // One producer: the sentence holds the basis, which is never printed beside it as well.
      expect(occurrences(body, basis), `${path} serves its basis once, inside the sentence`).toBe(
        1,
      );

      const twinResponse = await request.get(markdownTwinPath(path));
      expect(twinResponse.status(), `GET ${markdownTwinPath(path)}`).toBe(200);
      const twin = visible(await twinResponse.text());
      expect(
        occurrences(twin, `\n- Basis: ${scope}\n`),
        'the twin writes it on its Basis line',
      ).toBe(1);
      expect(occurrences(twin, basis), 'and the basis nowhere else').toBe(1);
    });
  }

  test("/about serves a filled Basis cell in every quick-fact row, and no fact whose basis is the owner's", async ({
    page,
    request,
  }) => {
    // The rule that picks them is shownFacts', pinned in data/__tests__/pages.test.ts.
    const stated = shownFacts;
    const unstated = facts.filter((fact) => !shownFacts.includes(fact));
    expect(stated.length, 'some quick fact has a basis to show').toBeGreaterThan(0);

    const response = await request.get('/about');
    expect(response.status(), 'GET /about').toBe(200);
    const html = await response.text();
    const quickFacts = (await servedTables(page, html)).find(
      ({ caption }) => caption === 'Quick facts',
    );
    expect(quickFacts, '/about serves its quick facts as a table').toBeDefined();
    if (!quickFacts) return;
    expect(quickFacts.head.columns.map(({ text }) => text)).toEqual(['Fact', 'Figure', 'Basis']);
    for (const { header, cells } of quickFacts.rows) {
      expect(cells.at(-1)?.text ?? '', `the Basis cell of "${header.text}"`).toMatch(
        /[\p{L}\p{N}]/u,
      );
    }
    expect(
      quickFacts.rows.map(({ header, cells }) => [header.text, ...cells.map(({ text }) => text)]),
      'one row per fact with a basis, in data order, each with its figure and basis',
    ).toEqual(stated.map(({ label, value, basis }) => [label, value, basis]));

    const twinResponse = await request.get(markdownTwinPath('/about'));
    expect(twinResponse.status(), 'GET /about/index.md').toBe(200);
    const twin = visible(await twinResponse.text());
    expect(twin).toContain('| Fact | Figure | Basis |');
    for (const { label, value, basis } of stated) {
      expect(twin, `the twin's row for "${label}"`).toContain(`| ${label} | ${value} | ${basis} |`);
    }

    // A fact the owner has yet to give a basis is left out whole, its label and figure with it.
    const body = await servedText(page, html, { root: 'body', separator: ' ' });
    for (const { label } of unstated) {
      expect(body, `/about must not show "${label}" before its basis is filled`).not.toContain(
        label,
      );
      expect(twin, `/about/index.md must not show "${label}" either`).not.toContain(label);
    }
  });

  test("no route, twin, case-study JSON or feed states a quick fact whose basis is the owner's", async ({
    request,
  }) => {
    // A hidden fact's claim stays unpublished everywhere until its basis arrives, not only in
    // /about's table: its label, as any page, head, JSON-LD block, twin or endpoint would phrase it.
    const unstated = facts.filter((fact) => !shownFacts.includes(fact));
    const paths = [
      ...routes,
      ...[
        ...MARKDOWN_TWINS.map(({ twin }) => twin),
        CASE_STUDIES_JSON,
        ...CASE_STUDY_ENDPOINTS.map(({ json }) => json),
        FEED,
      ].map((path) => ({ path, status: 200 })),
    ];
    const served = await Promise.all(
      paths.map(async ({ path, status: expected }) => {
        const response = await request.get(path);
        const body = (await response.text()).toLowerCase();
        return { path, expected, status: response.status(), body };
      }),
    );
    // A path that failed to serve would pass the search below without being searched.
    for (const { path, expected, status, body } of served) {
      expect.soft(status, path).toBe(expected);
      expect.soft(body.length, `${path} must serve a body`).toBeGreaterThan(0);
    }
    const problems = served.flatMap(({ path, body }) =>
      unstated
        .filter(({ label }) => body.includes(label.toLowerCase()))
        .map(({ label }) => `${path} states "${label}"`),
    );
    expect(problems, 'a fact the owner has yet to give a basis is served').toEqual([]);
  });

  test('no Markdown twin, case-study JSON or feed serves an owner placeholder', async ({
    request,
  }) => {
    // The machine-readable half of the placeholder test above, which covers the pages (their
    // JSON-LD and meta descriptions inside them), the sitemap, robots.txt and the manifest: every
    // twin, the static routes', the case studies' and any published post's, from the one list of
    // them, then the case-study JSON and the Atom feed. /llms.txt joins when #60 serves it. Fetched
    // together, so the run does not grow one request at a time with the post list.
    expect(MARKDOWN_TWINS.length, 'there are twins to read').toBeGreaterThan(0);
    const paths = [
      ...MARKDOWN_TWINS.map(({ twin }) => twin),
      CASE_STUDIES_JSON,
      ...CASE_STUDY_ENDPOINTS.map(({ json }) => json),
      FEED,
    ];
    const served = await Promise.all(
      paths.map(async (path) => {
        const response = await request.get(path);
        return { path, status: response.status(), body: await response.text() };
      }),
    );
    const problems: string[] = [];
    for (const { path, status, body } of served) {
      expect.soft(status, path).toBe(200);
      expect.soft(body.length, `${path} must serve a body`).toBeGreaterThan(0);
      const at = body.indexOf(OWNER_TODO);
      if (at !== -1) problems.push(`${path} serves "${body.slice(Math.max(0, at - 40), at + 60)}"`);
    }
    expect(
      problems,
      'a placeholder reached a twin: omit the sentence, row or block until the owner fills it',
    ).toEqual([]);
  });
});

// #57 AC 6 (57b): the Person, which the layout serves on every route, asserts nothing a reader of
// the site cannot see, the rule ADR 0031's Decision 5 holds every node to. Each fact it states is
// found, case-insensitively and as a whole word or phrase, in the body text of at least one page as
// `support/served-text.ts` extracts it (the one extractor the served-text specs share, so a phrase
// means the same here as there; it reads no script, so the JSON-LD cannot find itself), and each
// profile it names is the href of a link some page renders. Every string in the Person is checked
// one of those ways or sits at a path `NOT_PAGE_TEXT` names with what holds it instead, so a
// predicate added later, at any depth, is held to the rule by default.
test.describe('the Person states only what the pages show (#57)', () => {
  /**
   * The Person's strings that are not facts to find in a page's text, by path with array indices
   * dropped, each with what holds it instead. A path rather than a key, so a `url` or a
   * `description` added under another predicate is still checked; a path named here that the Person
   * no longer has fails as stale. `@context` and `@type` are vocabulary wherever they sit.
   */
  const NOT_PAGE_TEXT: Readonly<Record<string, string>> = {
    '@id': "an identifier on the site's origin, held by the graph test above",
    url: "the site's origin, held by the graph test above",
    sameAs: 'a profile: the href of a link some page renders, checked below',
    alternateName: "a profile's handle: the last segment of a sameAs link, checked below",
    description: 'a sentence rather than one fact: checked below clause by clause',
    'hasCredential.credentialCategory': "vocabulary: schema.org's word for the kind of credential",
    'mainEntityOfPage.@id': "/about's ProfilePage, checked below",
  };
  const VOCABULARY: ReadonlySet<string> = new Set(['@context', '@type']);

  /** The facts #57 AC 6 names, so the walk cannot pass by finding none of them. */
  const REQUIRED = [
    'jobTitle',
    'knowsAbout[0]',
    'hasCredential.name',
    'address.addressLocality',
    'address.addressCountry',
    'hasOccupation.name',
  ];

  /** Every string in a node, at any depth, with its path and the key it sits under. */
  function stringsIn(
    value: unknown,
    at = '',
    key = '',
  ): { at: string; key: string; text: string }[] {
    if (typeof value === 'string') return [{ at, key, text: value }];
    if (Array.isArray(value)) {
      return value.flatMap((entry, i) => stringsIn(entry, `${at}[${i}]`, key));
    }
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([name, entry]) =>
      stringsIn(entry, at === '' ? name : `${at}.${name}`, name),
    );
  }

  /** A path with its array indices dropped, as `NOT_PAGE_TEXT` names it. */
  const pathOf = (at: string) => at.replace(/\[\d+\]/g, '');

  /**
   * Whether lower-cased body text shows a phrase as a whole: no letter or digit may touch either
   * end, so "React" is not found in "Reactive", nor "DDD" in "DDDs". Whitespace inside the phrase
   * matches any run of it, as the extractor collapses it. A page's text is read twice, its text
   * nodes joined with nothing and with a space (`servedText`'s `separator` says why), and a phrase
   * whole in either reading is shown.
   */
  function shows(body: string, phrase: string): boolean {
    // A blank fact is not a fact a page shows: without this it would match any text.
    if (phrase.trim() === '') return false;
    const pattern = phrase
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'u').test(body);
  }

  /**
   * The description's clauses that are facts to find: the years clause goes (its figure is held to
   * the pages by the #49 test above), then the rest is cut at punctuation and at the words that
   * join clauses.
   */
  function descriptionClauses(description: string): string[] {
    return description
      .replace(/\b\d+\+? years\b[^,.;:]*/g, ',')
      .split(/[,.;:]|\b(?:with|and|now)\b/i)
      .map((clause) => clause.trim())
      .filter((clause) => clause !== '');
  }

  test('reads a phrase only as a whole word, and the description by its clauses', () => {
    expect(shows('react, nestjs and node.js', 'React')).toBe(true);
    expect(shows('reactive streams', 'React')).toBe(false);
    expect(shows('a reactor', 'react')).toBe(false);
    expect(shows('devopsdays 2026', 'DevOps')).toBe(false);
    expect(shows('ai-native development', 'AI-Native Development')).toBe(true);
    expect(shows('ai-native  development', 'AI-Native Development')).toBe(true);
    expect(shows('works on node.js', 'Node.js')).toBe(true);
    expect(shows('works on nodexjs', 'Node.js')).toBe(false);
    expect(shows('any text at all', '')).toBe(false);
    expect(shows('any text at all', ' \t ')).toBe(false);
    expect(
      descriptionClauses(
        'Senior Full-Stack Engineer with 13 years of experience in software engineering, now building AI-native systems.',
      ),
    ).toEqual(['Senior Full-Stack Engineer', 'building AI-native systems']);
    expect(
      descriptionClauses(
        'Senior Full Stack Engineer & Architect with 13 years of experience in software engineering, now building AI-native systems, self-healing agents, and cloud-native architecture.',
      ),
    ).toEqual([
      'Senior Full Stack Engineer & Architect',
      'building AI-native systems',
      'self-healing agents',
      'cloud-native architecture',
    ]);
  });

  test('every fact in the Person is in some page’s text, and every profile it names is a link', async ({
    page,
    request,
  }) => {
    type Served = {
      /** The body text in its two readings, lower-cased: joined with nothing and with a space. */
      text: [string, string];
      hrefs: string[];
      nodes: Record<string, unknown>[];
    };
    const problems: string[] = [];
    const served = new Map<string, Served>();
    // The 404 is fetched for its Person, which has to be the same as every page's, but its text is
    // not searched: it is no page of the site's, and a fact only it showed would be a fact no route
    // shows.
    for (const path of PAGE_ROUTES) {
      const response = await request.get(path);
      expect(response.status(), `GET ${path}`).toBe(expectedStatus(path));
      const html = await response.text();
      const hrefs = await page.evaluate((markup) => {
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        return [...doc.body.querySelectorAll('a[href]')].map(
          (link) => link.getAttribute('href') ?? '',
        );
      }, html);
      const nodes = jsonLdNodes(html, path);
      served.set(path, {
        text: [
          (await servedText(page, html, { root: 'body' })).toLowerCase(),
          (await servedText(page, html, { root: 'body', separator: ' ' })).toLowerCase(),
        ],
        hrefs,
        nodes,
      });
    }
    const pages = [...served].filter(([path]) => path !== NOT_FOUND_ROUTE);

    // The extractor reads no script: were the JSON-LD in the text, every fact would find itself.
    for (const [path, { text }] of served) {
      if (text.some((reading) => reading.includes('"@type"'))) {
        problems.push(`${path}: the body text includes JSON-LD`);
      }
    }

    // One Person, the layout's, on every route, the 404 included, so the facts below are the facts
    // of every route.
    const persons = new Map<string, Record<string, unknown>>();
    for (const [path, { nodes }] of served) {
      const found = nodes.filter((node) => node['@type'] === 'Person');
      if (found.length === 1) persons.set(path, found[0]);
      else problems.push(`${path} serves ${found.length} Persons, not 1`);
    }
    const person = persons.get('/about');
    if (!person) throw new Error(`/about serves no single Person: ${problems.join('; ')}`);
    for (const [path, other] of persons) {
      if (!isDeepStrictEqual(other, person)) problems.push(`${path} serves another Person`);
    }

    // The facts: each in the text of at least one page. `shownOn` goes into the report, so the
    // pull request can list each fact beside the routes that show it.
    const shownOn: Record<string, string[]> = {};
    const find = (label: string, text: string) => {
      const routes = pages.filter(([, { text: readings }]) =>
        readings.some((body) => shows(body, text)),
      );
      shownOn[label] = routes.map(([path]) => path);
      return routes.length > 0;
    };
    const strings = stringsIn(person);
    for (const exempt of Object.keys(NOT_PAGE_TEXT)) {
      if (!strings.some(({ at }) => pathOf(at) === exempt)) {
        problems.push(`NOT_PAGE_TEXT names ${exempt}, which the Person does not have`);
      }
    }
    const facts = strings.filter(
      ({ at, key }) => !VOCABULARY.has(key) && !(pathOf(at) in NOT_PAGE_TEXT),
    );
    for (const { at, text } of facts) {
      if (!find(`${at}: ${text}`, text)) problems.push(`${at} "${text}" is in the text of no page`);
    }
    for (const at of REQUIRED) {
      if (!facts.some((fact) => fact.at === at)) problems.push(`the Person states no ${at}`);
    }

    // The description, a sentence: each of its clauses but the years is in some page's text.
    const description = typeof person.description === 'string' ? person.description : '';
    const clauses = descriptionClauses(description);
    if (clauses.length === 0) problems.push(`the description "${description}" states nothing`);
    for (const clause of clauses) {
      if (!find(`description: ${clause}`, clause)) {
        problems.push(`the description's "${clause}" is in the text of no page`);
      }
    }

    // The profiles: each the href of a link some page renders.
    const profiles = Array.isArray(person.sameAs) ? person.sameAs.map(String) : [];
    if (profiles.length === 0) problems.push('the Person names no profile in sameAs');
    for (const profile of profiles) {
      const routes = pages.filter(([, { hrefs }]) => hrefs.includes(profile));
      shownOn[`sameAs: ${profile}`] = routes.map(([path]) => path);
      if (routes.length === 0) problems.push(`sameAs ${profile} is the href of no rendered link`);
    }

    // The alias: the handle of one of those profiles, with or without the `@` it is written after.
    // A handle is the URL's last non-empty path segment, compared without case, as X compares them.
    const alias = typeof person.alternateName === 'string' ? person.alternateName : '';
    const handle = alias.replace(/^@/, '').toLowerCase();
    const handleOf = (profile: string) => {
      try {
        return new URL(profile).pathname.split('/').filter(Boolean).at(-1)?.toLowerCase();
      } catch {
        problems.push(`sameAs ${profile} is not a URL`);
        return undefined;
      }
    };
    const owner = profiles.find((profile) => handleOf(profile) === handle);
    shownOn[`alternateName: ${alias}`] = owner ? shownOn[`sameAs: ${owner}`] : [];
    if (handle === '' || !owner) {
      problems.push(`alternateName "${alias}" is the handle of no profile in sameAs`);
    }

    // The page the Person is the main entity of is /about's ProfilePage: the one reference the
    // graph test above lets name a node another route serves.
    const profilePage = served.get('/about')?.nodes.find((n) => n['@type'] === 'ProfilePage');
    if (
      profilePage === undefined ||
      !isDeepStrictEqual(person.mainEntityOfPage, { '@id': profilePage['@id'] })
    ) {
      problems.push(
        `the Person's mainEntityOfPage is ${JSON.stringify(person.mainEntityOfPage)}, ` +
          `not /about's ProfilePage ${String(profilePage?.['@id'])}`,
      );
    }

    await test.info().attach('person-facts-by-route.json', {
      body: JSON.stringify(shownOn, null, 2),
      contentType: 'application/json',
    });
    expect(problems).toEqual([]);
  });
});
