import { expect, test, type APIRequestContext } from '@playwright/test';
import { NOT_FOUND_ROUTE, PAGE_ROUTES, STATIC_ROUTES, expectedStatus } from './routes';

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
 * documents.
 */

test.describe.configure({ retries: 0, timeout: 60_000 });

interface Head {
  raw: string;
  status: number;
  /** `<meta name|property="…" content="…">` collected as name -> every content value seen. */
  meta: Map<string, string[]>;
  /** `<link rel="…" href="…">` the same way. */
  link: Map<string, string[]>;
}

async function fetchHead(request: APIRequestContext, path: string): Promise<Head> {
  const response = await request.get(path);
  const html = await response.text();
  // Only the head: the flight payload below it describes the same tags and would answer for one that
  // never reached the markup.
  const raw = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const meta = new Map<string, string[]>();
  const link = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const lower = key.toLowerCase();
    map.set(lower, [...(map.get(lower) ?? []), value]);
  };

  for (const tag of raw.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:name|property)=["']([^"']+)["']/i)?.[1];
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (key !== undefined && content !== undefined) add(meta, key, content);
  }
  for (const tag of raw.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']*)["']/i)?.[1];
    if (rel !== undefined && href !== undefined) add(link, rel, href);
  }
  return { raw, status: response.status(), meta, link };
}

const first = (map: Map<string, string[]>, key: string) => map.get(key)?.[0];

/** Every route a crawler can reach, with the status it answers. */
const routes = PAGE_ROUTES.map((path) => ({ path, status: expectedStatus(path) }));

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

test('every route serves one canonical link for its own path', async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R22, #48' });

  const problems: string[] = [];
  for (const { path, status } of routes) {
    const head = await fetchHead(request, path);
    expect(head.status, `${path} should answer ${status}`).toBe(status);
    const canonicals = head.link.get('canonical') ?? [];
    if (canonicals.length !== 1) {
      problems.push(`${path}: ${canonicals.length} canonical links, expected 1`);
      continue;
    }
    // The path must be its own, not the home page's: one canonical pointing everywhere is worse than
    // none, because it tells a crawler these are all the same document.
    const pathname = new URL(canonicals[0], 'https://miloscvetkovic.dev').pathname.replace(
      /(.)\/$/,
      '$1',
    );
    if (pathname !== path) problems.push(`${path}: canonical points at ${canonicals[0]}`);
  }

  expect(
    problems,
    '`canonical` and `alternates` appear nowhere in apps/web/src. Set `alternates.canonical` per ' +
      'route (metadataBase is already set in layout.tsx, so a relative path resolves).',
  ).toEqual([]);
});

test('every route serves an og:image that answers with an image', async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R23, #48' });

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
    // `metadataBase` (`layout.tsx:26`) makes every metadata URL absolute to https://miloscvetkovic.dev,
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
      '/opengraph-image answers 404, while layout.tsx:63 promises `summary_large_image`. Every ' +
      'shared link renders as a bare URL.',
  ).toEqual([]);
});

test('every route serves the full Open Graph set and its own twitter:title', async ({
  request,
}) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R24, #48' });

  const problems: string[] = [];
  const twitterTitles = new Map<string, string>();
  for (const { path } of routes) {
    const head = await fetchHead(request, path);
    for (const key of ['og:url', 'og:site_name', 'og:locale', 'og:type']) {
      if (!first(head.meta, key)) problems.push(`${path}: no ${key}`);
    }
    const twitterTitle = first(head.meta, 'twitter:title');
    if (!twitterTitle) problems.push(`${path}: no twitter:title`);
    else twitterTitles.set(path, twitterTitle);
  }

  // A sub-page that serves the home page's twitter:title is a second bug with the same cause: an
  // `openGraph: { title, description }` on a route *replaces* the root object from layout.tsx:53-61
  // rather than merging into it, so the inherited fields vanish and the card falls back to the root.
  const home = twitterTitles.get('/');
  const borrowed = [...twitterTitles]
    .filter(([path, title]) => path !== '/' && title === home)
    .map(([path]) => path);
  if (borrowed.length > 0) {
    problems.push(`these routes serve the home page's twitter:title: ${borrowed.join(', ')}`);
  }

  expect(
    problems,
    'a per-route `openGraph` object replaces the root one instead of merging: spread the shared ' +
      'fields, or set them per route.',
  ).toEqual([]);
});

test('robots.txt allows what the site serves and names nothing it does not', async ({
  request,
}) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R25, #48' });

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

test('/blog is noindex while it is a placeholder', async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R26, #48' });

  const head = await fetchHead(request, '/blog');
  const robots = (head.meta.get('robots') ?? []).join(' ');

  expect(
    robots,
    'the Coming Soon placeholder (blog/page.tsx:43) inherits the root `index, follow`, so an empty ' +
      'page is offered to search. The owner decision of 2026-09-11 keeps the nav link and the ' +
      'placeholder, and makes it noindex.',
  ).toContain('noindex');
});

test('a 404 serves exactly one robots tag, and it says noindex', async ({ request }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R27, #48' });

  const head = await fetchHead(request, NOT_FOUND_ROUTE);
  expect(head.status).toBe(404);
  const robots = head.meta.get('robots') ?? [];

  // Two tags that contradict each other are worse than the wrong one: the root `robots` block
  // (layout.tsx:69-79) applies to the not-found page too, and not-found.tsx exports no metadata of its
  // own, so `index, follow` is emitted alongside whatever else — plus a googlebot `index, follow`.
  expect(
    { robots, googlebot: head.meta.get('googlebot') ?? [] },
    'a 404 must be noindex, and must not also claim index, follow.',
  ).toEqual({ robots: [expect.stringContaining('noindex')], googlebot: [] });
});

test('the icons and the web manifest are served, and the favicon is not boilerplate', async ({
  request,
}) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R28, #48' });

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
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R29, #48' });

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
  // (`sitemap.ts:5`), so pinning `https://miloscvetkovic.dev` would fail for anyone who sets that
  // variable — and the origin is not what this test is about. R31 pins the URL *set* against the data.
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) =>
    new URL(url).pathname.replace(/(.)\/$/, '$1'),
  );
  expect(listed.length, 'the sitemap must list something').toBeGreaterThan(0);
  // Every static route except /blog, which the owner decision of 2026-09-11 keeps out of the sitemap
  // (and which R31 pins on the sitemap() output itself).
  for (const path of STATIC_ROUTES.filter((route) => route !== '/blog')) {
    expect(listed, `the sitemap must list ${path}`).toContain(path);
  }

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const body = await robots.text();
  expect(body.toLowerCase()).toContain('user-agent: *');
  expect(body, 'robots.txt must point at the sitemap').toContain('Sitemap:');
});

test('both JSON-LD blocks are served and parse', async ({ request }) => {
  // Green. `json-ld.tsx` writes its objects straight into the script element without escaping, so a
  // malformed object would ship as broken JSON with nothing failing. The escape hole in that same
  // function is R32, unit tested in src/components/__tests__/json-ld.test.tsx.
  const response = await request.get('/');
  const html = await response.text();
  const blocks = [
    ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ].map(([, body]) => body);
  expect(blocks, 'layout.tsx renders PersonJsonLd and WebsiteJsonLd').toHaveLength(2);

  const parsed = blocks.map(
    (body) => JSON.parse(body) as { '@type': string; '@context': string; url: string },
  );
  expect(parsed.map((block) => block['@type'])).toEqual(['Person', 'WebSite']);
  for (const block of parsed) {
    expect(block['@context']).toBe('https://schema.org');
    expect(block.url).toMatch(/^https?:\/\//);
  }
});
