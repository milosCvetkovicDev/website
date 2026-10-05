/**
 * Launch flags for every Chromium this repository's Playwright starts: the Chromium projects in
 * `playwright.config.ts` and `playwright.live.config.ts`, and any spec that launches a browser of
 * its own, as the Lighthouse spec does (Playwright merges a project's launch options into such a
 * call shallowly, so the call's own `args` replace these unless it spreads them back in).
 *
 * On the Linux CI runner, Chromium 153 now and then stops for good right after a burst of work in
 * the reduced-motion walk on `/`: every Chromium process sits idle, the renderer answers no
 * DevTools command, and the test times out (#223). With V8's garbage collector kept on the main
 * thread, none of 1,052 walks hung, against 33 of 1,688 on the headless shell without the flag
 * (ADR 0032). The flag is V8's, so the WebKit project gets none.
 *
 * Every V8 flag goes into the one `--js-flags` entry: Chromium keeps only the last of a repeated
 * switch. `src/test/playwright-config.test.ts` checks that every Chromium project and every spec
 * that launches Chromium itself pass these, and pins the Chromium build they were measured on.
 */
export const CHROMIUM_LAUNCH_ARGS: readonly string[] = ['--js-flags=--single-threaded-gc'];
