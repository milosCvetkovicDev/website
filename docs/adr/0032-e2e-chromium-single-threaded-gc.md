# 0032. Playwright's Chromium keeps V8's garbage collector on the main thread

## Status

Accepted

## Date

2026-10-05

## Context

The nightly flake hunt opened #223 for `mobile/layout-overflow.spec.ts`: `/ does not scroll sideways
at 414px under reduced motion` on `mobile-chrome` timed out after 60 s in 2 of 30 runs, inside the
`page.evaluate` that walks the page. The 375 px variant failed the same way in the CI of PR #229. On
a Mac the three `/` tests under reduced motion passed 300 runs in a row.

The cause was narrowed down on a throwaway branch whose workflow repeated a diagnostic copy of the
walk on `ubuntu-latest` (Playwright 1.63.0, Chromium 153.0.8010.12), in five separate runs of four
to seven shards, 105 to 212 walks per shard. Each walk runs in a fresh page, so a walk that stops
fails only itself. Run 1 measured the hang: 9 in 420 walks over four shards, none of them on the
shard with Chromium's tracing on.

- When a walk stops, the renderer answers no DevTools command at all (`Runtime.evaluate`,
  `Debugger.pause`, a screenshot), and every Chromium process uses next to no CPU (at most 0.03 s
  over 2 s), while the browser process still answers. The renderer's main thread is waiting inside
  Chromium for something that never comes: this is not a JavaScript loop on the page.
- It stops just after a burst of main-thread work. Of the 24 hangs whose log records the scroll
  position, 18 stopped at 6,290 px, all at 414 px wide, right after the three segment prefetches of
  `/work` that the walk sets off there; the others stopped higher up the page, some of them just
  after the lazily loaded GSAP chunk arrived.
- Full Chrome in new headless mode, instead of the headless shell, hangs too, less often: 3 in 560
  walks, against 8 in 424 on the headless shell in runs 2 and 3.
- Run 2 also aborted the page's RSC requests, the `/work` prefetches among them, on one shard: 0 in
  106, against 6 in 212 on its two control shards, which happens by chance with a probability of
  about 0.05. That is too few walks to tell whether the prefetches are needed.
- Run 4 changed one variable per shard, against two control shards in the same run (8 hangs in 424
  walks). With the GSAP chunk aborted: 1 in 212, so GSAP is not needed. With
  `--js-flags=--single-threaded-gc`: 0 in 212, which at the controls' rate happens by chance with a
  probability of about 0.018. With `--js-flags=--single-threaded`, which includes it: 0 in 212.
- Run 5 verified the flag as committed, in `playwright.config.ts`, on the real spec: the three `/`
  tests under reduced motion passed 840 times out of 840 with it, while the same run without it
  timed out 8 times in 420, each time in the walk's `page.evaluate`. At that rate, 840 walks without
  a hang happen by chance with a probability of about 1 in 10 million.
- Over all five runs, with `--single-threaded-gc` none of 1,052 walks hung (212 diagnostic, 840
  real), against 33 of 1,688 on the headless shell without it (8 of 420 real, and 25 of 1,268
  diagnostic: every shard of runs 1 to 4 that ran the headless shell with no flag and nothing
  aborted, two of them with Chromium's logging or tracing on). Runs 1 to 5 are Actions runs
  37303507478, 37305312770, 37306643515, 37309583233 and 37312402266 of this repository, whose logs
  GitHub keeps for a limited time: the figures here are the lasting record.

Of the changes that left the walk's timing alone, keeping the collector's work on the main thread is
the one that removed the hang, so the evidence points to the renderer waiting on V8's background
garbage collection. No native stack confirms it, and the exact defect in V8 is not known: naming it
would take stacks of the hung renderer, which the runner only gives to a debugger attached with
elevated privileges, and that was not done.

## Decision

Every Chromium this repository's Playwright starts launches with `--js-flags=--single-threaded-gc`,
locally and in CI: `CHROMIUM_LAUNCH_ARGS` in `apps/web/e2e/support/chromium-launch-args.ts`. It is
passed by both Chromium projects in `apps/web/playwright.config.ts` (`chromium` and
`mobile-chrome`), which `apps/web/playwright.flake-hunt.config.ts` inherits for the nightly hunt, by
the live check's project in `apps/web/playwright.live.config.ts`, and by the Lighthouse spec, which
launches a browser of its own. Playwright merges a project's launch options into such a call
shallowly, so the call's own `args` would replace the flags, and the spec spreads them back in. The
WebKit project is launched unchanged. The live check never walks `/`, but it runs the same Chromium
build, and one rule for every Chromium is simpler to hold than an exemption.

The hand-run Lighthouse commands in `docs/runbooks/deploy.md` borrow Playwright's Chromium binary
but launch it through Lighthouse's own launcher, and keep it as it comes: they measure performance,
and with the flag the collector's work would count as main-thread time no visitor's browser spends.

`apps/web/src/test/playwright-config.test.ts` holds this in place. In all three configs it checks
every project whose engine is Chromium (by Playwright's own rule: `browserName`, else the device's,
else Chromium), that nothing carries the flags to WebKit, and that no config sets them run-wide. It
checks that the flags have a single `--js-flags` entry (Chromium keeps only the last of a repeated
switch). It reads every file under the configs' test directories as a TypeScript syntax tree, so
comments and strings never count as code, and checks that none names `launchOptions` (which would
replace the projects' flags, and reach WebKit from `e2e/mobile/`) or a `--js-flags` of its own, and
that every launch call not on WebKit or Firefox either passes no `args` or spreads the flags into
them. It also pins the Chromium build the flags were measured on, 153.0.8010.12 for both the
browser and the headless shell, read from Playwright's `browsers.json`, so the upgrade that changes
it fails until someone has decided whether they are still needed (see Consequences).

## Consequences

- The hang no longer fails the suite. The walk's time did not change: median 1,014 ms with the flag
  against 1,031 ms without in the same run, 95th percentile 1,057 against 1,060 ms, slowest 1,079
  against 1,071 ms. The whole suite passed with it on the runner: 487 passed, 2 skipped, none
  failed, in 596 s. The Lighthouse spec's own launch and the live check took the flag after that
  run. The Lighthouse spec passed with it locally; it runs only search and discoverability audits,
  none of which measures main-thread time. The live check, run once with it against the production
  site, gave the same result as its last run on `main` without it: the same 12 tests passed, and
  the same 20 failed on a response header, a fault of the site that #217 tracks.
- The flag also reaches the desktop project and local runs, though every hang was on `mobile-chrome`
  on Linux. Both projects run the same binary and the same V8, the desktop project walks `/` too
  (`e2e/console-clean.spec.ts`), and a local run should launch Chromium the way CI does. Ten local
  runs of the spec with it, five on the dev server and five on the production build, all passed.
- The suite no longer runs V8's concurrent and parallel collector, so it can no longer catch this
  hang, which a visitor on the same Chromium build could still meet on `/`. Its triggers are the
  site's own work, but removing GSAP did not remove it (1 in 212), and blocking the `/work`
  prefetches (0 in 106) was too few walks to tell, so whether changing the site would remove it is
  not known. A report to Chromium is the remedy, and the numbers here are what one would need.
- The flag is a workaround for one Chromium build, and the build pin in the unit test is where that
  comes due. When a Playwright upgrade changes the build and fails it, check the new Chromium on the
  runner without the flag, in a throwaway workflow on `ubuntu-latest` as #223's diagnostic branch
  did: on a branch with `CHROMIUM_LAUNCH_ARGS` emptied, after `pnpm --filter web build`, run the
  three tests 140 times each, 420 walks (`--list` with the same options shows the three):

  ```sh
  CI=true pnpm --filter web exec playwright test e2e/mobile/layout-overflow.spec.ts \
    --project=mobile-chrome --repeat-each=140 --retries=0 \
    --grep "/ does not scroll sideways at [0-9]+px under reduced motion"
  ```

  If none times out (by chance about 1 in 4,000 at the pooled rate above), supersede this record
  and remove the flag; otherwise keep it and move the pin. Either way the upgrade's own CI runs the
  whole suite as committed, so a flag that stopped working on the new build shows up as these
  timeouts coming back.

## Alternatives considered

- **Full Chrome instead of the headless shell.** It ran the whole suite unchanged but still hung, in
  3 walks of 560.
- **Retries.** CI already retries a failed test twice, and a retry almost always passes, but
  `failOnFlakyTests` fails the job when one does. Turning it off would hide the hang, and every
  other flaky test with it.
- **Not loading GSAP under reduced motion, or not prefetching `/work` from `/`.** Aborting GSAP
  still hung (1 in 212); blocking the prefetches gave 0 in 106, too few walks to tell. Both would
  change the site to dodge a defect in the test browser, and neither has been shown to remove the
  hang.
- **`--js-flags=--single-threaded`.** It also removed the hang, but it switches off more of V8 than
  the evidence calls for, concurrent compilation included.
- **`--disable-threaded-compositing`.** No hang in 160 walks, but each walk took six times as long,
  and it replaces the rendering architecture the suite is meant to test.
- **The flag on Linux or in CI only.** Every hang was there, but a local run that launches Chromium
  differently from CI is a second configuration to reason about, and the ten local runs with
  the flag all passed.
- **Skipping or loosening the test.** The test guards against sideways scrolling on phones; the hang
  is not a defect in what it measures.
