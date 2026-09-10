import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility regression gate: `/` and `/work/self-healing-agent` must produce zero axe-core
 * violations in both colour schemes, at rest, and `/` again after the whole story has been
 * scrolled through.
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
 * Two axe behaviours worth knowing before touching a failure (ADR 0008): `aria-hidden` does not
 * exempt an element from `color-contrast`, because axe measures what is on screen, not what a
 * screen reader gets; `opacity: 0` does, which is why GSAP reveals must start from 0 and never
 * from a partial value.
 *
 * Each page is audited twice. At rest, which is what Lighthouse scores and what the original
 * findings were about. Then, for `/`, again after scrolling the whole story.
 *
 * The second pass exists because at rest the six story sections are not in the document at all.
 * `DeferredSection` suspends each one until it approaches the viewport, so an unscrolled `/`
 * renders six empty placeholders: axe measures 30 text nodes there against 424 once the story has
 * been walked. That, not a GSAP reveal, is how the light-theme contrast failures fixed by ADR 0010
 * stayed invisible to this gate until they were found by hand. `text-green-400` on a near-white
 * page is 1.7:1, and with the class put back the at-rest pass is still green while the scrolled
 * pass fails.
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
 * Both passes run at the project's desktop viewport. A mobile viewport, which is what Lighthouse
 * emulates by default, is still not covered.
 */

type AxeRunOptions = Parameters<AxeBuilder['options']>[0];
type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type Violation = AxeResults['violations'][number];

// https://github.com/GoogleChrome/lighthouse/blob/v13.4.1/core/gather/gatherers/accessibility.js
// Every id below exists in axe-core 4.13.0 (checked with `axe.getRules()`). axe throws
// "unknown rule" for an id it does not know, which would fail every audit and the control at once,
// so re-check the map after an axe-core or Lighthouse upgrade. The `enabled: false` entries are
// load-bearing too: a rule the tags select runs regardless of its default flag, so dropping one
// would switch a deprecated rule such as `audio-caption` back on.
const LIGHTHOUSE_AXE_OPTIONS: AxeRunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  rules: {
    accesskeys: { enabled: true },
    'area-alt': { enabled: false },
    'aria-allowed-role': { enabled: true },
    'aria-braille-equivalent': { enabled: false },
    'aria-conditional-attr': { enabled: true },
    'aria-deprecated-role': { enabled: true },
    'aria-dialog-name': { enabled: true },
    'aria-prohibited-attr': { enabled: true },
    'aria-roledescription': { enabled: false },
    'aria-treeitem-name': { enabled: true },
    'aria-text': { enabled: true },
    'autocomplete-valid': { enabled: true },
    'audio-caption': { enabled: false },
    blink: { enabled: false },
    'duplicate-id': { enabled: false },
    'empty-heading': { enabled: true },
    'frame-focusable-content': { enabled: false },
    'frame-title-unique': { enabled: false },
    'heading-order': { enabled: true },
    'html-xml-lang-mismatch': { enabled: true },
    'identical-links-same-purpose': { enabled: true },
    'image-redundant-alt': { enabled: true },
    'input-button-name': { enabled: true },
    'label-content-name-mismatch': { enabled: true },
    'landmark-one-main': { enabled: true },
    'link-in-text-block': { enabled: true },
    marquee: { enabled: false },
    'meta-viewport': { enabled: true },
    'nested-interactive': { enabled: false },
    'no-autoplay-audio': { enabled: false },
    'presentation-role-conflict': { enabled: true },
    'role-img-alt': { enabled: false },
    'scrollable-region-focusable': { enabled: false },
    'select-name': { enabled: true },
    'server-side-image-map': { enabled: false },
    'skip-link': { enabled: true },
    'summary-name': { enabled: false },
    'svg-img-alt': { enabled: true },
    tabindex: { enabled: true },
    'table-duplicate-name': { enabled: true },
    'table-fake-caption': { enabled: true },
    'target-size': { enabled: true },
    'td-has-header': { enabled: true },
    'aria-tab-name': { enabled: false },
  },
};

const pages = ['/', '/work/self-healing-agent'];
const colorSchemes = ['light', 'dark'] as const;

/**
 * Walks the page to the bottom so every `DeferredSection` hydrates. Two animation frames per step
 * let React commit each section before the next one moves.
 *
 * Stepping is not what makes this work today. `DeferredSection` observes with a root margin of
 * `10000px 0px 0px 0px`, and its own comment says so: anything already scrolled past counts as
 * approached, so a single jump to the bottom hydrates the lot. Measured, not assumed: with the
 * loop replaced by that one jump this spec still audits over 400 text nodes and still fails on a
 * reintroduced palette class. The walk is kept for two reasons that outlive that margin: it bounds
 * how far the margin would have to reach if the story grew, and it is the only form that would
 * also drive the `ScrollTrigger`s if a `no-preference` pass is ever added. Under `reduce` no
 * ScrollTrigger is created at all, so today the walk's shape does not affect what is measured.
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

const audit = (page: Page) =>
  new AxeBuilder({ page })
    // AxeBuilder keeps the reference and its other setters write into it: never hand it the constant.
    .options(structuredClone(LIGHTHOUSE_AXE_OPTIONS))
    // The dev server's tools indicator, a custom element with a shadow root that never ships.
    // Without this a local run against `next dev` audits a different DOM from CI.
    .exclude('nextjs-portal')
    .analyze();

const passingNodes = (results: AxeResults, ruleId: string) =>
  results.passes.find(({ id }) => id === ruleId)?.nodes.length ?? 0;

const ruleIdsThatRan = ({ passes, violations, incomplete, inapplicable }: AxeResults) =>
  [...passes, ...violations, ...incomplete, ...inapplicable].map(({ id }) => id);

/** One entry per violated rule: the rule, then every offending node with axe's own explanation. */
function describeViolations(violations: Violation[]): string[] {
  return violations.map(({ id, impact, help, helpUrl, nodes }) =>
    [
      `${id} (${impact ?? 'unknown impact'}): ${help}. ${helpUrl}`,
      ...nodes.map(
        ({ target, html, failureSummary }) =>
          `  ${target.flat().join(' >> ')}\n    ${html}\n    ${failureSummary ?? ''}`,
      ),
    ].join('\n'),
  );
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
  // title also matches below; the status and the path catch that. The title guards against
  // reuseExistingServer attaching to another project's server on :3000.
  expect(response?.status(), `${path} should answer 200`).toBe(200);
  expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path);
  await expect(page).toHaveTitle(/Milos Cvetkovic/);
  // `/` shows a boot loader until React has hydrated and removes it 600 ms later; the audit
  // is of the page behind it. Other routes have no loader, so the locator matches nothing
  // and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  // Playwright ignores unknown emulation options silently: prove the scheme reached the page.
  await expect(page.locator('html')).toContainClass(colorScheme);
  // axe skips what is not on screen, so a page that rendered nothing would be green: require
  // the main heading before auditing. Whether the rest of the at-rest content is visible is
  // the hero spec's concern.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('Accessibility', () => {
  // No retries: a retry would turn an intermittent violation, say text sampled mid-animation, into
  // a "flaky" pass, which is the one outcome a gate must not produce. The budget covers the
  // navigation, the loader wait (30 s) and an axe run over the whole home page on a slow CI runner.
  test.describe.configure({ retries: 0, timeout: 90_000 });

  for (const colorScheme of colorSchemes) {
    for (const path of pages) {
      test(`${path} has no axe violations at rest in the ${colorScheme} theme`, async ({
        page,
      }) => {
        await openPage(page, path, colorScheme);

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
          `${path} in the ${colorScheme} theme must have no axe violations. For a colour contrast ` +
            'failure, read the token roles in docs/adr/0008-accent-colour-roles.md first.',
        ).toEqual([]);
        // Prove the options took effect and that real content was measured: a rule that is switched
        // off appears in none of the four result lists, axe only logs an unknown tag instead of
        // throwing, and a page with no text would leave `color-contrast` inapplicable. Each sentinel
        // covers one part of the options. `document-title` is selected by the `wcag2a` tag alone,
        // `color-contrast` (with at least one measured node) by `wcag2aa` alone, and
        // `label-content-name-mismatch` only by the rules map; that one has been inapplicable on
        // both pages since the cards' accessible names became their visible text, so presence in
        // the results is its only proof.
        expect(passingNodes(results, 'color-contrast')).toBeGreaterThan(0);
        expect(ruleIdsThatRan(results)).toEqual(
          expect.arrayContaining(['document-title', 'label-content-name-mismatch']),
        );
      });
    }
  }

  test.describe('the whole story', () => {
    // A scrolled `/` gives axe over 400 text nodes to measure against the at-rest pass's 30. It
    // takes 2.7 s on a CI runner and 4.5 to 6.4 s locally, so 120 s is roughly twenty times the
    // measured cost. It is deliberately not larger: the e2e job has 20 minutes, of which the build
    // and the browser install take about a third, and two of these tests hanging to a five-minute
    // budget would end the job before the report is uploaded. Still no retries: the reduced-motion
    // path makes the result deterministic, so a failure here is real and a retry could only hide it.
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
        // anything at `opacity: 0`. Node counts do give it. Measured on this page: 30 at rest,
        // 409 scrolled. A floor of 200 fails loudly if the walk ever stops working, and leaves
        // room for the copy to change.
        expect(passingNodes(results, 'color-contrast')).toBeGreaterThan(200);
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
});
