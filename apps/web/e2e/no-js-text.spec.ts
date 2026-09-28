import { expect, test } from '@playwright/test';
import { caseStudies, formatMetric } from '../src/data/case-studies';
import { CASE_STUDY_ROUTES, STATIC_ROUTES } from './routes';
import { gotoHydrated } from './support/hydration';
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
 * `served-html.spec.ts` uses too. Every number below is pinned to that function: a different
 * extractor measures a different number on the same page, and a whitespace-joining one shatters the
 * `AnimatedText` headlines into letters, which its docblock explains.
 *
 * Per route, the served HTML must answer 200, carry at least its floor of characters, and contain
 * its load-bearing phrases.
 *
 * **Floors.** A floor on how much was measured, the idea behind the node floors in
 * `accessibility.spec.ts`: content that stops being prerendered, because it moved into a client-only
 * component, behind a `<Suspense>` boundary or a `React.lazy` import, fails here while every browser
 * test stays green. ADR 0009's static phase imports are why `/` prerendered its whole story in the
 * first place. `/`, `/about` and `/work` take the floors of the PRD's "Content a machine can extract"
 * scenario (`.claude/prds/ai-discoverability-2026-09.md`: 4000, 2500 and 1200). The rest are about
 * 80% of the measurement below, rounded down to a hundred: room for copy edits, and a failure for a
 * page that loses a fifth of its text. The case studies share one floor, taken from the shortest,
 * because they share one template: it catches the template losing a section, not one study doing so.
 * Measured on 2026-09-28 against the production build of `main` at bb039fa:
 *
 * | Route                           | Characters | Floor |
 * | ------------------------------- | ---------- | ----- |
 * | `/`                             | 4588       | 4000  |
 * | `/about`                        | 3180       | 2500  |
 * | `/work`                         | 2154       | 1200  |
 * | `/skills`                       | 2311       | 1800  |
 * | `/blog`                         | 401        | 300   |
 * | `/contact`                      | 695        | 500   |
 * | `/privacy`                      | 1791       | 1400  |
 * | `/work/self-healing-agent`      | 3951       | 3100  |
 * | `/work/enterprise-b2b-platform` | 3929       | 3100  |
 * | `/work/nx-remote-cache`         | 4746       | 3100  |
 *
 * Never lower a floor to quieten a failure. A deliberate cut of a page's copy re-measures, and
 * records the new count and its date in this table in the same change.
 *
 * **Phrases.** Presence only. No year count and no metric value is written here, because #49 settles
 * those: the case-study titles, metrics and stacks are read from `src/data/case-studies.ts`, so this
 * file cannot fork them. The headline metric is asserted on `/work` alone: on `/`, `MetricCounter`
 * serves the active card's metric at the start of its count (`0%`), not its value.
 */

test.describe.configure({ retries: 0 });

type StaticRoute = (typeof STATIC_ROUTES)[number];

/** Typed over every static route, so a new page does not compile until it has a floor. */
const FLOORS: Record<StaticRoute, number> = {
  '/': 4000,
  '/about': 2500,
  '/work': 1200,
  '/skills': 1800,
  '/blog': 300,
  '/contact': 500,
  '/privacy': 1400,
};

/** Every `/work/<slug>`: one template, so one floor, taken from the shortest study. */
const CASE_STUDY_FLOOR = 3100;

const floorOf = (path: string): number =>
  path in FLOORS ? FLOORS[path as StaticRoute] : CASE_STUDY_FLOOR;

const HOME_PHRASES = [
  // The discovery phase's headline (`discovery-phase.tsx:206`), rendered one `<span>` per character
  // by `AnimatedText`'s wave animation: a zero-join extractor reads it whole.
  'Most bugs live in the gap between what you asked for and what you meant.',
  // Two phrases, not one sentence: `hero-content.tsx:140-142` separates them with a `<br />`, which
  // yields no whitespace under any tag-strip, so the served text reads `…at 3am.Nobody woke up.` and
  // the sentence with its space is in no crawler's copy of the page.
  'This happened at 3am.',
  'Nobody woke up.',
];

/** The load-bearing phrases each route must serve. A route that is not listed has none. */
const PHRASES = new Map<string, string[]>([
  ['/', HOME_PHRASES],
  ['/work', caseStudies.flatMap(({ title, highlight }) => [title, formatMetric(highlight.metric)])],
  ...CASE_STUDY_ROUTES.map((path): [string, string[]] => {
    const study = caseStudies.find(({ slug }) => path === `/work/${slug}`);
    if (!study) throw new Error(`no case study behind ${path}`);
    return [path, [study.title, ...study.techStack.flatMap(({ items }) => items)]];
  }),
]);

for (const path of [...STATIC_ROUTES, ...CASE_STUDY_ROUTES]) {
  test(`${path} serves its text to a crawler that runs no JavaScript`, async ({
    page,
    request,
  }) => {
    const response = await request.get(path);
    expect(response.status(), `${path} must answer 200`).toBe(200);
    const text = await servedText(page, await response.text());

    const floor = floorOf(path);
    expect
      .soft(
        text.length,
        `${path} serves ${text.length} characters of text without JavaScript, under its floor of ` +
          `${floor}: copy that stopped being prerendered is invisible to every AI crawler`,
      )
      .toBeGreaterThanOrEqual(floor);

    const missing = (PHRASES.get(path) ?? []).filter((phrase) => !text.includes(phrase));
    expect(missing, `${path} does not serve these load-bearing phrases in its HTML`).toEqual([]);
  });
}

test('/ renders at most 15% more text with JavaScript than it serves without', async ({
  page,
  request,
}) => {
  // The day copy moves into a client-only component, the rendered page gains text the response
  // lacks. Measured 3% on 2026-09-12 (#55: 5,320 rendered against 5,156 served, another extractor)
  // and 5.5% on 2026-09-28 (4,839 against 4,588, this one). Most of today's difference is not copy:
  // `innerText` puts a line break between blocks, and both sides collapse whitespace the same way,
  // but zero-join puts nothing there.
  const served = await servedText(page, await (await request.get('/')).text());

  // The clock is paused before the page loads, so no timer fires and the read is the page exactly as
  // it hydrated (React hydrates without a timer: 370 ms in the measurement). Without the pause the
  // number moves. The decorative tmux background (`tmux-background.tsx`, `aria-hidden`, desktop
  // widths only) streams a log line into each of its five panes every 400 to 850 ms from the first
  // idle moment, and the same read measured 5.5% at hydration, 11.9% two seconds later and 39.7%
  // seven seconds later: a gate on a number that grows while it waits is a flaky gate. The cost is
  // copy that only a timer reveals, which this read cannot see; a client-only component renders
  // when the page hydrates, and that is what it reads.
  await page.clock.install({ time: new Date('2026-09-28T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-28T12:00:01Z'));
  await gotoHydrated(page, '/');
  const rendered = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');

  expect(
    rendered.length / served.length,
    `/ renders ${rendered.length} characters with JavaScript against ${served.length} served ` +
      'without it: copy that only the browser renders is invisible to every AI crawler',
  ).toBeLessThanOrEqual(1.15);
});
