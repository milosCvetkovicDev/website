import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility regression gate: `/` and `/work/self-healing-agent` must produce zero axe-core
 * violations in both colour schemes, at rest.
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
 * At rest only, no scrolling, at the project's desktop viewport: the scroll-triggered hero phases
 * still use hard-coded palette colours (`text-green-400`, `text-yellow-400`) that fail in the light
 * theme once revealed. They sit at opacity 0 until their trigger fires, so an unscrolled audit
 * skips them. That follow-up is tracked in ADR 0008 (Consequences); once it lands, extend this
 * spec to audit again after scrolling to the bottom, and consider a mobile viewport, which is what
 * Lighthouse emulates by default.
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
        // Before the navigation: the theme init script in <head> reads prefers-color-scheme for the
        // first paint, so the page is audited in the scheme a visitor with that preference sees.
        await page.emulateMedia({ colorScheme });
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
        await expect(page.getByText('System Boot', { exact: true })).toBeHidden({
          timeout: 30_000,
        });
        // Playwright ignores unknown emulation options silently: prove the scheme reached the page.
        await expect(page.locator('html')).toContainClass(colorScheme);
        // axe skips what is not on screen, so a page that rendered nothing would be green: require
        // the main heading before auditing. Whether the rest of the at-rest content is visible is
        // the hero spec's concern.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

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
