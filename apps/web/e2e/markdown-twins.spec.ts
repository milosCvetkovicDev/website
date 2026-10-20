import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { caseStudies, formatMetric } from '../src/data/case-studies';
import { storyClosings } from '../src/data/pages/home';
import { visible } from '../src/test/markdown';
import { MARKDOWN_TWINS, SITE_ORIGIN, markdownTwinPath } from './endpoints';
import { NOT_FOUND_ROUTE, STATIC_ROUTES, caseStudyRoute } from './routes';
import { alternates, attributeText, fetchHead, first } from './support/served-head';

/**
 * The Markdown twins (#59): every page route serves a second representation at `<route>/index.md`,
 * rendered at build time by `src/lib/serialise.ts` from the same data the page reads, and
 * advertises it from its `<head>` with `<link rel="alternate" type="text/markdown">`.
 *
 * Everything here reads served bytes through `request`, as an agent's fetch tool does: the head as
 * `support/served-head.ts` parses it, and the twin as the text it is. The only browser use is in
 * the two parity tests at the end, which parse a served page with `DOMParser` (scripting off,
 * nothing navigated) because a heading's text is only what a parser says it is.
 *
 * The routes and their twin paths come from `endpoints.ts` and `routes.ts`, so a new static route
 * or case study is checked here without touching this file. `machine-readable.spec.ts` keeps its
 * #59 rows; this spec is the twins' fuller contract.
 */

test.describe.configure({ timeout: 60_000 });

/** RFC 7763's type with the charset it requires, written once by `markdownResponse()`. */
const MARKDOWN = 'text/markdown; charset=utf-8';

/** A twin's blocks, as a reader sees them: the text between blank lines, less the final newline. */
const blocksOf = (markdown: string) =>
  visible(markdown)
    .trimEnd()
    .split(/\n{2,}/);

/**
 * Four or more single letters in a row, each followed by one space: `M o s t` rather than `Most`,
 * the shape a per-character `<span>` heading takes in extracted text, which a twin exists to avoid.
 * Letters only, so copy such as `A / B / C / D` or `x + y = z` is not mistaken for one.
 */
const SPACED_OUT = /(?<!\S)(?:\p{L} ){3,}\p{L}(?!\S)/u;

/** Collapses every run of whitespace to one space, as a parsed heading's text is. */
const collapsed = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The whole units of text a twin holds, as a reader sees them: each heading line's text, each
 * table cell, each bold term and each link's text. A page's heading is looked up here as a whole
 * unit, never as a substring, so a short heading such as `Go` cannot pass on a word in some
 * paragraph of another section.
 */
function unitsOf(markdown: string): Set<string> {
  const units = new Set<string>();
  for (const line of visible(markdown).split('\n')) {
    const heading = line.match(/^#{1,6} (.*)$/)?.[1];
    if (heading !== undefined) units.add(collapsed(heading));
    if (/^\|.*\|$/.test(line)) {
      for (const cell of line.slice(1, -1).split(' | ')) units.add(collapsed(cell));
    }
    for (const [, term] of line.matchAll(/\*\*(.+?)\*\*/g)) units.add(collapsed(term));
    for (const [, text] of line.matchAll(/\[([^\]]+)\]\(/g)) units.add(collapsed(text));
  }
  return units;
}

async function fetchTwin(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path);
  expect(response.status(), `${path} should answer 200`).toBe(200);
  expect(response.headers()['content-type'], `${path} should be served as Markdown`).toBe(MARKDOWN);
  return response.text();
}

for (const { route, twin } of MARKDOWN_TWINS) {
  test(`${route} advertises one twin, served as Markdown, that opens with its description`, async ({
    request,
  }) => {
    const head = await fetchHead(request, route);
    expect(head.status, `${route} should answer 200`).toBe(200);

    const hrefs = alternates(head, 'text/markdown');
    expect(hrefs, `${route} should advertise exactly one Markdown twin`).toHaveLength(1);
    // `metadataBase` resolves the relative path `buildMetadata()` sets into the site's origin.
    const advertised = new URL(attributeText(hrefs[0]), SITE_ORIGIN);
    expect(`${advertised.origin}${advertised.pathname}${advertised.search}`).toBe(
      `${SITE_ORIGIN}${twin}`,
    );

    const blocks = blocksOf(await fetchTwin(request, twin));
    expect(blocks.length, `${twin} should open with a title, a summary and Source`).toBeGreaterThan(
      2,
    );
    const [title, summary, source] = blocks;
    expect(title).toMatch(/^# \S/);
    const description = first(head.meta, 'description');
    expect(description, `${route} should serve a meta description`).toBeDefined();
    expect(summary, "the twin's summary is the page's description").toBe(
      attributeText(description ?? ''),
    );
    const canonical = head.link.get('canonical') ?? [];
    expect(canonical, `${route} should serve one canonical`).toHaveLength(1);
    expect(source, 'the twin names the page it mirrors by its canonical URL').toBe(
      `Source: ${attributeText(canonical[0])}`,
    );
  });
}

test('the 404 advertises no twin, and a path with no twin is a true 404', async ({ request }) => {
  for (const path of [NOT_FOUND_ROUTE, caseStudyRoute('does-not-exist')]) {
    const head = await fetchHead(request, path);
    expect(head.status, `${path} should answer 404`).toBe(404);
    expect(alternates(head, 'text/markdown'), `${path} must advertise no twin`).toEqual([]);
  }

  // Neither a static route that does not exist nor a slug `generateStaticParams` did not produce
  // gets a twin: the case-study handler exports `dynamicParams = false`, so its 404 is decided at
  // the routing layer, as the page's is (ADR 0015), and not a 200 carrying an HTML shell.
  for (const path of [
    `${NOT_FOUND_ROUTE}/index.md`,
    '/nope/index.md',
    markdownTwinPath(caseStudyRoute('does-not-exist')),
  ]) {
    const response = await request.get(path);
    expect(response.status(), `${path} should answer 404`).toBe(404);
    expect(response.headers()['content-type'] ?? '', `${path} is no twin`).not.toMatch(
      /^text\/markdown/,
    );
  }
});

test('/index.md carries the six closing lines of the story, each one whole', async ({
  request,
}) => {
  const blocks = blocksOf(await fetchTwin(request, markdownTwinPath('/')));

  // The sentences the issue names, and every closing pair the story renders, heading and line.
  for (const sentence of [
    'Most bugs live in the gap between what you asked for and what you meant.',
    'The bottleneck was never my typing speed.',
    'This happened at 3:14am. Nobody got paged.',
  ]) {
    expect(blocks).toContain(`## ${sentence}`);
  }
  const closings = Object.values(storyClosings);
  expect(closings.length).toBeGreaterThan(0);
  for (const { heading, paragraphs } of closings) {
    expect(blocks).toContain(`## ${heading}`);
    expect(blocks).toContain(paragraphs[0]);
  }
  expect(blocks.join('\n\n')).not.toMatch(SPACED_OUT);
});

for (const study of caseStudies) {
  const route = caseStudyRoute(study.slug);
  // The dates, the metric and every list entry, as served. That every other field of the study
  // reaches the twin is `serialise.test.ts`'s walk over its keys, and that the handler serves the
  // serialiser's output unchanged is `pages.test.ts`'s; the headings are the parity test's below.
  test(`${markdownTwinPath(route)} carries the study's dates, metric, lists and stack`, async ({
    request,
  }) => {
    const shown = visible(await fetchTwin(request, markdownTwinPath(route)));
    const lines = shown.split('\n');
    const { metric } = study.highlight;

    expect(lines[0]).toBe(`# ${study.title}`);
    expect(lines).toContain(`Source: ${SITE_ORIGIN}${route}`);
    expect(lines).toContain(`- Published: ${study.publishedAt}`);
    expect(lines).toContain(`- Updated: ${study.updatedAt}`);
    // The metric as the cards render it, through the one function both read.
    expect(lines).toContain(`- Metric: ${formatMetric(metric)} ${metric.label}`);
    for (const entry of [...study.contributions, ...study.impact]) {
      expect(lines).toContain(`- ${entry}`);
    }
    for (const { category, items } of study.techStack) {
      expect(lines).toContain(`| ${category} | ${items.join(', ')} |`);
    }
    expect(shown).not.toMatch(SPACED_OUT);
  });
}

/**
 * The text of every `h2` and `h3` inside `main#main-content` and outside a `<nav>`, and the first
 * cell of every table row there, as the served HTML reads once parsed: whitespace collapsed,
 * character references decoded. A `<nav>` is the way on to other pages (a case study's "More
 * work"), not this page's content. `DOMParser` runs with scripting off and navigates nothing.
 */
async function pageLandmarks(page: Page, html: string): Promise<string[]> {
  return page.evaluate((markup) => {
    const main = new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelector('main#main-content');
    if (!main) return [];
    const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    return [
      ...[...main.querySelectorAll('h2, h3')]
        .filter((heading) => !heading.closest('nav'))
        .map(text),
      ...[...main.querySelectorAll('tr')]
        .map((row) => row.querySelector(':scope > th, :scope > td'))
        .filter((cell): cell is Element => cell !== null)
        .map(text),
    ].filter(Boolean);
  }, html);
}

/**
 * The text of every `h1` in a served page, read as `pageLandmarks` reads `main`, but over the whole
 * document: an `h1` moved outside `main` would still be the page's first heading.
 */
async function pageH1s(page: Page, html: string): Promise<string[]> {
  return page.evaluate(
    (markup) =>
      [...new DOMParser().parseFromString(markup, 'text/html').querySelectorAll('h1')].map((h1) =>
        (h1.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    html,
  );
}

// The parity of the first line (#58): every page, `/` included, since the hero's `h1` is plain
// text. A static route renders its `h1` from its record's `heading`, a case study and a post from
// their title, and the twin opens with the same field, so a page that writes its `h1` any other way
// fails here as soon as the two read differently.
for (const { route, twin } of MARKDOWN_TWINS) {
  test(`${route} serves one h1, and ${twin} opens with it`, async ({ page, request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'], `${route} should be served as HTML`).toMatch(
      /^text\/html/,
    );
    const h1s = await pageH1s(page, await response.text());
    expect(h1s, `${route} should serve exactly one h1`).toHaveLength(1);

    // Collapsed as the h1 is, so a no-break space both sides carry cannot read as a difference.
    const [opening] = visible(await fetchTwin(request, twin)).split('\n');
    expect(collapsed(opening), `${twin} should open with the page's h1`).toBe(`# ${h1s[0]}`);
  });
}

// Every page but `/`, whose story headings are rendered one `<span>` per character, so their parsed
// text is not a stable expectation; the story test above covers them. A heading or a table row
// added to one of these pages without its record fails here. This checks the page's structure,
// its headings and the rows' first cells, not every paragraph: the prose is the record's, which
// both the page and the twin render.
for (const route of [
  ...STATIC_ROUTES.filter((path) => path !== '/'),
  ...caseStudies.map(({ slug }) => caseStudyRoute(slug)),
]) {
  test(`every heading and table row ${route} serves is a whole unit of its twin`, async ({
    page,
    request,
  }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const landmarks = await pageLandmarks(page, await response.text());
    // The control: an extractor that found nothing would pass every page vacuously.
    expect(landmarks.length, `${route} should serve headings inside main`).toBeGreaterThan(0);

    const units = unitsOf(await fetchTwin(request, markdownTwinPath(route)));
    expect(landmarks.filter((text) => !units.has(text))).toEqual([]);
  });
}
