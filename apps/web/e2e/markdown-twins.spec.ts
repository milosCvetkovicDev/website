import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { caseStudies, formatMetric } from '../src/data/case-studies';
import { storyClosings } from '../src/data/pages/home';
import { MARKDOWN_TWINS, SITE_ORIGIN, markdownTwinPath } from './endpoints';
import { NOT_FOUND_ROUTE, STATIC_ROUTES, caseStudyRoute } from './routes';
import { alternates, attributeText, fetchHead, first } from './support/served-head';

/**
 * The Markdown twins (#59): every page route serves a second representation at `<route>/index.md`,
 * rendered at build time by `src/lib/serialise.ts` from the same data the page reads, and
 * advertises it from its `<head>` with `<link rel="alternate" type="text/markdown">`.
 *
 * Everything here reads served bytes through `request`, as an agent's fetch tool does: the head as
 * `support/served-head.ts` parses it, and the twin as the text it is. The one browser use is the
 * parity test at the end, which parses a served page with `DOMParser` (scripting off, nothing
 * navigated) because a heading's text is only what a parser says it is.
 *
 * The routes and their twin paths come from `endpoints.ts` and `routes.ts`, so a new static route
 * or case study is checked here without touching this file. `machine-readable.spec.ts` keeps its
 * #59 rows; this spec is the twins' fuller contract.
 */

test.describe.configure({ timeout: 60_000 });

/** RFC 7763's type with the charset it requires, written once by `markdownResponse()`. */
const MARKDOWN = 'text/markdown; charset=utf-8';

/** The text a Markdown reader sees: CommonMark drops the backslash before ASCII punctuation. */
const visible = (markdown: string) => markdown.replace(/\\([!-/:-@[-`{-~])/g, '$1');

/** A twin's blocks, as a reader sees them: the text between blank lines, less the final newline. */
const blocksOf = (markdown: string) =>
  visible(markdown)
    .trimEnd()
    .split(/\n{2,}/);

/**
 * Four or more single characters in a row, each followed by one space: `M o s t` rather than `Most`,
 * the shape a per-character `<span>` heading takes in extracted text, which a twin exists to avoid.
 */
const SPACED_OUT = /(?<!\S)(?:[^\s|] ){3,}[^\s|](?!\S)/u;

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

    const [title, summary, source] = blocksOf(await fetchTwin(request, twin));
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
  for (const path of [NOT_FOUND_ROUTE, '/work/does-not-exist']) {
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
  expect(closings).toHaveLength(6);
  for (const { heading, paragraphs } of closings) {
    expect(blocks).toContain(`## ${heading}`);
    expect(blocks).toContain(paragraphs[0]);
  }
  expect(blocks.join('\n\n')).not.toMatch(SPACED_OUT);
});

for (const study of caseStudies) {
  const route = caseStudyRoute(study.slug);
  test(`${markdownTwinPath(route)} carries the whole case study`, async ({ request }) => {
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
 * The text of every `h2` and `h3` inside `main#main-content`, and the first cell of every table
 * row there, as the served HTML reads once parsed: whitespace collapsed, character references
 * decoded. `DOMParser` runs with scripting off and navigates nothing.
 */
async function pageLandmarks(page: Page, html: string): Promise<string[]> {
  return page.evaluate((markup) => {
    const main = new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelector('main#main-content');
    if (!main) return [];
    const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    return [
      ...[...main.querySelectorAll('h2, h3')].map(text),
      ...[...main.querySelectorAll('tr')]
        .map((row) => row.querySelector(':scope > th, :scope > td'))
        .filter((cell): cell is Element => cell !== null)
        .map(text),
    ].filter(Boolean);
  }, html);
}

// `/` and the case studies are covered above instead: the story's headings on `/` are rendered one
// `<span>` per character, so their parsed text is not a stable expectation, and a case study's twin
// is checked against every field of its data. Every other page is read here, so a heading or a
// table row added to a page without its record fails, and no twin is thinner than its page.
for (const route of STATIC_ROUTES.filter((path) => path !== '/')) {
  test(`every heading and table row ${route} serves is in its twin`, async ({ page, request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    const landmarks = await pageLandmarks(page, await response.text());
    // The control: an extractor that found nothing would pass every page vacuously.
    expect(landmarks.length, `${route} should serve headings inside main`).toBeGreaterThan(0);

    const shown = visible(await fetchTwin(request, markdownTwinPath(route))).replace(/\s+/g, ' ');
    expect(landmarks.filter((text) => !shown.includes(text))).toEqual([]);
  });
}
