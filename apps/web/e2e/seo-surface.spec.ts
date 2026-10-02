import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { OWNER_TODO } from '../src/data/owner-todo';
import { yearsOfExperience } from '../src/data/profile';
import { yearsClausesAboutAi, yearsFigures } from '../src/test/experience-claims';
import {
  CASE_STUDY_ROUTES,
  NOT_FOUND_ROUTE,
  PAGE_ROUTES,
  STATIC_ROUTES,
  expectedStatus,
  postRoute,
} from './routes';
import { caseStudies } from '../src/data/case-studies';
import { questions } from '../src/data/pages/about';
import { coreSkills, skillsCopy } from '../src/data/pages/skills';
import { workCopy } from '../src/data/pages/work';
import { hasPublishedPosts, publishedPosts } from '../src/data/posts';
import { RUNS_IN_PRODUCTION } from '../src/data/work-stats';
import { restatedMetrics, wordCount } from '../src/test/answer-copy';
import { formatContentDate } from '../src/lib/content-date';
import { fetchHead, first } from './support/served-head';

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
 * A route's JSON-LD nodes, its canonical links and its "Last updated" lines, as served. The browser's
 * `DOMParser` reads the response, as `servedCaseStudy()` below does: the canonical comes from the
 * parsed `<head>`, never from the copy of the head in the RSC flight payload, and only real `<time>`
 * elements count.
 */
async function servedGraph(request: APIRequestContext, page: Page, path: string) {
  const response = await request.get(path);
  expect(response.status(), `GET ${path}`).toBe(expectedStatus(path));
  const { sources, canonicals, lastUpdated } = await page.evaluate(
    (markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      return {
        sources: [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
          (script) => script.textContent ?? '',
        ),
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
    },
    await response.text(),
  );
  const nodes = sources.map((source, index) => {
    try {
      return JSON.parse(source) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `${path}: JSON-LD block ${index} does not parse (${String(error)}): ${source}`,
      );
    }
  });
  return { nodes, canonicals, lastUpdated };
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
  const typesOf = (path: string) => {
    if (path === NOT_FOUND_ROUTE) return ['Person', 'WebSite'];
    if (path === '/about') return ['Person', 'WebSite', 'ProfilePage'];
    if ((CASE_STUDY_ROUTES as readonly string[]).includes(path)) {
      return ['Person', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'];
    }
    return ['Person', 'WebSite', 'WebPage'];
  };
  const problems: string[] = [];
  const canonicalOf = new Map<string, string>();
  const served = new Map<string, Record<string, unknown>[]>();
  for (const path of [...STATIC_ROUTES, ...CASE_STUDY_ROUTES, NOT_FOUND_ROUTE]) {
    const { nodes, canonicals } = await servedGraph(request, page, path);
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
      // A relative link would resolve against whatever page a crawler found it on.
      for (const key of ['@id', 'url'] as const) {
        const link = node[key];
        if (link !== undefined && !/^https?:\/\/[^/]/.test(String(link))) {
          problems.push(
            `${path}: ${String(node['@type'])}.${key} is ${String(link)}, not absolute`,
          );
        }
      }
    }
    for (const node of nodes) {
      for (const { at, ref } of referencesIn(node)) {
        const where = `${path}: ${String(node['@type'])}.${at}`;
        if (!ids.has(String(ref['@id']))) {
          problems.push(`${where} names ${String(ref['@id'])}, which this document does not serve`);
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
  }

  // A case study's article is its page's main entity, and its breadcrumb runs Home, Work, the study,
  // in that order, each step at the canonical its own document serves.
  caseStudies.forEach((study, index) => {
    const path = CASE_STUDY_ROUTES[index];
    const nodes = served.get(path) ?? [];
    const byType = (type: string) => nodes.find((node) => node['@type'] === type);
    const [webPage, article, crumbs] = ['WebPage', 'TechArticle', 'BreadcrumbList'].map(byType);
    if (!webPage || !article || !crumbs) return;
    if ((article.mainEntityOfPage as { '@id'?: unknown })?.['@id'] !== webPage['@id']) {
      problems.push(`${path}: the TechArticle's mainEntityOfPage is not its WebPage`);
    }
    if ((webPage.breadcrumb as { '@id'?: unknown })?.['@id'] !== crumbs['@id']) {
      problems.push(`${path}: the WebPage's breadcrumb is not its BreadcrumbList`);
    }
    const trail = JSON.stringify(crumbs.itemListElement);
    const expected = JSON.stringify(
      [
        ['Home', canonicalOf.get('/')],
        ['Work', canonicalOf.get('/work')],
        [study.title, canonicalOf.get(path)],
      ].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
    );
    if (trail !== expected)
      problems.push(`${path}: the breadcrumb is ${trail}, expected ${expected}`);
  });

  expect(problems).toEqual([]);
});

test('/about shows the day its ProfilePage says it was modified (#57)', async ({
  page,
  request,
}) => {
  // Markup that asserts a date the page does not show breaks the structured-data rule this graph is
  // held to (ADR 0031), so /about prints its date as /privacy does, and the two must agree.
  const { nodes, lastUpdated } = await servedGraph(request, page, '/about');
  const profile = nodes.find((node) => node['@type'] === 'ProfilePage');
  expect(profile, '/about serves a ProfilePage').toBeDefined();
  const dateModified = String(profile?.dateModified);
  expect(dateModified, 'the ProfilePage dateModified').toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(lastUpdated, 'one "Last updated" line, its <time> holding the dateModified').toEqual([
    { text: `Last updated ${dateModified}.`, datetimes: [dateModified] },
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
  const blocks = [
    ...homeHtml.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map(([, body], index) => {
    try {
      return JSON.parse(body) as { '@type': string; description?: string };
    } catch (error) {
      throw new Error(`JSON-LD block ${index} on / does not parse: ${String(error)}\n${body}`);
    }
  });
  const person = blocks.find((block) => block['@type'] === 'Person');
  const about = await fetchHead(request, '/about');
  expect(about.status, 'GET /about').toBe(200);

  const surfaces = {
    'the Person JSON-LD description on /': person?.description ?? '',
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
 * and its JSON-LD blocks. The browser's `DOMParser` reads the response, as `served-html.spec.ts` and
 * `hydration-marker.spec.ts` do, and not a regular expression: the RSC flight payload repeats the
 * dates and both labels, and the JSON-LD's `datePublished` contains one of them, all inside scripts
 * where no reader sees them. Parsed, a script's text is never an element, so only real `<time>`
 * elements count, and a document made by `DOMParser` runs none of its scripts. A label is read by
 * structure, a `<dt>` whose next sibling is a `<dd>` holding only the `<time>`, so a separator or
 * hidden text added next to one reads as a changed line, not as a wrong date.
 */
async function servedCaseStudy(request: APIRequestContext, page: Page, path: string) {
  const response = await request.get(path);
  expect(response.status(), `${path} should answer 200`).toBe(200);
  const { timeCount, dates, jsonLdSources } = await page.evaluate(
    (markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const labelled: ServedDate[] = [];
      for (const dt of doc.body.querySelectorAll('dt')) {
        const dd = dt.nextElementSibling;
        const time = dd?.firstElementChild;
        if (dt.children.length > 0 || dd?.localName !== 'dd' || time?.localName !== 'time')
          continue;
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
        jsonLdSources: [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
          (script) => script.textContent ?? '',
        ),
      };
    },
    await response.text(),
  );
  const jsonLd = jsonLdSources.map((block, index) => {
    try {
      return JSON.parse(block) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `${path}: JSON-LD block ${index} does not parse (${String(error)}): ${block}`,
      );
    }
  });
  return { timeCount, dates, jsonLd };
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
