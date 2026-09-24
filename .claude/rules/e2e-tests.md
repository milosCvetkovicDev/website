---
paths:
  - 'apps/web/e2e/**'
  - 'apps/web/playwright.config.ts'
  - 'scripts/flake-*.sh'
  - 'scripts/verify-flake.sh'
  - 'scripts/check-webserver-log.mjs'
  - '.github/workflows/ci.yml'
  - '.github/workflows/flake-hunt.yml'
---

# End-to-end tests (Playwright) and flaky tests

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Quality gates

- `.github/workflows/flake-hunt.yml` hunts flaky e2e tests every night at 02:17 UTC and on manual
  dispatch, never on a pull request, and none of its jobs is a required check. Six shards each run
  the whole suite five times against the production build with `scripts/flake-hunt.sh`; a report
  job merges the 30 runs into `flake-report.json` (an artifact, with each failure's trace and
  screenshot in the shard artifacts), counts a run no shard uploaded as an infrastructure error,
  and `scripts/flake-hunt-issue.sh` opens one issue labelled `flake-hunt` for the failing tests of
  every spec that failed in more than 5% of the completed runs it ran in, unless an open
  `flake-hunt` issue already names them. Only that job may write issues, and it opens one only for
  the schedule or a dispatch of the default branch. The hunt stops before its first run, failing
  the shard, when `apps/web/e2e/support/warm-routes.ts` is missing or no spec imports it. Locally,
  `scripts/flake-hunt.sh [runs]` runs the hunt and writes the report against the dev server,
  without an issue. 30 runs take hours and hold the Playwright port and that checkout's `.next-e2e`
  the whole time, so start it in the background from a worktree of its own, with `PLAYWRIGHT_PORT`
  set when another checkout runs e2e. Ctrl-C stops a hunt in the foreground only; stop a
  background one with `kill -TERM <pid>`, which exits 143 and still writes the report.
- The web server's output is gated. The `e2e` job tees the Playwright run into a log under
  `shell: bash`, whose `pipefail` keeps a failing run failing through the pipe, and
  `scripts/check-webserver-log.mjs` then fails the job on any `[WebServer]` line outside ADR 0015's
  `Error: Internal: NoFallbackError` block (that message and its `at` frames), the accepted signal
  that sends an unknown `/work/*` slug to the 404. It does not try to recognise error shapes: only
  the server's stderr reaches the log, because `webServer.stdout` stays at Playwright's default,
  `'ignore'`, so every other server line is a finding, warnings included. A missing or empty log
  fails too, and so does a log with no `[WebServer]` line, which means the capture broke, since
  every run prints the allowlisted block. The check runs whenever the suite ran, passed or failed,
  and not after an earlier step failed, when there is no log to read. Its tests run in
  `pnpm test:scripts`.
- Every route must load with a clean browser console, in both colour schemes.
  `apps/web/e2e/console-clean.spec.ts` fails on any console error, console warning or page error,
  React hydration mismatches included, so a stray `console.warn` fails the `e2e` job. Its routes come
  from `apps/web/e2e/routes.ts`, the one list the accessibility gate reads too: the six static
  routes, every case study derived from `src/data/case-studies.ts`, and a 404. `/` is also walked
  down through the story and back up (light scheme only), so the scroll-driven GSAP callbacks and the
  timers they schedule are watched too. The reduced-motion pass cannot cover those: every phase
  effect returns early under `reduce`.
- Accessibility is gated. `apps/web/e2e/accessibility.spec.ts` runs axe-core with the rule set
  behind Lighthouse's accessibility category (kept in `e2e/axe.ts`) on all ten routes in
  `e2e/routes.ts`, in both colour schemes at the desktop viewport, at rest; again on `/` after the
  whole story has been scrolled; and again on `/` with a header nav link hovered and with one focused.
  `e2e/mobile/accessibility.spec.ts` runs the at-rest pass on `/` and `/work/self-healing-agent`
  under both phone projects. Any violation fails the `e2e` job. Each pass asserts a floor on how many
  nodes it measured, so content that stops being rendered or goes transparent fails too. Each
  desktop at-rest pass also holds a per-route, per-scheme budget of `incomplete` colour-contrast
  nodes (`INCOMPLETE_CONTRAST_BUDGET`): axe cannot decide text over a `backdrop-filter` or a
  gradient and does not count it as a violation, so that undecidable region may shrink but never
  grow. The budget is zero on eight of the ten routes, so the first blurred panel put behind text
  there fails; never widen a budget or lower a floor to quieten a failure. A new
  `text-[var(--accent)]` or an opacity-dimmed label fails there; see the accent token bullet under
  Conventions in `ui-components.md` and ADR 0011, which superseded 0008.

## Testing

- e2e specs must wait for hydration before interacting, because events fired before it are lost.
  The root layout renders `HydrationMarker` (`src/components/hydration-marker.tsx`) on every route:
  a hidden `#hydration-marker` whose `data-hydrated` is `false` in the served HTML and `true` once
  React has hydrated. Wait through `e2e/support/hydration.ts` rather than writing a wait of your
  own: `gotoHydrated(page, path)` for a navigation, `expectHydrated(page)` after `page.reload()`. A
  soft navigation needs neither, and a spec with JavaScript off must call neither, because the
  marker never flips. Never wait for hydration by watching page text (ADR 0022). The marker
  hydrates with the layout, so content a page wraps in `<Suspense>` or puts under a `loading.tsx`
  would hydrate after it flips. No route puts content inside a
  boundary today: no component renders a `<Suspense>` or a `lazy()` component and no route has a
  `loading.tsx`, since the decorative `TmuxBackground` on `/` is imported statically.
  `e2e/hero.spec.ts` asserts the page title.
  That assertion is only a smoke check that the app rendered: it never could catch a second
  checkout of this site, which serves the same title character for character, and the not-found and
  error pages carry it too. Status and path are what catch a wrong page.
- On `/`, GSAP arrives after hydration: `src/components/animated-hero/load-gsap.ts` fetches it once
  the browser is idle, and the story builds its timelines then. A spec that measures anything GSAP
  does on `/`, a from-state at rest, a hover tween or a scroll-driven reveal, waits for it with
  `expectGsapLoaded(page)` from `e2e/support/gsap.ts` after `expectHydrated`; measured earlier, it
  reads the server-rendered page instead. The helper fails at once when the load failed.
  `e2e/gsap-lazy.spec.ts` covers the window before GSAP arrives and a load that fails.
- `apps/web/playwright.config.ts` treats `CI=true` or `CI=1` as CI: it serves the production build
  with `pnpm start` inside `apps/web`, sets `forbidOnly`, retries twice, uses one worker and a 10s
  expect timeout, and sets `failOnFlakyTests`: a test that passes only on a retry fails the run, on
  all three projects, so the report and its `on-first-retry` trace are uploaded instead of discarded
  with a green job. Locally it serves the dev server instead.
- It declares three projects. The desktop `chromium` project runs every spec outside `e2e/mobile/`;
  `mobile-chrome` (Pixel 7) and `mobile-safari` (iPhone 13, WebKit) run only `e2e/mobile/`, which is
  where a spec goes when it needs a phone viewport or `isMobile`. `src/test/playwright-config.test.ts`
  pins the split. A run that fails every test in milliseconds is a missing browser, usually webkit
  after a Playwright bump: rerun the install command with `chromium webkit`.
- Verified defects that an open task will fix are recorded as expected failures, `test.fail()` in
  Playwright and `it.fails` in Vitest, each naming its manifest row and fixing issue (see
  `.claude/epics/audit-remediation-2026-09/43.md`). An expected failure that passes fails the run, so
  the pull request that fixes the defect deletes the annotation in the same change.
- The two gate specs opt out of those retries: `e2e/console-clean.spec.ts` and
  `e2e/accessibility.spec.ts` both set `test.describe.configure({ retries: 0 })`, and so does every
  spec that carries an expected failure. A retry would turn an intermittent console message or axe
  violation, or an expected failure that has started passing, into a green "flaky" run, which is the
  one outcome they exist to prevent. Do not remove those overrides to quieten a failing run.
- Playwright always starts the server it tests. `reuseExistingServer` is `false` in both modes, so a
  port that is already taken aborts the run instead of testing whatever is answering on it. The port
  is 3210 by default, which leaves 3000 to `pnpm dev`; `.github/workflows/ci.yml` sets
  `PLAYWRIGHT_PORT: '3000'` on the `e2e` job, and `PLAYWRIGHT_PORT` overrides the default anywhere
  else. A value that is not an integer between 1 and 65535 throws at config load rather than falling
  back. The local dev server also builds into `.next-e2e` (`NEXT_DIST_DIR`, read by
  `apps/web/next.config.ts`), so it never fights a `pnpm dev` from the same checkout over
  `apps/web/.next`. See `docs/adr/0014-playwright-owns-its-server.md`.
- A flaky e2e test is root-caused before it is patched: reproduce it repeatedly, tell a cold first
  request apart from a logic fault, and prefer warming the destination route on the dev server
  before the timed step (a route compiles on its first request) over an arbitrary wait or a retry.
  Verify a fix with at least five consecutive runs in each mode, the dev server
  (`pnpm --filter web test:e2e`) and the production build
  (`pnpm --filter web build && CI=true pnpm --filter web test:e2e --retries=0`), and report the
  measured timings. Keep `--retries=0` on the production runs: under `CI=true` the config retries
  a failed test twice, and a run whose only failures passed on a retry is reported as flaky and
  exits 0.
- To tell a flaky e2e test from a slow or a broken one, sweep its file:
  `pnpm test:e2e:sweep e2e/<spec> [runs] [out-dir]` runs the whole file that many times (10 by
  default), into a new directory under `$TMPDIR` unless given one. Type it from the repository root
  or any directory outside a workspace package; inside one, such as `apps/web`, pnpm does not find
  the script, so use `pnpm -w test:e2e:sweep` there. It writes `summary.txt` (a line for each run
  that exited nonzero with no unexpected test or whose report carries errors outside any test, then
  per test and project: in how many of the runs it ran in it ended other than as declared, the runs
  it failed in, and its duration in each run), `runs.tsv` (exit code, seconds, load average and
  test counts per run) and `sweep.txt` (commit, mode, port), and keeps every JSON report and the
  output of each run with a failed or flaky test. A sweep takes minutes: start it in the background,
  and do not overlap it with another e2e run in the same checkout. Record the load with the result:
  parallel sessions on one machine cause timing failures that CI never sees. `COLD=1`, `CI=true`,
  signals and the exit codes are described at the top of `scripts/flake-sweep.sh`.
- A bare `Test timeout of Nms exceeded`, with no second error naming a call, means no Playwright
  call on the test's page, context or `request` was still pending when teardown closed them, because
  a pending one is named: `page.goto: Test timeout …`, `expect(locator).toBeHidden() failed`, or
  `apiRequestContext.get: Request context disposed.` for `request`. When every await in the test is
  such a call, a bare report means the run was slow and its deadline fell in its last steps, not
  that it was stuck. It proves nothing about an await outside Playwright (a Node `setTimeout` or
  `fetch`, a promise that never settles), which reports bare while it hangs, nor about an error
  thrown after the deadline, which is never reported. A setup or hook overrun says so
  (`while setting up "page"`).

## Gotchas

- To reproduce the CI e2e run locally:
  `pnpm --filter web build && CI=true pnpm --filter web test:e2e`. `CI=true` chooses the production
  build and the runner hardening, not the port: the run serves 3210 like every other local run, so
  it works while another checkout holds 3000. `pnpm --filter web start` serves the production build
  on port 3000 on its own, which is what the hand-run Lighthouse commands in
  `docs/runbooks/deploy.md` expect.
- Two checkouts running the local e2e suite at the same moment both want 3210, and the second aborts
  with Playwright's `is already used` error. Give it another port:
  `PLAYWRIGHT_PORT=3211 pnpm --filter web test:e2e`.
- The Playwright config never reuses a server (`reuseExistingServer: false`), so a run killed
  part-way can leave an orphaned `next dev` holding 3210 and every later run in that checkout
  aborts. Clear it with `lsof -ti tcp:3210 | xargs kill` rather than moving to another port, which
  only leaks the orphan.
- `.next-e2e` is known to seven places, not one: both `.gitignore` files, `.prettierignore`,
  `globalIgnores` in `apps/web/eslint.config.mjs`, the `include` list in `apps/web/tsconfig.json`,
  `.vercelignore` (the Vercel CLI never reads `.gitignore`, and the directory runs to ~150 MB) and
  the `clean` script in `apps/web/package.json`. The tsconfig entries are load-bearing: `next dev`
  appends its `distDir` type paths to that file itself, so without them every local e2e run rewrites
  a tracked file and `pnpm format:check` fails on the result. A different `NEXT_DIST_DIR` value would
  need all seven.
- Only an e2e run refreshes `.next-e2e`, and `apps/web/tsconfig.json` compiles the route types in it.
  If `pnpm typecheck` disagrees with CI about a route that was added, renamed or removed on another
  branch, the copy in `.next-e2e` is stale: `pnpm --filter web exec rm -rf .next-e2e`, or
  `pnpm --filter web clean`. Two local suites in the _same_ checkout on different ports also share
  it, so do not overlap them; two different checkouts are fine, they have their own.
- The CI e2e log prints a three-line `[WebServer] Error: Internal: NoFallbackError` stack once for
  every request of an unknown `/work/*` slug, so several times per run, and still passes. It is the
  internal signal that routes such a slug to the site-level 404, and `not-found-shell`, `not-found`,
  `console-clean` and `hydration-marker` all request `/work/does-not-exist`; the response is a
  correct 404 and no browser console entry results. Do not chase it:
  `scripts/check-webserver-log.mjs` allowlists exactly that message with its stack frames and fails
  the job on any other `[WebServer]` line. The Vercel production log carries no such line, because
  the platform answers an unknown path from the cached static 404 without invoking the route
  (`docs/adr/0015-static-case-study-params.md`).
- Claude Code's in-app Browser pane logs React error #418 (hydration mismatch) on every page of the
  deployed site, while an unmodified headless Chromium (Playwright from `apps/web`) reports none
  across schemes, viewports and reduced motion. Judge console cleanliness with Playwright, not the
  pane.
