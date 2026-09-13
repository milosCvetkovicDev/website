import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * The axe configuration and result readers the accessibility gates share.
 *
 * Extracted from `e2e/accessibility.spec.ts` when the gate grew a second spec file: the phone-project
 * pass lives in `e2e/mobile/accessibility.spec.ts`, because only `e2e/mobile/` is selected by the two
 * phone projects (see `MOBILE_SPECS` in `playwright.config.ts`). Importing one spec file from another
 * would register its tests twice, so the shared pieces have to live outside both — and the rule map
 * below is the last thing in this repository that should exist in two copies, since a map that drifts
 * means the two gates are enforcing different standards under one name.
 *
 * Types come from `AxeBuilder`, not from `axe-core`, which is not resolvable from `apps/web`.
 */

export type AxeRunOptions = Parameters<AxeBuilder['options']>[0];
export type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
export type Violation = AxeResults['violations'][number];

// https://github.com/GoogleChrome/lighthouse/blob/v13.4.1/core/gather/gatherers/accessibility.js
// Every id below exists in axe-core 4.13.0 (checked with `axe.getRules()`). axe throws
// "unknown rule" for an id it does not know, which would fail every audit and the control at once,
// so re-check the map after an axe-core or Lighthouse upgrade. The `enabled: false` entries are
// load-bearing too: a rule the tags select runs regardless of its default flag, so dropping one
// would switch a deprecated rule such as `audio-caption` back on.
export const LIGHTHOUSE_AXE_OPTIONS: AxeRunOptions = {
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

export const audit = (page: Page) =>
  new AxeBuilder({ page })
    // AxeBuilder keeps the reference and its other setters write into it: never hand it the constant.
    .options(structuredClone(LIGHTHOUSE_AXE_OPTIONS))
    // The dev server's tools indicator, a custom element with a shadow root that never ships.
    // Without this a local run against `next dev` audits a different DOM from CI.
    .exclude('nextjs-portal')
    .analyze();

export const passingNodes = (results: AxeResults, ruleId: string) =>
  results.passes.find(({ id }) => id === ruleId)?.nodes.length ?? 0;

/**
 * Nodes axe could not decide for one rule. For `color-contrast` these are almost all
 * "background color could not be determined", which is what a `backdrop-filter` over a gradient
 * produces. They are unmeasured, not passing — the distinction the gate's budget exists to hold.
 */
export const incompleteNodes = (results: AxeResults, ruleId: string) =>
  results.incomplete.find(({ id }) => id === ruleId)?.nodes.length ?? 0;

export const ruleIdsThatRan = ({ passes, violations, incomplete, inapplicable }: AxeResults) =>
  [...passes, ...violations, ...incomplete, ...inapplicable].map(({ id }) => id);

/** One entry per violated rule: the rule, then every offending node with axe's own explanation. */
export function describeViolations(violations: Violation[]): string[] {
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

/** A few undecidable nodes named, so a budget failure says what was added and not only how many. */
export const describeIncomplete = (results: AxeResults, ruleId: string) =>
  (results.incomplete.find(({ id }) => id === ruleId)?.nodes ?? [])
    .slice(0, 5)
    .map(({ target, html }) => `  ${target.flat().join(' >> ')}\n    ${html.slice(0, 120)}`)
    .join('\n');
