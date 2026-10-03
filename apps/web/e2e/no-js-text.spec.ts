import { expect, test } from '@playwright/test';
import { caseStudies, formatMetric } from '../src/data/case-studies';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from './routes';
import { gotoHydrated } from './support/hydration';
import { PAGE_HEADINGS } from './support/page-headings';
import { servedText } from './support/served-text';

/**
 * The text a crawler that runs no JavaScript reads, route by route (#55, AC 2 to 4; FR-1).
 *
 * Every dedicated AI crawler reads exactly the bytes `request.get(path)` returns: GPTBot,
 * OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot and
 * Bytespider execute no JavaScript. That comes from the one primary measurement, Vercel and MERJ over
 * about 1.3bn fetches (vercel.com/blog/the-rise-of-the-ai-crawler, 2024-12-17), which no vendor has
 * contradicted or re-measured since, so it is widely believed rather than freshly verified. Only
 * Googlebot and Applebot document a renderer, and no crawler scrolls. So this spec reads the
 * response body, never the hydrated DOM, and waits for nothing, except the last test, which is the
 * one comparison with a rendered page.
 *
 * The text comes from `servedText` (`support/served-text.ts`), the zero-join extractor
 * `served-html.spec.ts` uses too, read from `<body>` only: the `<title>` repeats each case study's
 * title, so a phrase check that read `<head>` could never fail on it. Every number below is pinned
 * to that function and that root: a different extractor measures a different number on the same
 * page, and a whitespace-joining one shatters the `AnimatedText` headlines into letters, which its
 * docblock explains. The first test proves the extractor on markup written here.
 *
 * Per route, the served HTML must answer 200, carry at least its floor of characters, and contain
 * its load-bearing phrases.
 *
 * **Floors.** A floor on how much was measured, the idea behind the node floors in
 * `accessibility.spec.ts`: content that stops being prerendered, because it moved into a client-only
 * component, behind a `<Suspense>` boundary or a `React.lazy` import, fails here while every browser
 * test stays green. ADR 0009's static phase imports are why `/` prerendered its whole story in the
 * first place. Each floor is about 80% of the measurement below, rounded down to a hundred: room for
 * copy edits, and a failure for a page that loses a fifth of its text. The PRD's "Content a machine
 * can extract" scenario (`.claude/prds/ai-discoverability-2026-09.md`) sets 4000, 2500 and 1200 for
 * `/`, `/about` and `/work` as minimums; `/` and `/about` sit at or above 80% already, and `/work`
 * takes 1600, because 1200 would let it lose 43% of its text. Each case study has its own floor, so
 * one study losing a section fails; a study added to `case-studies.ts` before it is measured takes
 * the shortest study's floor, and its first change records its own. Measured on 2026-09-28 against
 * the production build of `main` at bb039fa, body text only:
 *
 * | Route                           | Characters | Floor |
 * | ------------------------------- | ---------- | ----- |
 * | `/`                             | 4542       | 4000  |
 * | `/about`                        | 3126       | 2500  |
 * | `/work`                         | 2095       | 1600  |
 * | `/skills`                       | 2250       | 1800  |
 * | `/blog`                         | 374        | 300   |
 * | `/contact`                      | 668        | 500   |
 * | `/privacy`                      | 1764       | 1400  |
 * | `/work/self-healing-agent`      | 3889       | 3100  |
 * | `/work/enterprise-b2b-platform` | 3870       | 3000  |
 * | `/work/nx-remote-cache`         | 4685       | 3700  |
 *
 * The text counted is what the response carries, hidden or not: no route serves an element with the
 * `hidden` attribute, and `aria-hidden` text is 4 characters everywhere except `/`, where most of its
 * 578 are the typewriter's not-yet-typed tail, copy a crawler reads from the bytes.
 *
 * Never lower a floor to quieten a failure. A deliberate cut of a page's copy re-measures, and
 * records the new count and its date in this table in the same change.
 *
 * **Phrases.** Presence only. No year count and no metric value is written here, because #49 settles
 * those: the case-study titles, metrics and stacks are read from `src/data/case-studies.ts`, so this
 * file cannot fork them. The headline metric is asserted on `/work` alone: on `/`, `MetricCounter`
 * serves the active card's metric at the start of its count (`0%`), not its value. A phrase is
 * compared with its whitespace collapsed the way `servedText` collapses it, and as a plain substring:
 * the stack is served zero-joined (`BunElysiaAzure`), so a whole-word match would miss every item.
 */

test.describe.configure({ retries: 0 });

type StaticRoute = (typeof STATIC_ROUTES)[number];

/** Typed over every static route, so a new page does not compile until it has a floor. */
const FLOORS: Record<StaticRoute, number> = {
  '/': 4000,
  '/about': 2500,
  '/work': 1600,
  '/skills': 1800,
  '/blog': 300,
  '/contact': 500,
  '/privacy': 1400,
};

/** Each case study's floor, by slug, from the table above. */
const CASE_STUDY_FLOORS: Record<string, number> = {
  'self-healing-agent': 3100,
  'enterprise-b2b-platform': 3000,
  'nx-remote-cache': 3700,
};

/** A study not measured yet shares the template, so it takes the shortest study's floor. */
const UNMEASURED_CASE_STUDY_FLOOR = Math.min(...Object.values(CASE_STUDY_FLOORS));

const studyAt = (path: string) => caseStudies.find(({ slug }) => path === `/work/${slug}`);

function floorOf(path: string): number {
  if (Object.hasOwn(FLOORS, path)) return FLOORS[path as StaticRoute];
  const study = studyAt(path);
  if (!study)
    throw new Error(`${path} is neither a static route nor a case study: it has no floor`);
  return Object.hasOwn(CASE_STUDY_FLOORS, study.slug)
    ? (CASE_STUDY_FLOORS[study.slug] as number)
    : UNMEASURED_CASE_STUDY_FLOOR;
}

const HOME_PHRASES = [
  // The discovery phase's headline (`DiscoveryPhase`), rendered one `<span>` per character by
  // `AnimatedText`'s wave animation: a zero-join extractor reads it whole.
  'Most bugs live in the gap between what you asked for and what you meant.',
  // The hero's two-line hook and subtitle (`HeroContent`), each whole with the space between its
  // sentences (#58 AC 4). A `<br />` yields no whitespace under any tag-strip, so until #58 put a
  // space before each one the served text read `…at 3am.Nobody woke up.` and `…ship
  // clarity.Scroll to see how.`, and neither sentence pair was in any crawler's copy of the page.
  // The hook is AC 4's exact string, `This happened at 3am. Nobody woke up.`, read from the specs'
  // copy of the five headings and hooks (`support/page-headings.ts`).
  PAGE_HEADINGS['/'].hook,
  'I build systems that inherit chaos and ship clarity. Scroll to see how.',
  // The h1 that names who the site is about, which the hook used to be (#58 AC 1).
  PAGE_HEADINGS['/'].heading,
];

/**
 * The load-bearing phrases `path` must serve, whitespace collapsed as `servedText` collapses it. A
 * route with none returns an empty list. Called inside the route's test, so a case-study route with
 * no study behind it fails that test rather than the whole file's collection.
 */
function phrasesOf(path: string): string[] {
  let phrases: string[] = [];
  if (path === '/') phrases = HOME_PHRASES;
  else if (path === '/work') {
    phrases = caseStudies.flatMap(({ title, highlight }) => [
      title,
      formatMetric(highlight.metric),
    ]);
  } else if (path.startsWith('/work/')) {
    const study = studyAt(path);
    if (!study) throw new Error(`no case study behind ${path}`);
    phrases = [study.title, ...study.techStack.flatMap(({ items }) => items)];
  }
  return phrases.map((phrase) => phrase.replace(/\s+/g, ' ').trim()).filter((phrase) => phrase);
}

test('servedText reads markup the way a browser does', async ({ page }) => {
  // The control for every floor and phrase below, which are only as good as this reading: a walker
  // that started counting script source, or stopped decoding entities, would move every number.
  const html =
    '<!doctype html><html><head><title>Head title</title></head><body>' +
    '<h1>M<span>o</span>st</h1><script>code()</script >after' +
    '<style>p { color: red }</style><template><p>inert</p></template>' +
    '<noscript><p>fallback</p></noscript>' +
    '<p>1 &gt; 0 &amp;nbsp; x&nbsp; y</p><!-- a > b -->end</body></html>';
  const body = 'Most after fallback1 > 0 &nbsp; x yend';
  expect(await servedText(page, html, { root: 'body' })).toBe(body);
  expect(await servedText(page, html)).toBe(`Head title${body}`);
});

for (const path of [...STATIC_ROUTES, ...CASE_STUDY_ROUTES]) {
  test(`${path} serves its text to a crawler that runs no JavaScript`, async ({
    page,
    request,
  }) => {
    const response = await request.get(path);
    expect(response.status(), `${path} must answer 200`).toBe(200);
    const text = await servedText(page, await response.text(), { root: 'body' });

    const floor = floorOf(path);
    expect
      .soft(
        text.length,
        `${path} serves ${text.length} characters of text without JavaScript, under its floor of ` +
          `${floor}: copy that stopped being prerendered is invisible to every AI crawler`,
      )
      .toBeGreaterThanOrEqual(floor);

    const missing = phrasesOf(path).filter((phrase) => !text.includes(phrase));
    expect(missing, `${path} does not serve these load-bearing phrases in its HTML`).toEqual([]);
  });
}

test('/ renders within 15% of the text it serves without JavaScript', async ({ page, request }) => {
  // The day copy moves into a client-only component, the rendered page gains text the response
  // lacks; the day hydration drops server-rendered copy, a rendering crawler reads less than the
  // response promised. Both sides are read by `servedText` from `<body>`: the response, and the
  // hydrated DOM serialised back to HTML, so hidden text, the head and block line breaks count the
  // same on both and only what the client added or removed differs. Measured 0.1% on 2026-09-28
  // (4,547 rendered against 4,542 served). The earlier reads compared `innerText` with a whole-
  // document walk, unlike quantities: 3% on 2026-09-12 (#55, 5,320 against 5,156, another
  // extractor) and 5.5% on 2026-09-28 (4,839 against 4,588), mostly `innerText`'s line breaks.
  const response = await request.get('/');
  expect(response.status(), '/ must answer 200').toBe(200);
  const served = await servedText(page, await response.text(), { root: 'body' });
  expect(served.length, '/ served no body text at all').toBeGreaterThan(0);

  // The clock is paused before the page loads, so no timer fires and the read is the page exactly as
  // it hydrated (React hydrates without a timer: 310 to 370 ms in the measurements). `gotoHydrated`
  // is not held up by the pause: it polls the marker from the test runner, not from page timers.
  // Without the pause the number moves. The decorative tmux background (`TmuxBackground`,
  // `aria-hidden`, desktop widths only) streams a log line into each of its five panes every 400 to
  // 850 ms from the first idle moment, and an `innerText` read measured 5.5% at hydration, 11.9% two
  // seconds later and 39.7% seven seconds later: a gate on a number that grows while it waits is a
  // flaky gate. The cost is copy that only a timer or an idle callback reveals, which this read
  // cannot see; a client-only component renders when the page hydrates, and that is what it reads.
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-28T12:00:01Z'));
  await gotoHydrated(page, '/');
  const rendered = await servedText(page, await page.content(), { root: 'body' });

  const ratio = rendered.length / served.length;
  const counts = `/ renders ${rendered.length} characters with JavaScript against ${served.length} served`;
  expect
    .soft(
      ratio,
      `${counts} without it: copy that only the browser renders is invisible to every AI crawler`,
    )
    .toBeLessThanOrEqual(1.15);
  expect(
    ratio,
    `${counts} without it: hydration removes copy the response carries, so a rendering crawler ` +
      'reads less than a plain one',
  ).toBeGreaterThanOrEqual(0.85);
});
