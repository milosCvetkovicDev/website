import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  CASE_STUDY_ROUTES,
  NOT_FOUND_ROUTE,
  PAGE_ROUTES,
  STATIC_ROUTES,
  expectedStatus,
} from './routes';
import { caseStudies } from '../src/data/case-studies';
import { formatContentDate } from '../src/lib/content-date';

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

test('/blog is noindex while it is a placeholder', async ({ request }) => {
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

test('the JSON-LD blocks are served and parse, and a case study adds its own two', async ({
  request,
}) => {
  // Green. `json-ld.tsx` writes its objects straight into script elements, so a malformed object would
  // ship as broken JSON with nothing failing. The escape they all go through is R32, unit tested in
  // src/components/__tests__/json-ld.test.tsx.
  const blocksOf = async (path: string) => {
    const html = await (await request.get(path)).text();
    return [
      ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
    ].map(([, body]) => JSON.parse(body) as { '@type': string; '@context': string; url?: string });
  };

  const home = await blocksOf('/');
  expect(
    home.map((block) => block['@type']),
    'layout.tsx renders PersonJsonLd and WebsiteJsonLd, and only those, on every route',
  ).toEqual(['Person', 'WebSite']);
  for (const block of home) {
    expect(block['@context']).toBe('https://schema.org');
    expect(block.url).toMatch(/^https?:\/\//);
  }

  for (const path of CASE_STUDY_ROUTES) {
    const blocks = await blocksOf(path);
    expect(
      blocks.map((block) => block['@type']),
      path,
    ).toEqual(['Person', 'WebSite', 'TechArticle', 'BreadcrumbList']);
    const article = blocks[2];
    expect(new URL(String(article.url)).pathname, `${path}: the article's own URL`).toBe(path);
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
