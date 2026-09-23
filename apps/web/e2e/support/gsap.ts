import { errors, expect, type Page } from '@playwright/test';
import {
  GSAP_FAILED_MARK,
  GSAP_LOADED_MARK,
  IDLE_TIMEOUT_MS,
  LOAD_TIMEOUT_MS,
} from '../../src/components/animated-hero/load-gsap';

/**
 * The loader's own worst case, an idle wait at its cap and then a request that runs into its
 * deadline, plus a margin: by then it has set one of its two marks. Kept well inside the default
 * 30 s test timeout, so that a load that never settles fails here, with the message below, rather
 * than as a bare test timeout.
 */
const GSAP_SETTLE_TIMEOUT_MS = IDLE_TIMEOUT_MS + LOAD_TIMEOUT_MS + 2_000;

/**
 * The one place that knows how a spec tells GSAP has arrived on `/`.
 *
 * GSAP is not in the home page's initial chunk. `src/components/animated-hero/load-gsap.ts` fetches
 * it once the browser is idle after hydration, so there is a window, measured at 27-523 ms after
 * `#hydration-marker` flips on desktop Chromium, in which the page is hydrated and interactive but
 * the story has built no timeline yet. Nothing is wrong in that window: every section shows its
 * server-rendered state, and a hover that lands in it and stays plays once GSAP is in. But a spec
 * that measures what GSAP does, a from-state at rest or a hover tween inside a sampling window, has
 * to measure after it, or it measures the server-rendered page instead and passes or fails on
 * timing.
 *
 * The loader sets the User Timing mark `GSAP_LOADED_MARK` before any callback waiting for GSAP
 * runs, and those callbacks all run before the browser's next task, so once the mark is visible
 * here every phase has built its timeline and every early hover has started. A load that fails
 * sets `GSAP_FAILED_MARK` instead, and this fails at once, saying so.
 *
 * Call it after `expectHydrated` (or `gotoHydrated`) on `/`. The marks belong to the document, so
 * after a soft navigation away from `/` they are still there, and on a document that never
 * rendered the story this fails.
 */
export async function expectGsapLoaded(page: Page): Promise<void> {
  let outcome: 'loaded' | 'failed' | 'pending';
  try {
    const handle = await page.waitForFunction(
      ([loaded, failed]) => {
        if (performance.getEntriesByName(loaded, 'mark').length > 0) return 'loaded';
        if (performance.getEntriesByName(failed, 'mark').length > 0) return 'failed';
        return false;
      },
      [GSAP_LOADED_MARK, GSAP_FAILED_MARK] as const,
      { timeout: GSAP_SETTLE_TIMEOUT_MS },
    );
    outcome = (await handle.jsonValue()) as 'loaded' | 'failed';
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error;
    outcome = 'pending';
  }
  expect(
    outcome,
    outcome === 'failed'
      ? `GSAP failed to load on this page ("${GSAP_FAILED_MARK}"): the story fell back to its ` +
          'finished state, so nothing GSAP does can be measured.'
      : `GSAP never loaded on this page within ${GSAP_SETTLE_TIMEOUT_MS} ms: neither ` +
          `"${GSAP_LOADED_MARK}" nor "${GSAP_FAILED_MARK}". Only a document that rendered the ` +
          'story on / loads it.',
  ).toBe('loaded');
}
