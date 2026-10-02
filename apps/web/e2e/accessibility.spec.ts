import { expect, test, type Page } from '@playwright/test';
import { publishedPosts, type PostBlock } from '../src/data/posts';
import { PAGE_ROUTES, POST_ROUTES, expectedStatus, postRoute } from './routes';
import { expectGsapLoaded } from './support/gsap';
import { expectHydrated } from './support/hydration';
import { TABLES } from './support/tables';
import { TMUX_LOG_STREAM, tmuxLogStreamProblems } from './support/tmux-log-stream';
// The rule map and the result readers are shared with e2e/mobile/accessibility.spec.ts: only
// e2e/mobile/ is selected by the two phone projects, and importing one spec file from another would
// register its tests twice, so they live in their own module.
import {
  audit,
  describeIncomplete,
  describeViolations,
  incompleteNodes,
  passingNodes,
  ruleIdsThatRan,
} from './axe';

/**
 * Accessibility regression gate: every page route must produce zero axe-core violations in both colour
 * schemes, at rest; `/` again after the whole story has been scrolled through, and again with a header
 * link hovered and with one focused. `e2e/mobile/accessibility.spec.ts` runs the at-rest pass on `/` and
 * one case study under the two phone projects.
 *
 * The route list was `['/', '/work/self-healing-agent']` until 2026-09-12 — two of ten — which is why
 * every defect the audit found on `/about`, `/skills`, `/contact`, `/blog` or a 404 was invisible to a
 * green gate. It now comes from `e2e/routes.ts`, the one list `console-clean.spec.ts` reads too.
 *
 * On 2026-09-09 Lighthouse scored both pages 96 on accessibility, for `color-contrast` (the accent
 * used as text, labels dimmed with opacity modifiers, a GSAP reveal parked at 30% opacity) and
 * `label-content-name-mismatch` (Featured Work cards whose accessible name did not contain their
 * visible text). The fixes (ADR 0008) were verified by hand; this spec is what keeps them fixed.
 *
 * The run mirrors Lighthouse's accessibility category: axe-core with the `wcag2a` and `wcag2aa`
 * tags plus the rule overrides below, copied from Lighthouse 13.4.1
 * (core/gather/gatherers/accessibility.js). The overrides are where the experimental
 * `label-content-name-mismatch` rule is switched on; axe leaves it off by default. Only
 * `violations` fail the test. `incomplete` results (axe could not decide, typically a background it
 * cannot resolve behind the hero island) do not, exactly as Lighthouse scores them; both lists are
 * attached to the test report for every run.
 *
 * Counting `incomplete` as neither pass nor failure was the hole the audit found (tests-1): on `/` at
 * rest it is over a hundred nodes, more than half the page's at-rest text, and the hero island ships at
 * 2.6:1 with four green tests here. Deciding those colours needs a different instrument and is #47's
 * work — `e2e/hero-contrast.spec.ts` does it by computed style. What this gate now holds is
 * `INCOMPLETE_CONTRAST_BUDGET`: a per-route, per-scheme ceiling on the undecidable region, so it can
 * shrink but never grow.
 *
 * Two axe behaviours worth knowing before touching a failure, recorded in ADR 0008, whose rules
 * carry over into ADR 0011, the record that supersedes it: `aria-hidden` does not exempt an element
 * from `color-contrast`, because axe measures what is on screen, not what a screen reader gets;
 * `opacity: 0` does, which is why GSAP reveals must start from 0 and never from a partial value.
 *
 * Each page is audited twice. At rest, which is what Lighthouse scores and what the original
 * findings were about. Then, for `/`, again after scrolling the whole story.
 *
 * The second pass exists because most of the story is invisible to axe until it is revealed. The
 * six sections are in the document from the first byte, but each phase starts its GSAP reveal at
 * `opacity: 0`, and axe skips a fully transparent element: at rest 93 elements are transparent, 58
 * of them carrying text, so `/` measures 103 colour-contrast nodes against 425 once the story has
 * been walked. That is how the light-theme contrast failures fixed by ADR 0010 stayed invisible to
 * this gate until they were found by hand. `text-green-400` on a near-white page is 1.7:1, and
 * with the class put back the at-rest pass is still green while the scrolled pass fails.
 *
 * An earlier version of this comment blamed `DeferredSection`, the hydration gate that kept the
 * sections out of the document entirely and left the at-rest pass measuring 30 nodes. PR #22
 * removed it and restored the markup; the floors below are what stop the audited surface shrinking
 * that way again without a test failing.
 *
 * The scrolled pass emulates `prefers-reduced-motion: reduce`, which is what makes it a gate rather
 * than a coin flip. Every phase then renders its finished state on mount instead of on a timeline
 * (ADR 0009), so there is no window in which axe can sample text mid-tween, and no dependence on
 * pipeline timers that run for about seven seconds. It costs the three states that exist only
 * while the animation runs: the deploying panel, the loop's error alert box, and a pipeline stage
 * mid-run, which `reduce` forces straight to `passed`. Their tokens are still covered elsewhere on
 * the page, `--status-warn` by the commit streak and `--status-err` by the healing log's error
 * line, so a palette class reintroduced in a phase still fails here. What this cannot catch is a
 * colour used *only* in one of those three states, and it does not audit the animated path at all:
 * `/` is measured unscrolled at `no-preference` and scrolled at `reduce`, never scrolled at
 * `no-preference`. A scrolled `no-preference` pass is not a gate: sampled mid-tween it reports
 * real `color-contrast` violations against text the reveal has not finished fading in.
 *
 * Some status colours cannot be reached by any audit, because nothing constructs them: a `failed`
 * `PipelineStage`, the `warning` and `error` `NotificationToast` variants, and the `pending` and
 * `error` `ActivityEntry` variants. They are unreachable, not merely uncovered.
 *
 * `/` used to render a boot loader, `fixed` at `z-[1]` under the story's `relative z-10`: axe could
 * only ever report its text as `incomplete`, overlapped by the hero, and no visitor saw it. It was
 * removed with ADR 0022, so every pass here now measures everything `/` puts on screen.
 *
 * Every pass in this file runs at the project's desktop viewport. The phone viewports — which is what
 * Lighthouse emulates by default — are covered by `e2e/mobile/accessibility.spec.ts`, which the two
 * phone projects select and this one does not.
 */

/**
 * Every page route, from the one shared list in `e2e/routes.ts`: the static routes, every case
 * study and every published post, and a 404. This used to be `['/', '/work/self-healing-agent']` —
 * two of ten — which is why every defect the audit found on `/about`, `/skills`, `/contact`,
 * `/blog` or a 404 was invisible to a green gate. `console-clean.spec.ts` reads the same module, so
 * a new route reaches both gates at once.
 */
const pages = PAGE_ROUTES;

/**
 * The text a post's body puts in front of axe at the least: one element per block, and one per item
 * of a list, since a paragraph, a heading, a list item, a code block and a quote each hold text of
 * their own, and `posts.test.ts` refuses an empty one. Inline code and links only add to it.
 */
const bodyTextElements = (body: readonly PostBlock[]) =>
  body.reduce((count, block) => count + (block.kind === 'list' ? block.items.length : 1), 0);

/**
 * Fewest colour-contrast nodes each page must still measure at rest. A floor, not a target: the
 * point is that a change which unmounts content or hides it behind `opacity: 0` fails here instead
 * of silently shrinking the audit, which is what happened while `DeferredSection` existed.
 *
 * Measured on 2026-09-10 for `/` and the case study (103 and 48) and on 2026-09-12 for the eight routes
 * added then; identical in both colour schemes throughout, and identical between the dev server and the
 * production build. Each floor is set well under its measured count so ordinary copy edits do not trip
 * it, and well over zero so a page that stopped rendering does. Raise one only when the page has
 * genuinely grown, and never to quieten a failure. Measured, then floor:
 *
 *   /  103 → 80      /about  61 → 45     /work  8 → 5        /skills  88 → 65
 *   /blog  11 → 8    /contact  21 → 15   /no-such-page  12 → 8
 *   /work/self-healing-agent  48 → 40    /work/enterprise-b2b-platform  59 → 40
 *   /work/nx-remote-cache  43 → 35      /privacy  30 → 22 (measured 2026-09-27, when the page was added)
 *
 * `/work` measuring 8 is not a mistake and is worth knowing: its cards are `backdrop-blur-sm`
 * (`work/page.tsx:51`), so axe cannot resolve what is behind their text and puts 55 of its 63 nodes in
 * `incomplete` instead. The floor there is nearly meaningless; the budget below is the number that
 * matters for that route.
 */
const AT_REST_CONTRAST_FLOOR: Record<string, number> = {
  // Every published post (#61, 61b), first, so that an entry written below for one post wins over
  // this one: a later key replaces an earlier one in an object literal. No post is published yet,
  // so this is derived rather than measured: 8 for the page around the body (its title, the two
  // labelled dates, the back link, the header and the footer), as for the bare 404, plus the
  // body's own text elements, so a body that drops out of the measurement fails even on a long
  // post. Measured locally over two fixture posts while 61b was built: a one-paragraph post
  // measured 16 against a floor of 9, and a post of every block kind (twelve text elements)
  // measured 32 against 20, so the page around a body measures 15. Re-measure when the first post
  // lands, and give it an entry of its own below if its count says the derivation is loose.
  ...Object.fromEntries(
    publishedPosts.map(({ slug, body }) => [postRoute(slug), 8 + bodyTextElements(body)]),
  ),
  '/': 80,
  '/about': 45,
  '/work': 5,
  '/skills': 65,
  '/blog': 8,
  '/contact': 15,
  '/privacy': 22,
  '/work/self-healing-agent': 40,
  '/work/enterprise-b2b-platform': 40,
  '/work/nx-remote-cache': 35,
  '/no-such-page': 8,
};

/**
 * Most `incomplete` colour-contrast nodes each route may report, per scheme.
 *
 * This is the assertion that closes the hole the audit found (tests-1): only `violations` fail this
 * gate, exactly as Lighthouse scores it, so the hero island's alpha-dimmed accent text ships green
 * although it misses AA. It is `incomplete` — axe cannot resolve the background behind a
 * `backdrop-filter` over a gradient, and answers with messageKey `bgGradient` — and `incomplete` was
 * simply not counted. On `/` at rest that is 114 nodes in light and 113 in dark against 103 passing:
 * more than half the at-rest text on the page was unmeasured.
 *
 * Turning those into failures is not this task's to do — the colours are #47's, and
 * `e2e/hero-contrast.spec.ts` decides them by computed style, which is the only instrument that can.
 * What this budget does is stop the undecidable region *growing*: a new blurred panel or a new gradient
 * behind text pushes a route over its number and fails here, so the unmeasured surface can only shrink.
 * #47's fix should let several of these drop.
 *
 * Measured on 2026-09-12, and this is the whole recorded baseline:
 *
 *   /       light 112   dark 111-112   the hero island, `backdrop-filter: blur(28px)` over a gradient
 *   /work   light  55   dark  55       the archive cards, `backdrop-blur-sm` (work/page.tsx:51)
 *   every other route: 0 in both schemes
 *
 * Re-measured on 2026-09-23 for #48, on production builds with the page at rest: `/` gave light
 * 112-115 and dark 112-115 over six runs a scheme, against light 111-114 and dark 112-114 on `main`
 * the same day. The node #48 added is the hero's line naming who the site is about, which was
 * sr-only and is now visible text on the island; `e2e/hero-contrast.spec.ts` measures its colour.
 *
 * Every route but `/` and `/work` has a budget of **zero**, which is the strongest form this can
 * take: on those pages axe decides every text node, and the first blurred panel or gradient put
 * behind text fails here. The two that are not zero are the two surfaces the audit already found,
 * and between them they account for every undecidable node on the site — 167 of them, against 103
 * and 8 decided.
 *
 * `/` gets a margin of a few nodes and the others do not. The reason this comment gave until #180 was
 * wrong: the tmux chrome's tab labels, pane titles and status lines are static, and its clock changes
 * its text, never its node count. The count varied because of the tmux background's log stream. Its
 * five panes start after an idle callback plus up to 2 s, then each adds a line about every 400-850
 * ms and never settles, and axe answers every slot holding text with `incomplete` (`bgOverlap`: the
 * background sits under the hero island). So the count was a constant plus however many lines had
 * streamed when axe collected its nodes: 111 and 112 on 2026-09-12, before #48 added a node (above),
 * 119 and 120 in the runs that failed, CI's among them, and 128-140 after an extra 3 s. The at-rest
 * pass on `/` now leaves the stream out (`TMUX_LOG_STREAM`, below). Without it the count measured 112
 * in both schemes, six production-build runs a scheme on 2026-09-30, the same 112 nodes every run.
 * The margin over that, six nodes to the budget of 118, stays by the owner's decision on #180 of
 * 2026-09-30 until #47's slices 47c and 47e, #49's 49d and #58's 58a have all landed, so that none of
 * them has to raise a budget; a pull request of its own then lowers it to the re-measured constant.
 * `/work` and the zeroes are static and were identical across every run. Never widen a margin to
 * quieten a failure: read the nodes the message names first, because a genuinely new blurred surface
 * looks exactly like this.
 *
 * The positive control at the bottom of this file proves the comparison can fail at all.
 */
const INCOMPLETE_CONTRAST_BUDGET: Record<string, { light: number; dark: number }> = {
  // Every published post (#61, 61b), first, so that an entry written below for one post wins over
  // this one: plain text on the page background, no blur or gradient behind it, so zero.
  // Re-measure with the floor above when the first post lands.
  ...Object.fromEntries(POST_ROUTES.map((route) => [route, { light: 0, dark: 0 }])),
  '/': { light: 118, dark: 118 },
  '/about': { light: 0, dark: 0 },
  // 55 until #58 dropped /work's "0 / Left Unfinished" stat, two nodes over the grid; 53 measured.
  '/work': { light: 53, dark: 53 },
  '/skills': { light: 0, dark: 0 },
  '/blog': { light: 0, dark: 0 },
  '/contact': { light: 0, dark: 0 },
  '/privacy': { light: 0, dark: 0 },
  '/work/self-healing-agent': { light: 0, dark: 0 },
  '/work/enterprise-b2b-platform': { light: 0, dark: 0 },
  '/work/nx-remote-cache': { light: 0, dark: 0 },
  '/no-such-page': { light: 0, dark: 0 },
};

/**
 * The tmux background's log stream on `/` (`TMUX_LOG_STREAM` in `support/tmux-log-stream.ts`): the
 * slot container in each of its five panes, which the at-rest pass on `/` excludes from the audit.
 *
 * Its node count is a clock reading, not a property of the page: the panes write a line into their
 * slots about every 400-850 ms for as long as the page is open, and axe cannot decide any slot that
 * holds text. What leaves the audit is pure decoration, which WCAG 1.4.3 exempts from contrast; that
 * it sits under `aria-hidden` is part of the evidence, not the exemption, since `aria-hidden` alone
 * exempts nothing (see the top of this file). The tab bar, the pane titles and status bars, the
 * clock and the hero island stay audited. Two alternatives were measured on #180 and refused.
 * Excluding the whole background stops auditing static chrome that is already deterministic.
 * Pausing the clock, as `no-js-text.spec.ts` does, freezes the stream but breaks this pass:
 * `expectGsapLoaded` never sees its mark, axe's own timers never fire, and the story's closing panel
 * rests visible instead of transparent.
 *
 * axe's `exclude` takes the containers out of every rule, not only colour contrast. What makes that
 * safe is `tmuxLogStreamProblems`: it admits only plain `div`s holding text, which no rule in the set
 * but colour contrast has anything to examine. This function is the one way this file uses the
 * selector, and it runs that check before and after the audit.
 *
 * The at-rest audit of `/`, with the log stream left out once `tmuxLogStreamProblems` has found
 * nothing wrong with it, and checked again afterwards: axe runs for seconds while the panes keep
 * writing and resizing, so what it left out must still be decoration when it has finished.
 */
async function auditExcludingTmuxLogStream(page: Page) {
  // Until a pane's first line its slots hold a no-break space: wait for real output, so that the
  // check reads what the audit will leave out rather than empty slots. The panes start on an idle
  // callback, which a busy main thread defers: under `next dev` on a loaded machine two runs in five
  // outlasted the 5 s default with two and four panes streaming, so the wait has a bound of its own.
  await expect
    .poll(
      () =>
        page
          .locator(TMUX_LOG_STREAM)
          .evaluateAll(
            (containers) =>
              containers.filter((container) =>
                [...container.children].some((slot) => slot.textContent?.trim()),
              ).length,
          ),
      {
        message:
          `the five ${TMUX_LOG_STREAM} containers should each hold a streamed line before the ` +
          'audit: fewer means a container is missing or its pane never started streaming',
        timeout: 30_000,
      },
    )
    .toBe(5);
  const why =
    `the at-rest pass on / excludes ${TMUX_LOG_STREAM} as decoration, so it must match only the ` +
    'log-stream slots under aria-hidden: whatever else sits there goes unaudited';
  expect(await tmuxLogStreamProblems(page), `${why} (before the audit)`).toEqual([]);
  const excluded = [TMUX_LOG_STREAM];
  const results = await audit(page, excluded);
  expect(await tmuxLogStreamProblems(page), `${why} (after the audit)`).toEqual([]);
  return { results, excluded };
}

const colorSchemes = ['light', 'dark'] as const;

/**
 * The routes that serve a data table (#58), with the axe table rules each must pass on at least one
 * node, derived from `TABLES`, so a route that gains a table gains these checks with it (and
 * `seo-surface.spec.ts` fails a route that serves a table `TABLES` does not list). Every table rule
 * must also have run there, which is what proves it was selected: `td-has-header` and
 * `table-fake-caption` are switched on in the shared options, and `th-has-data-cells` comes in with
 * the `wcag2a` tag. `td-has-header` applies only to a table of at least three rows by three columns
 * (axe's `data-table-large-matches`), so it can pass only where the career timeline and the toolkit
 * are; a case study's tech stack, two columns wide, leaves it inapplicable.
 */
const TABLE_RULES = ['td-has-header', 'th-has-data-cells', 'table-fake-caption'] as const;
const TABLE_RULES_PASSING: Record<string, readonly (typeof TABLE_RULES)[number][]> =
  Object.fromEntries(
    Object.entries(TABLES).map(([route, tables]) => [
      route,
      tables.some(({ columns, rows }) => columns.length >= 3 && rows.length >= 3)
        ? TABLE_RULES
        : TABLE_RULES.filter((rule) => rule !== 'td-has-header'),
    ]),
  );

/**
 * Walks the page to the bottom so every phase has been through the viewport. Two animation frames
 * per step let React commit before the next one moves.
 *
 * Stepping is not what makes this work today. The sections are server-rendered and stay in the
 * document, so nothing has to be brought into being by scrolling: what the walk changes is
 * `opacity`, since axe skips a fully transparent element and every phase starts its reveal at 0.
 * Under `reduce` each phase renders its finished state on mount (ADR 0009) and no `ScrollTrigger`
 * is created, so a single jump to the bottom would measure the same nodes. The walk is kept
 * because it is the only form that would also drive the `ScrollTrigger`s if a `no-preference`
 * pass is ever added, and because a page that cannot scroll makes it throw loudly.
 *
 * This used to describe `DeferredSection`, a hydration gate that kept each section out of the
 * document until it approached the viewport. PR #22 removed it; the sections have been in the DOM
 * from the first byte since.
 *
 * `behavior: 'instant'` matters: the two-argument `scrollTo(x, y)` inherits any CSS
 * `scroll-behavior`, and under `smooth` each step would animate for hundreds of milliseconds while
 * this loop advanced every 32 ms, so the page would still be near the top when the audit ran and
 * the test would pass having measured nothing. Nothing sets `scroll-behavior` today; this keeps it
 * from mattering if something does.
 */
async function scrollThroughStory(page: Page) {
  await page.evaluate(async () => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    // A step of 0 (a viewport that never applied) would spin here until the test budget ran out
    // with nothing to show for it, and a page that cannot scroll means the story did not render.
    const step = Math.max(1, Math.round(window.innerHeight * 0.75));
    if (bottom() <= 0)
      throw new Error('the page is not taller than the viewport: no story to walk');
    // The cap turns a page that grows as fast as it is scrolled into a named failure instead of a
    // silent timeout. The home page is about nine viewports; 200 steps is an order of magnitude
    // more than it needs.
    let steps = 0;
    for (let y = 0; y <= bottom(); y += step) {
      if (++steps > 200)
        throw new Error('scrollThroughStory did not reach the bottom in 200 steps');
      window.scrollTo({ top: y, behavior: 'instant' });
      await nextFrame();
    }
    window.scrollTo({ top: bottom(), behavior: 'instant' });
    await nextFrame();
    if (window.scrollY <= 0)
      throw new Error('the page did not scroll: is the scroller not the document?');
  });
}

/**
 * Navigates and proves the page is the one we mean and is ready to audit. `reducedMotion` is passed
 * through for the scrolled pass; the at-rest pass leaves it at Playwright's default of `no-preference`.
 */
async function openPage(
  page: Page,
  path: string,
  colorScheme: (typeof colorSchemes)[number],
  // Explicit rather than `{}`: an empty spread means "leave as configured", so a `reducedMotion`
  // added to playwright.config.ts later would silently change what the at-rest pass measures.
  media: { reducedMotion: 'reduce' | 'no-preference' } = { reducedMotion: 'no-preference' },
) {
  // Before the navigation: the theme init script in <head> reads prefers-color-scheme for the
  // first paint, so the page is audited in the scheme a visitor with that preference sees.
  await page.emulateMedia({ colorScheme, ...media });
  // networkidle has no limit of its own; bound it so a stalled request fails as a navigation
  // error naming the URL rather than as the test budget.
  const response = await page.goto(path, { waitUntil: 'networkidle', timeout: 30_000 });
  // A renamed slug or a rendering error would serve the not-found or the error page, whose
  // title also matches below; the status and the path catch that. The title is left as a
  // smoke check that this application rendered at all (ADR 0014). The 404 route in the list
  // answers 404 by design, which is why the expected status comes from the shared module rather
  // than being hard-coded to 200.
  expect(response?.status(), `${path} should answer ${expectedStatus(path)}`).toBe(
    expectedStatus(path),
  );
  expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path);
  await expect(page).toHaveTitle(/Milos Cvetkovic/);
  await expectHydrated(page);
  // On `/` the story's timelines, and the `opacity: 0` from-states that decide what axe skips at
  // rest, are built when GSAP arrives, on the visitor's first intent (load-gsap.ts). The helper
  // sends that intent and waits, so this pass measures the page as a visitor who has started to
  // scroll has it; `gsap-lazy.spec.ts` audits the page before GSAP.
  if (path === '/') await expectGsapLoaded(page);
  // Playwright ignores unknown emulation options silently: prove the scheme reached the page.
  await expect(page.locator('html')).toContainClass(colorScheme);
  // axe skips what is not on screen, so a page that rendered nothing would be green: require
  // the main heading before auditing. Whether the rest of the at-rest content is visible is
  // the hero spec's concern.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

// The shared config records a trace only on the first retry, and this file never retries, so a
// failing audit kept no trace at all. Playwright only accepts this option at file level, as in
// console-clean.spec.ts.
test.use({ trace: 'retain-on-failure' });

test.describe('Accessibility', () => {
  // No retries: a retry would turn an intermittent violation, say text sampled mid-animation, into
  // a "flaky" pass, which is the one outcome a gate must not produce. The budget covers the
  // navigation, the hydration wait (30 s) and an axe run over the whole home page on a slow CI runner.
  test.describe.configure({ retries: 0, timeout: 90_000 });

  for (const colorScheme of colorSchemes) {
    for (const path of pages) {
      test(`${path} has no axe violations at rest in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await openPage(page, path, colorScheme);
        // `/` only, and only this pass: the log stream is guarded and left out (TMUX_LOG_STREAM).
        const { results, excluded } =
          path === '/'
            ? await auditExcludingTmuxLogStream(page)
            : { results: await audit(page), excluded: [] };
        await test.info().attach('axe-results', {
          body: JSON.stringify(
            { excluded, violations: results.violations, incomplete: results.incomplete },
            null,
            2,
          ),
          contentType: 'application/json',
        });
        expect(
          describeViolations(results.violations),
          `${path} in the ${colorScheme} theme must have no axe violations. For a colour contrast ` +
            'failure, read the token roles in ' +
            'docs/adr/0011-colour-roles-on-scoped-surfaces.md first.',
        ).toEqual([]);
        // Prove the options took effect and that real content was measured: a rule that is switched
        // off appears in none of the four result lists, axe only logs an unknown tag instead of
        // throwing, and a page with no text would leave `color-contrast` inapplicable. Each sentinel
        // covers one part of the options. `document-title` is selected by the `wcag2a` tag alone,
        // `color-contrast` by `wcag2aa` alone, and `label-content-name-mismatch` only by the rules
        // map; that one has been inapplicable on both pages since the cards' accessible names became
        // their visible text, so presence in the results is its only proof.
        expect(
          passingNodes(results, 'color-contrast'),
          `${path} at rest measured far fewer colour-contrast nodes than it should. Content that ` +
            'stopped being rendered, or became transparent, is no longer being audited: find what ' +
            'left the page before adjusting this floor.',
        ).toBeGreaterThan(AT_REST_CONTRAST_FLOOR[path]);
        // The undecidable region may shrink but never grow. See INCOMPLETE_CONTRAST_BUDGET above for
        // why this is a budget rather than a failure, and the positive control at the bottom of this
        // file for the proof that the comparison can fail at all.
        expect(
          incompleteNodes(results, 'color-contrast'),
          `${path} in the ${colorScheme} theme has more colour-contrast nodes axe cannot decide ` +
            'than its recorded budget. Something was added whose background axe cannot resolve — ' +
            'usually text over a gradient, or inside an element with a backdrop-filter. Those ' +
            'nodes are unmeasured, not passing: give the text a resolvable background instead of ' +
            `raising the budget.\nFirst few:\n${describeIncomplete(results, 'color-contrast')}`,
        ).toBeLessThanOrEqual(INCOMPLETE_CONTRAST_BUDGET[path][colorScheme]);
        expect(ruleIdsThatRan(results)).toEqual(
          expect.arrayContaining(['document-title', 'label-content-name-mismatch']),
        );
        const tableRules = TABLE_RULES_PASSING[path];
        if (tableRules) {
          expect(ruleIdsThatRan(results)).toEqual(expect.arrayContaining([...TABLE_RULES]));
          for (const rule of tableRules) {
            expect(
              passingNodes(results, rule),
              `${path} serves a data table, so ${rule} must pass on it rather than find nothing`,
            ).toBeGreaterThan(0);
          }
        }
      });
    }
  }

  /**
   * `/` audited with a header link hovered and with one focused.
   *
   * Every other pass measures the page at rest, and a hover colour is a colour like any other. Before
   * this, no hovered or focused state was audited anywhere in the suite: the only `hover()` calls were
   * in `featured-work.spec.ts`, which asserts `data-active` rather than colour.
   *
   * The subject is a header nav link, not a Featured Work card, and that was settled by measurement
   * rather than by preference. Two things rule the card out:
   *
   * - An audit scoped to the Featured Work section decides **nothing**. Measured on 2026-09-12: 0
   *   passing colour-contrast nodes against 45 `incomplete`. Its cards are `backdrop-blur-md`
   *   (`featured-work.tsx:67`), so axe cannot resolve what is behind any of their text — the same
   *   mechanism as the hero island's, and the reason a scoped pass there would be a gate that cannot
   *   fail. The card's hover behaviour is covered instead by `featured-work.spec.ts` (`data-active`, the
   *   diagram) and its colours by `e2e/hero-contrast.spec.ts` (computed style).
   * - Scrolling the section into view to hover it puts the sticky header over the architecture-diagram
   *   background. The header is `bg-[var(--background)]/80` with `backdrop-blur-sm`, so axe composites
   *   `--muted` (#636363) against #cbcbcd and reports every desktop nav link at 3.7:1. That is a real
   *   violation, found by writing this pass, and it belongs to no row of this task's manifest: it
   *   depends only on the scroll position and appears at neither offset the at-rest pass (top) or the
   *   scrolled pass (bottom) samples. It is reported in this task's pull request as an out-of-scope
   *   discovery rather than quietly gated or quietly excluded here.
   *
   * So: whole document, at scroll 0, where the header overlaps only the hero. A nav link's hover moves
   * it from `--muted` to `--foreground` and its focus draws the focus-visible ring, both of which axe
   * decides. Under `reduce`, for the same reason the scrolled pass is — every phase renders its finished
   * state on mount, so nothing can be sampled mid-tween, and the audit sees the whole story: 429 nodes
   * measured against the at-rest pass's 103.
   */
  for (const state of ['hovered', 'focused'] as const) {
    test(`/ has no axe violations with a header link ${state}`, async ({ page }) => {
      await openPage(page, '/', 'light', { reducedMotion: 'reduce' });

      const link = page.getByRole('banner').getByRole('link', { name: 'About' });
      await expect(link).toBeVisible();
      if (state === 'hovered') await link.hover();
      else await link.focus();
      // `transition-colors` on the link; settle so axe does not sample a colour half way between the
      // two states, which is neither the resting colour nor the hover one.
      await page.waitForTimeout(600);
      // Prove the state applied: Playwright reports focus directly, and a hover that landed on nothing
      // would leave the page exactly as the at-rest pass already measures it.
      if (state === 'focused') await expect(link).toBeFocused();
      else await expect(link).toHaveCSS('color', 'rgb(23, 23, 23)');

      const results = await audit(page);
      await test.info().attach('axe-results', {
        body: JSON.stringify(
          { violations: results.violations, incomplete: results.incomplete },
          null,
          2,
        ),
        contentType: 'application/json',
      });
      expect(
        describeViolations(results.violations),
        `/ with a header link ${state} must have no axe violations. A hover or focus colour is a ` +
          'colour like any other: read the token roles in ' +
          'docs/adr/0011-colour-roles-on-scoped-surfaces.md.',
      ).toEqual([]);
      // Real content was measured, so a green run is not a page that failed to render. Measured 429 on
      // 2026-09-12; the floor matches the scrolled pass's, because `reduce` renders the same content.
      expect(
        passingNodes(results, 'color-contrast'),
        `the ${state} pass measured far fewer nodes than it should: content stopped being rendered ` +
          'or became transparent. Find what left the page before adjusting this floor.',
      ).toBeGreaterThan(350);
    });
  }

  test.describe('the whole story', () => {
    // A scrolled `/` gives axe several times as many text nodes to measure as the at-rest pass
    // does; both counts are recorded where their floors are set, at AT_REST_CONTRAST_FLOOR and in
    // the test below. It takes 2.7 s on a CI runner and 4.5 to 6.4 s locally, so 120 s is roughly
    // twenty times the measured cost. It is deliberately not larger: the e2e job has 20 minutes, of
    // which the build and the browser install take about a third, and two of these tests hanging to
    // a five-minute budget would end the job before the report is uploaded. Still no retries: the
    // reduced-motion path makes the result deterministic, so a failure here is real and a retry
    // could only hide it.
    test.describe.configure({ retries: 0, timeout: 120_000 });

    for (const colorScheme of colorSchemes) {
      test(`/ has no axe violations after the whole story in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await openPage(page, '/', colorScheme, { reducedMotion: 'reduce' });
        await scrollThroughStory(page);
        // Content the at-rest pass never reaches, one element per status token: the deployment
        // panel (--status-ok), the commit streak's count (--status-warn) and the healing log's
        // error line (--status-err). Each is false in every intermediate state, which is the point:
        // `usePrefersReducedMotion` returns `false` during hydration, so a phase can briefly render
        // its animated first state even under `reduce`. In that window the streak's own "COMMIT
        // STREAK" label is already on screen while its count still reads "x0", so the label would
        // wave through a page that had not settled and the count will not. `.first()` on each:
        // these are substring matches, and an ancestor containing the phrase would otherwise make
        // the locator ambiguous and fail in strict mode for a non-accessibility reason.
        await expect(page.getByText('DEPLOYMENT SUCCESSFUL').first()).toBeVisible();
        await expect(page.getByText('x12').first()).toBeVisible();
        await expect(page.getByText('NullPointerException').first()).toBeVisible();

        const results = await audit(page);
        await test.info().attach('axe-results', {
          body: JSON.stringify(
            { violations: results.violations, incomplete: results.incomplete },
            null,
            2,
          ),
          contentType: 'application/json',
        });
        expect(
          describeViolations(results.violations),
          `/ scrolled in the ${colorScheme} theme must have no axe violations. For a colour ` +
            'contrast failure in a hero phase, read the status token roles in ' +
            'docs/adr/0010-status-colour-tokens.md first: a palette class such as `text-green-400` ' +
            'is 1.7:1 on the light background.',
        ).toEqual([]);
        // The real proof that this pass measured the story and not just the shell. Visibility
        // assertions cannot give it: every phase is server-rendered, so its markup is in the DOM
        // and "visible" to Playwright even unhydrated and fully transparent, while axe skips
        // anything at `opacity: 0`. Node counts do give it. Measured against the production build
        // on 2026-09-10: 103 at rest, 425 scrolled, identical in both colour schemes. The floor was
        // 200, which is under half of what the page measures: five of its nine sections could stop
        // being revealed and the pass would still be green. 350 keeps the same headroom for copy
        // changes that the at-rest floors have, and still fails loudly if the walk stops working.
        expect(
          passingNodes(results, 'color-contrast'),
          'the scrolled pass measured far fewer colour-contrast nodes than it should: either the ' +
            'walk stopped reaching the bottom, or content stopped being revealed. Find what left ' +
            'the page before adjusting this floor.',
        ).toBeGreaterThan(350);
      });
    }
  });

  test('positive control: the rule set reports color-contrast and label-content-name-mismatch', async ({
    page,
  }) => {
    // No server involved: a page that reproduces both of the original Lighthouse findings must
    // fail, or a green run above proves nothing. The paragraph is the old accent (#8b5cf6) as text
    // on the light background, 4.1:1; the button's visible text is missing from its aria-label.
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head><title>Control</title></head>
        <body>
          <main>
            <h1>Control</h1>
            <p style="color: #8b5cf6; background: #fafafa">The old accent as text</p>
            <button aria-label="Open the archive">Show all work</button>
          </main>
        </body>
      </html>`);
    const results = await audit(page);
    expect(results.violations.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['color-contrast', 'label-content-name-mismatch']),
    );
  });

  test('positive control: the incomplete-contrast budget fails when the count exceeds it', async ({
    page,
  }) => {
    // The budget above is the whole answer to tests-1, so it needs its own control: a budget that
    // could never be exceeded would be a comment. This is the shape that makes axe answer
    // `incomplete` rather than pass or fail — text over a background gradient, which axe cannot
    // resolve to a single colour, reported with messageKey `bgGradient`. It is the same mechanism as
    // the hero island's, reproduced without a server.
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head><title>Control</title></head>
        <body>
          <main>
            <h1>Control</h1>
            <div style="background: linear-gradient(90deg, #000, #fff); padding: 1rem">
              <p style="color: #888">Text axe cannot decide</p>
              <p style="color: #777">Nor this one</p>
              <p style="color: #666">Nor this one either</p>
            </div>
          </main>
        </body>
      </html>`);

    const results = await audit(page);
    const undecided = incompleteNodes(results, 'color-contrast');
    // First: axe really does report these as undecided rather than as passes or violations. If this
    // ever stops being true, every budget above becomes a no-op and this is where it surfaces.
    expect(
      undecided,
      'axe no longer reports text on a gradient as incomplete: the per-route budgets above are ' +
        'measuring nothing. Check what changed in axe-core before touching them.',
    ).toBeGreaterThan(0);

    // Then: the comparison the at-rest pass makes fails on a count over budget, and passes under it.
    // Written as the assertion itself, inverted, rather than described in a comment.
    const pretendBudget = undecided - 1;
    expect(() => expect(undecided, 'over budget').toBeLessThanOrEqual(pretendBudget)).toThrow();
    expect(undecided).toBeLessThanOrEqual(undecided);
  });

  test('negative control: the log-stream check fails on anything but the stream', async ({
    page,
  }) => {
    // The at-rest pass on `/` leaves TMUX_LOG_STREAM unaudited on the strength of
    // tmuxLogStreamProblems, so that check needs a control of its own: one that could never fail
    // would exclude whatever came to sit there. No server: five panes shaped as AnimatedPane renders
    // them, a clean copy first, then one break at a time.
    const slot = '<div style="height: 23.1px; overflow: hidden; color: #888">[ok] line</div>';
    const pane =
      '<div data-tmux-pane=""><div>' +
      `<div data-tmux-slots="" class="absolute" style="font-size: 14px">${slot}${slot}</div>` +
      '</div></div>';
    const content = `<!doctype html>
      <html lang="en">
        <head><title>Control</title></head>
        <body>
          <main>
            <h1>Control</h1>
            <div id="background" aria-hidden="true">${pane.repeat(5)}</div>
            <div id="elsewhere" aria-hidden="true"><div>not a pane</div></div>
          </main>
        </body>
      </html>`;
    await page.setContent(content);
    expect(await tmuxLogStreamProblems(page), 'the clean copy must pass').toEqual([]);

    const breaks: Record<string, () => void> = {
      'a link beside the slots': () => {
        const link = Object.assign(document.createElement('a'), { href: '/', textContent: 'x' });
        document.querySelectorAll('[data-tmux-slots]')[1].append(link);
      },
      'a button inside a slot': () => {
        const button = Object.assign(document.createElement('button'), { textContent: 'x' });
        document.querySelector('[data-tmux-slots] > div')!.append(button);
      },
      'loose text in a container': () => {
        document.querySelector('[data-tmux-slots]')!.append('loose text');
      },
      'a line with no pinned height, as StaticPane renders': () => {
        document.querySelector<HTMLElement>('[data-tmux-slots] > div')!.style.height = '';
      },
      'a container that became a section': () => {
        const container = document.querySelector('[data-tmux-slots]')!;
        const section = document.createElement('section');
        section.setAttribute('data-tmux-slots', '');
        section.append(...container.childNodes);
        container.replaceWith(section);
      },
      'a container given a role': () => {
        document.querySelector('[data-tmux-slots]')!.setAttribute('role', 'region');
      },
      'a container given a tabindex': () => {
        document.querySelector('[data-tmux-slots]')!.setAttribute('tabindex', '0');
      },
      'a pane that lost the attribute': () => {
        document.querySelectorAll('[data-tmux-slots]')[2].removeAttribute('data-tmux-slots');
      },
      'a sixth match outside the panes': () => {
        document.querySelector('#elsewhere > div')!.setAttribute('data-tmux-slots', '');
      },
      'the attribute moved out of a pane, five matches still': () => {
        document.querySelectorAll('[data-tmux-slots]')[2].removeAttribute('data-tmux-slots');
        document.querySelector('#elsewhere > div')!.setAttribute('data-tmux-slots', '');
      },
      'the background no longer aria-hidden': () => {
        document.querySelector('#background')!.removeAttribute('aria-hidden');
      },
    };
    for (const [name, breakIt] of Object.entries(breaks)) {
      await test.step(name, async () => {
        await page.setContent(content);
        await page.evaluate(breakIt);
        expect(await tmuxLogStreamProblems(page), `${name} must fail the check`).not.toEqual([]);
      });
    }
  });
});
