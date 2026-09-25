# Mobile Lighthouse and Phone Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take out of Lighthouse's mobile measurement window the work that `/` does there without
the visitor needing it: a theme-context change that makes React throw away server-rendered markup,
the header logo prefetching the page it is on, a tmux background fetched as a separate chunk after
hydration, and GSAP fetched as soon as the browser is idle. Fix, in the same branch, the phone-width
layout defects on `/` that the layout investigation verified.

**Design:** none. This plan carries its own rationale in the Evidence section below. It derives from
four investigations run on 2026-09-23 (largest contentful paint, JavaScript and blocking time,
rendering, phone layout), a planner's Lantern replays, and an adversarial critique of the first
draft, run on 2026-09-24, whose corrections are folded in here. Their scratch data and tools are not
in the repository.

**Branch:** `perf/mobile-lighthouse`, from `main` at `e7fdee4`. The measured baseline, `d1da60f`,
differs from it only in `.design-sync`.

**Stop condition for the whole plan.** The gate is relative: the branch against a baseline built
from its merge base, measured in the same session with the two servers interleaved. The local
absolute score is not the goal. Most of the gap between the local baseline (86–89) and the live
site (a median of 95 with the same Lighthouse) comes from simulating `next start`, which speaks
HTTP/1.1, where Vercel speaks HTTP/2.

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
git fetch origin
MB=$(git merge-base HEAD origin/main)
OUT=$(mktemp -d)   # reports, logs and the baseline worktree, all outside the repository

# The baseline: the merge base, built in a worktree of its own. Build it even when the diff below
# is empty; a non-empty diff (a merged #118 or #119, or a Dependabot group) makes it mandatory.
git diff --stat d1da60f "$MB" -- apps/web package.json pnpm-lock.yaml pnpm-workspace.yaml | tail -1
git worktree add --detach "$OUT/base" "$MB"
(cd "$OUT/base" && pnpm install --frozen-lockfile && pnpm --filter web build)
pnpm --filter web build

# Two free ports. Never rebuild either .next while its server is running.
for port in 3226 3227; do lsof -ti tcp:$port && echo "$port is busy: pick another free port"; done
(cd "$OUT/base/apps/web" && nohup pnpm exec next start -p 3227 > "$OUT/base-serve.log" 2>&1 &)
(cd apps/web && nohup pnpm exec next start -p 3226 > "$OUT/branch-serve.log" 2>&1 &)
until curl -sf localhost:3226/ > /dev/null && curl -sf localhost:3227/ > /dev/null; do sleep 1; done

# Five interleaved pairs, with the load before and after each run.
for i in 1 2 3 4 5; do
  for pair in base=3227 branch=3226; do
    label=${pair%%=*}; port=${pair#*=}
    echo "run $i $label start load=$(sysctl -n vm.loadavg)" >> "$OUT/loads.txt"
    npx -y lighthouse@12.8.2 "http://localhost:$port/" --output=json \
      --output-path="$OUT/$label-$i.json" --save-assets --chrome-flags="--headless=new" --quiet
    echo "run $i $label end load=$(sysctl -n vm.loadavg)" >> "$OUT/loads.txt"
  done
done
kill $(lsof -ti tcp:3226) $(lsof -ti tcp:3227)
git worktree remove --force "$OUT/base"
```

It passes when all of these hold:

- [x] Only clean runs count: no `runWarnings`, `benchmarkIndex` at least 1000, and the load in
      `loads.txt` at or below about 10 for the whole session. Otherwise rerun the pairs later.
      Other sessions' e2e suites inflate blocking time.
- [ ] The branch's median performance score is at least 5 points above the baseline's median from
      the same session.
- [ ] No metric gets worse: the branch medians of LCP, TBT, Speed Index and FCP are each at or
      below the baseline's, and CLS is 0 in every branch run. A difference within one run's spread
      is measured again, not accepted.
- [x] Every branch run scores 100 for accessibility, best practices and SEO.
- [x] In every branch run the LCP element is the hero `h1`, or the paragraph that paints in the same
      first frame, and the network-requests audit lists no `/?_rsc=` request.
- [x] For a production-like reading, each branch run's LCP is also re-simulated from its saved
      trace and devtools log with the protocol set to HTTP/2 (a Lantern replay). Recorded, not
      gated.
- [x] Production: five Lighthouse 12.8.2 CLI runs against `https://miloscvetkovic.dev` before the
      pull request, and five after the merge has deployed, with the load logged. The expectation is
      a median of 96–97 after the deploy, from blocking time alone. This is evidence, not a merge
      gate: it can only run after the merge.

Every command below runs from the repository root, after loading nvm. Run one e2e suite at a time.

### Result, 2026-09-24: the relative gate is not met

The branch, rebased onto `a3d97f9`, against a baseline built from `a3d97f9`, in two sessions of
interleaved pairs. No run has a run warning, and `benchmarkIndex` is 1323–2032. Medians, baseline →
branch:

| Set | Pairs | Load at run start | Perf    | LCP (ms)    | TBT (ms)  | Speed Index (ms) | FCP (ms)    |
| --- | ----- | ----------------- | ------- | ----------- | --------- | ---------------- | ----------- |
| 1   | 5     | 3.8–9.4           | 89 → 90 | 2954 → 2956 | 279 → 261 | 1601 → 1083      | 1080 → 1074 |
| 2   | 7     | 2.3–4.6           | 88 → 92 | 2936 → 2937 | 303 → 183 | 1522 → 1067      | 1055 → 1067 |

- The score gains +1 and +4, short of +5. Blocking time and Speed Index improve in both sets. LCP is
  within 2 ms in both. FCP is 6 ms better in one set and 12 ms worse in the other, inside the
  baseline's own spread of 1034–1155 ms.
- Every branch run scores 100 for accessibility, best practices and SEO, has a CLS of 0, and has the
  hero `h1` as its LCP element. No branch run requests `/?_rsc=`; every baseline run does.
- The HTTP/2 replay of set 2 puts both sides at an LCP of 2162–2202 ms at the observed first frame.
  At a fixed 400 ms cutoff the baseline rises to 2273–2300 ms in six of seven runs, while the branch
  stays at 2170–2178 ms. The branch's LCP no longer depends on when the first frame lands.
- Against the first baseline, `d1da60f`, the branch measured +6: 94 against 88, LCP 2771 against
  3294 ms, TBT 156 against 253 ms. Between then and `a3d97f9`, main merged #118 to #124 and the two
  sides converged on LCP. The baseline's median fell to 2.94–2.95 s, and the branch's rose to the
  same value. The review stage attributed the branch's rise to #120's headers (+456 B on each early
  response) but did not isolate the cause.
- What is left of LCP, and why this plan's changes cannot move it:
  - The Lantern estimate counts every request that starts before the observed first frame. On both
    sides those are the framework JavaScript, the two preloaded fonts and the stylesheet.
  - Replayed at fixed cutoffs over HTTP/1.1, the baseline's LCP rises to 3204 ms at 400 ms and to
    3416 ms at 600 ms, while the branch stays at 2937 ms. The branch's LCP advantage appears only in
    runs where the first frame is late.
- What is left of blocking time is the framework start-up task. A V8 CPU profile under 4× CPU
  throttling, three runs a side:
  - The longest script task has a median of 155 ms on the baseline and 162 ms on the branch.
  - In five of the six runs, 87–107 ms of that task is the Turbopack runtime instantiating
    framework modules, the same on both sides.
  - So the branch's blocking-time gain comes from tasks outside that start-up task.
- "If the relative gate fails" was followed:
  1. The pairs were measured again as set 2: seven pairs, at a load of 5 or less.
  2. LCP (2.94 s, over 2.80 s) and TBT (183 ms, over 140 ms) were investigated as above.
  3. The lever the profile pointed to, deferring the hydration of the story phases below the fold,
     was estimated from it as short of +5 on its own. The other levers are the owner decisions
     below.
  4. On 2026-09-24 the owner chose to open the pull request with these numbers stated rather than
     make a third attempt.
- Production before the pull request: five runs of `a3d97f9` on `https://miloscvetkovic.dev`, at a
  load of 2.1–4.1 at run start:
  - Scores 68, 93, 93, 91 and 92, a median of 92. The 68 is the first run, with a TBT of 1708 ms.
  - The other four runs: LCP 2134–2290 ms, TBT 249–324 ms, CLS 0.0001.
- Production after the deploy: #125 merged as `23ef7a6`, and `main` had not moved when the runs
  were taken. The live page carried all 30 class attributes unique to the build of the pull
  request's head, whose `apps/` tree `23ef7a6` shares, and none of the 25 unique to `a3d97f9`.
  Five runs followed at 19:33Z, four hours after the runs before the pull request (15:23Z), from
  the same machine with the same Lighthouse 12.8.2 settings (mobile, simulated 1.6 Mbps and 150 ms
  RTT, 4× CPU slowdown), at a load of 2.6–3.6 at run start. Neither set has a run warning, and
  `benchmarkIndex` is 1675–2023.5 before and 1794.5–2079.5 after. Each column's own median over
  the five runs, before → after:

  | Perf    | LCP (ms)    | TBT (ms)  | Speed Index (ms) | FCP (ms)   | CLS        |
  | ------- | ----------- | --------- | ---------------- | ---------- | ---------- |
  | 92 → 97 | 2236 → 2303 | 321 → 135 | 1502 → 1214      | 993 → 1181 | 0.0001 → 0 |
  - The scores after the deploy are 99, 97, 97, 94 and 97. The median, 97, is inside the 96–97
    the plan expected from blocking time alone.
  - Every run in both sets scores 100 for accessibility, best practices and SEO and has the hero
    `h1` as its LCP element. Every run before the deploy made three `/?_rsc=` requests, and none
    after it makes one.
  - The first run of each set is cold: its observed first paint is 2283 ms before and 850 ms
    after, against 388–462 ms for every other run. The ranges below leave both out.
  - Blocking time is 126–226 ms after the deploy against 249–324 ms before.
  - LCP is later: 2298–2312 ms after against 2134–2290 ms before, and the five-run median is 67 ms
    later.
  - The simulated FCP is later too, 1172–1268 ms against 991–1198 ms. The observed first paint,
    which Lighthouse measures without throttling, is unchanged at 388–462 ms against 413–445 ms,
    so the server is not slower and nothing delays the paint of an unthrottled load. It cannot
    show a cost that only the simulated 1.6 Mbps link or the 4× CPU slowdown imposes.
  - In each of those runs, the requests that start before the first paint carry 3.4 KB more
    transfer size, 260.4 KB from 15 requests against 257.0 KB from 16. The largest change among
    them is the page chunk, which grew by 4.9 KB because the tmux background now ships in it
    instead of in a lazy chunk. At 1.6 Mbps, 3.4 KB is about 17 ms, so the cause of the rest of
    the FCP and LCP difference is not isolated.

---

## Evidence

All measurements are Lighthouse 12.8.2 with its default mobile configuration (Moto G Power
emulation, simulated slow 4G and 4× CPU), taken on 2026-09-23 and 2026-09-24. Load is the 1-minute
`vm.loadavg`.

**Local baseline.** Three runs of `d1da60f` under `next start`, load 2.8–4.2, benchmarkIndex
1852–1892.

| Metric             | Run 1 | Run 2 | Run 3 |
| ------------------ | ----- | ----- | ----- |
| perf               | 89    | 86    | 89    |
| LCP (ms)           | 3299  | 3286  | 3284  |
| TBT (ms)           | 219   | 285   | 211   |
| Speed Index (ms)   | 2701  | 2587  | 2708  |
| FCP (ms)           | 1019  | 981   | 1013  |
| Observed FCP = LCP | 1184  | 1138  | 1211  |

**Production, same CLI and configuration.** Three runs against `https://miloscvetkovic.dev`
(HTTP/2), load 2.0–3.0, benchmarkIndex 1773–1815, no run warnings.

| Run | Perf | LCP (ms) | TBT (ms) | Speed Index (ms) | FCP (ms) | a11y / BP / SEO |
| --- | ---- | -------- | -------- | ---------------- | -------- | --------------- |
| 1   | 95   | 2414     | 165      | 2821             | 1312     | 100             |
| 2   | 96   | 2318     | 180      | 1942             | 1194     | 100             |
| 3   | 94   | 2195     | 230      | 1786             | 1147     | 100             |

The long tasks in production are the first layout (262–265 ms), the framework start-up
(171–219 ms), React's last hydration task (69–72 ms) and GSAP (90–94 ms).

**The protocol explains most of the local gap.** Changing only the protocol to HTTP/2 in the three
local traces and re-running the LCP simulation takes LCP 3299 → 2442, 3286 → 2279 and
3284 → 2428 ms. About 0.85–1.0 s of the local LCP comes from simulating an HTTP/1.1 server, where
every request that starts before the late first frame competes for a small connection pool.

**Lantern replays of the local runs.** LCP (ms) at the observed first-frame cutoff / at a fixed
400 ms cutoff.

| Replayed change                                                        | Run 1       | Run 2       | Run 3       |
| ---------------------------------------------------------------------- | ----------- | ----------- | ----------- |
| none                                                                   | 3299 / 3026 | 3286 / 3013 | 3284 / 3011 |
| TmuxBackground imported statically (lazy chunk gone, page chunk ×1.31) | 2928 / 2778 | 2917 / 2767 | 2914 / 2764 |
| + no `/?_rsc` self-prefetch                                            | 2779 / 2779 | 2771 / 2771 | 2765 / 2765 |
| + no GSAP request                                                      | 2779        | 2771        | 2765        |
| + font bytes ×0.76 or ×0.54                                            | 2779        | 2771        | 2765        |
| GSAP and prefetch dropped, tmux kept lazy                              | 3042        | 3032        | 3024        |

What the replays mean, locally and in production:

- **Locally**, the static tmux import is the largest LCP change (−370 ms at the observed cutoff,
  −246 ms at 400 ms), and removing the self-prefetch takes another −136 to −149 ms. Font bytes
  change nothing once the late requests are gone; only removing a whole request moves LCP, which is
  the HTTP/1.1 connection-pool effect.
- **Over HTTP/2 with local timings** the same two changes are worth 175–190 ms and 68–82 ms.
- **In production they are worth about 0.** Replayed on the production traces: 2414 → 2406,
  2318 → 2318 and 2195 → 2200 ms. There the first frame is shown (1314, 781, 654 ms) before the
  tmux chunk, GSAP and the `?_rsc` requests start (1348, 812, 685 ms), so those requests never
  reach the LCP estimate.
- So Tasks 2 and 3 are needed to pass the local comparison and to make the local result steady when
  the first frame is late. Their production value is blocking time: Task 3 removes React's 69–72 ms
  rebuild of the tmux boundary.

**Scoring.** Lighthouse 12.8.2 mobile weights: FCP 10, Speed Index 10, LCP 25, TBT 30, CLS 25. With
FCP about 1.0 s, Speed Index at or under 2.7 s and CLS 0, a single run reaches 95 only with one of
these pairs:

| LCP at most (ms) | TBT at most (ms) | Note                              |
| ---------------- | ---------------- | --------------------------------- |
| 2798             | 140              |                                   |
| 2839             | 127              |                                   |
| 2757             | 152              | needs a Speed Index score of 0.98 |

**Blocking time.** The JavaScript investigation measured, CPU-normalised over 4 interleaved runs:
Task 1 alone takes TBT 257 → 213 ms; Tasks 1 and 8 together take it to a median of 118 ms (runs of
111, 114, 123 and 131 ms), with nearly all of what is left being the framework start-up task. That
variant kept tmux lazy and had none of Tasks 3–7, so the prediction is thin: in 7 of 32 runs the
document's first-layout task split across FCP and added about 87 ms, which puts a run near TBT
200 ms and a local score of 92–93. Task 3's own blocking-time effect was never measured as a static
import (only as removing tmux altogether).

**Prediction.** Locally, LCP about 2.77 s after Tasks 2–3 (replayed, 3 of 3 runs), TBT about
118 ms after Task 8, Speed Index about 2.46 s (the rendering investigation's runs with the GSAP
chunk blocked): a local median of 94–96 against a baseline of 86–89. In production, LCP unchanged
and TBT lower, for a median of about 96–97.

---

### Task 0: Commit this plan

**Files:**

- Create: `docs/plans/2026-09-24-mobile-lighthouse-plan.md` (this file)
- Modify: `docs/plans/README.md` (an Index row, status `Planned` until the pull request opens)
- Modify: `docs/drift-manifest.json` (the row's link and status cell)

- [x] **Step 1:** Add the plan and its index row, and catalogue the row in the drift manifest,
      shaped like the entries for `2026-02-22-hero-section-redesign.md`. Cite files in this plan by
      path only: every `path:line` citation or backticked `pnpm` script outside a fenced block needs
      a manifest entry of its own.
- [x] **Step 2:** Verify, and commit as `docs(plans): add the mobile Lighthouse plan`.

```bash
pnpm check:docs-drift --skip-requires admin   # exit 0; the admin-only entries show as skipped
pnpm format:check                             # exit 0
```

**Before every later commit**, run the gates and the e2e specs the task touches, in CI mode on a
fresh build, and log `sysctl -n vm.loadavg` next to every timing reported:

```bash
pnpm lint && pnpm typecheck && pnpm --filter web test && pnpm format:check
pnpm --filter web build && CI=true PLAYWRIGHT_PORT=3212 pnpm --filter web test:e2e --retries=0 <specs>
```

Commit titles are Conventional Commits of at most 100 characters counting the ` (#NN)` suffix.
Never `--no-verify`.

---

### Task 1: Keep the theme out of React context

Commit: `perf(web): read the theme from its store instead of a context that changes on hydration`.

**Files:**

- Modify: `apps/web/src/components/theme-provider.tsx`
- Test: `apps/web/src/components/__tests__/theme-provider.test.tsx`

**Why.** `ThemeProvider` put `{ theme, toggleTheme, mounted }` in a context. After hydration both
`theme` (the stored value replacing the server's `'dark'`) and `mounted` change, so the context value
changes, and React client-renders any still-dehydrated Suspense boundary below a changed context:
it deleted the server-rendered TmuxBackground and rebuilt it, 8 of 8 times on `main` (dark included,
because `mounted` flips anyway), and 0 of 8 with a stable value.

- [x] **Step 1:** `toggleTheme` becomes a module-level function that only reads and writes the
      store. The context goes: `useTheme()` keeps its return shape `{ theme, toggleTheme, mounted }`
      and reads `theme` itself with `useSyncExternalStore(subscribe, readTheme, getServerTheme)`,
      `mounted` with `useIsHydrated()`, and returns the module-level `toggleTheme`. `ThemeProvider`
      keeps only the effect that mirrors the theme onto `<html>`, unchanged. `navigation.tsx` and
      the components barrel need no edit.
- [x] **Step 2:** Keep every assertion in the existing test file, and add a regression test:
      server-render a `ThemeProvider` holding a theme consumer and, inside an element, a
      `<Suspense fallback={null}><Inner/></Suspense>`, with `react-dom/server`, with `'light'` stored while the server snapshot is `'dark'`;
      `hydrateRoot` the same tree with `Inner` replaced by a `React.lazy` whose promise is still
      pending, and flush; assert that Inner's server DOM node is still connected and is the same
      node; resolve the lazy and assert it again. It fails on the parent commit and passes here.
      The element around the boundary matters: React 19 propagates a context change lazily, from a
      parent that bails out of rendering, so a boundary straight below the provider never sees it.
- [x] **Step 3:** Verify: the new test red on the parent and green here, the full unit suite, and
      `e2e/console-clean.spec.ts` and `e2e/accessibility.spec.ts` in CI mode.

**Rules.** ADR 0006: the state stays in `useSyncExternalStore` with a server snapshot, and no
setState runs in an effect. No `eslint-disable`. The served markup is unchanged (the moon icon shows
until hydration), so the console and axe gates are unaffected. After Task 3 no Suspense boundary
with content is left on `/`, so this task's performance value overlaps Task 3's; it stays as a
guard for the next boundary anyone adds.

---

### Task 2: Stop the home page prefetching itself

Commit: `perf(web): stop the home page prefetching itself from the header logo`.

**Files:**

- Modify: `apps/web/src/components/navigation.tsx`
- Create: `apps/web/src/components/__tests__/navigation.test.tsx`
- Modify: `apps/web/e2e/mobile/navigation.spec.ts`

**Why.** On a phone the header logo is the only `Link` in the viewport at load (the desktop links
are `display: none` below `md`, and the mobile menu is not rendered while closed), and on `/` it
prefetched `/` itself: three `/?_rsc=` requests at 1170–1176 ms in a local baseline run, about 8 KB
and 8–10 ms of CPU. Locally that is −136 to −149 ms of LCP on top of Task 3 (zero when the first
frame is shown before about 1.1 s); in production about 0 (see Evidence).

- [x] **Step 1:** Give the logo `Link` `prefetch={pathname === '/' ? false : undefined}`.
      `pathname` is the same on the server and the client, so hydration is safe, and `undefined`
      keeps Next 16's default on every other route.
- [x] **Step 2:** Unit test: mock `next/link` to record its props and `next/navigation`'s
      `usePathname`; assert the logo link gets `prefetch: false` on `/` and no `prefetch` prop on
      `/about`.
- [x] **Step 3:** e2e, phone projects: on `/`, after hydration and network idle, no `/?_rsc=`
      request for `/` is made. Prefetching only runs in production builds, so in CI mode a control
      on `/about` first shows that the same wait sees the logo's prefetch of `/`. It fails on the
      parent commit in both phone projects.
- [x] **Step 4:** Verify: the unit file, and `e2e/mobile/navigation.spec.ts` in CI mode.

**Rules.** No hydration or accessibility change. #118 rewrites the same `Link` (an `aria-label` and
a `<Logo/>`): keep both changes when rebasing.

---

### Task 3: Render the tmux background with the hero

Commit: `perf(web): render the tmux background with the hero instead of a lazy chunk`.

**Files:**

- Modify: `apps/web/src/components/animated-hero/hero-section.tsx`
- Modify: `CLAUDE.md` (the Testing bullet on the hydration marker)
- Modify: `apps/web/e2e/support/hydration.ts` (the same comment), `apps/web/e2e/served-html.spec.ts`
  (a comment naming the `/` boundary's `<template id="B:0">`, which is no longer served)
- Test: `apps/web/e2e/hero.spec.ts`

**Why.** Hydration requested the lazy tmux chunk at about 300 ms, a serial link after the framework
evaluation. Imported statically, its 5.5 KB gzip rides in the home page chunk, which is not on the
slowest chain. Locally: LCP −370 ms at the observed cutoff and −246 ms at a 400 ms cutoff (3 of 3
replays). In production: LCP about 0, and the rebuild task (69–72 ms) goes. It also removes the
streamed boundary and its DOM move. Cost: +17 KB raw (5.5 KB gzip) of initial JavaScript on `/`,
and the tmux intervals start at hydration.

- [x] **Step 1:** Import `TmuxBackground` statically and render it without `Suspense`; drop `lazy`
      and `Suspense` from the imports and the "lazy loaded" comment.
- [x] **Step 2:** Grep `apps/web/src` for `Suspense` and `lazy(`, then correct the CLAUDE.md
      Testing bullet and the header comment of `e2e/support/hydration.ts`, which both say the
      decorative `TmuxBackground` on `/` is the one boundary with content that may hydrate after the
      marker.
- [x] **Step 3:** Add "the server-rendered tmux background survives hydration" to
      `e2e/hero.spec.ts`: an init-script MutationObserver records the first element whose text is
      exactly `[0] production-monitor` (the status-bar span); after hydration and 3 s, the recorded
      node is still in the document and is the node found now. On `main` it fails (the node is
      deleted and rebuilt: 2 of 2 on a production build with `main`'s theme provider); it passes
      after Task 1 or Task 3. Keep the tests for five panes and CLS.
- [x] **Step 4:** Verify in CI mode: `hero`, `served-html`, `console-clean`, `accessibility`,
      `mobile/accessibility` and `hydration-marker`. The hero looks the same, so its screenshots
      are taken with Task 4's.

**Rules.** ADR 0009 rule 4 and the comment in `animated-hero/index.tsx` concern the story phases
only. ADR 0022: nothing covers the `h1` (`served-html.spec.ts` checks it). No Suspense boundary is
added.

---

### Task 4: Keep the hero chrome to what fits on a phone

Commit: `fix(web): keep the hero chrome to what fits on a phone` (layout items 1, 3, 4).

**Files:**

- Modify: `apps/web/src/components/animated-hero/tmux-background.tsx`
- Modify: `apps/web/src/components/animated-hero/hero-section.tsx`
- Modify: `apps/web/src/components/animated-hero/section-progress.tsx`
- Create: `apps/web/e2e/mobile/hero-chrome.spec.ts`

- [x] **Step 1:** `tmux-background.tsx`: both pane containers (the live pane and the reduced-motion
      `StaticPane`) are `hidden … first:flex md:flex`, so a phone shows the first pane only; the
      `staging` and `logs` tabs are `hidden sm:block`; `milos@obsidian22` in the top bar is
      `hidden sm:inline`; in the status bar the `·` and `5 panes` spans, and the uptime, separators
      and region spans, are `hidden sm:inline` (the uptime span keeps its inline colour). The
      `3 alerts` span and the clock stay.
- [x] **Step 2:** `hero-section.tsx`: the section is `min-h-svh … px-4 sm:px-6` (not the patch's
      `py-20 sm:py-24`, whose rationale was wrong and which pushes the skill tags below the fold at
      375×667); the scroll indicator is `hidden lg:flex`.
- [x] **Step 3:** `section-progress.tsx`: the corner-bracket layer is `hidden lg:block`.
- [x] **Step 4:** New phone spec: exactly one tmux pane is displayed, and the corner-bracket layer
      and the scroll indicator are `display: none`, with motion allowed and reduced (the
      reduced-motion snapshot renders its own panes). Desktop coverage stays with `hero.spec.ts`
      (five panes, the indicator fade).
- [x] **Step 5:** Verify in CI mode: `mobile/accessibility`, `hero`, `section-progress`,
      `mobile/layout-overflow` and the new spec. Screenshots at 320, 375, 412 and 1280 px, light and
      dark, are part of the set under "Last".

**Measured side effects** (no score change): DOM size 1575 → 1451, tmux log slots 155 → 31,
legible-text share 86.7% → 94.3%, incomplete nodes in the phone axe pass 74 → 38.

**Rules.** CSS breakpoints, not `matchMedia` in render (ADR 0006). The chrome is `aria-hidden`. No
colour, alpha or opacity change (ADR 0010, 0011). The phone axe floor for `/` is 60; 131 passes
were measured.

---

### Task 5: Fit the story sections to phone widths

Commit: `fix(web): fit the story sections to phone widths` (layout items 5, 7, 8, 9).

**Files:**

- Modify: `discovery-phase.tsx`, `strategy-phase.tsx`, `execution-phase.tsx`, `gauntlet-phase.tsx`,
  `loop-phase.tsx`, `game-complete.tsx` and `load-gsap.ts`, all in
  `apps/web/src/components/animated-hero/`

- [x] **Step 1:** The six phase sections become
      `flex min-h-screen items-center justify-center px-4 py-16 sm:px-6 sm:py-24`, and the comment
      on `isAlreadyReached` in `load-gsap.ts` says "`py-16`, and `py-24` from `sm`". The function
      itself is unchanged, because it measures the first child.
- [x] **Step 2:** Strategy: in each tech card the category → choice row wraps, as
      `flex flex-wrap items-center gap-x-2 gap-y-0.5` inside a `min-w-0 flex-1` column; the card is
      `gap-3 p-3 sm:gap-4 sm:p-4` and the architecture diagram `h-40 sm:h-48` (cosmetic, approved).
- [x] **Step 3:** Loop: the stat grid is `gap-2 sm:gap-4`, each cell `p-2 sm:p-3`, each value
      `text-xl sm:text-2xl` with its status or accent token kept; the labels stay `text-xs`.
- [x] **Step 4:** GameComplete: the Ideas → Architecture → Code → Production line wraps
      (`flex flex-wrap … gap-x-2 gap-y-1`), and the LinkedIn button is `w-full sm:w-auto`.
- [x] **Step 5:** Verify: the unit suite (the `gsap-css-conflicts` guard and the dimmed-text
      scanner), and `story`, `gsap-lazy`, `mobile/accessibility` and `mobile/layout-overflow` in CI
      mode.

**Measured:** Loop cells at 320 px fit 79 in 79 (83 in 69 before); the Ideas→Production line fits
at 320, 375 and 390 px (254/254, 309/309, 324/324); the tech items fit at 320 px (270 in 270) once
Task 6 fixes their grid track. The tests land with Task 6.

**Rules.** Status tokens stay (ADR 0010), with no alpha or opacity. No text below 12 px. No
transition on any tweened element.

---

### Task 6: Stop the story grids and the stats from-state widening the page

Commit: `fix(web): stop the story grids and the stats from-state widening the page` (layout item 6;
#46 hero-1 and hero-v1; rows R10 and R11).

**Files:**

- Modify: `execution-phase.tsx`, `strategy-phase.tsx`, `discovery-phase.tsx` in
  `apps/web/src/components/animated-hero/`
- Modify: `apps/web/e2e/mobile/layout-overflow.spec.ts`, `apps/web/e2e/layout-overflow.spec.ts`
- Test: `apps/web/src/components/animated-hero/__tests__/story-phases.test.tsx`
- Modify: `.claude/epics/audit-remediation-2026-09/46.md`. `43.md` holds the manifest rows but
  records no fixes; fixes are recorded in the fixing task's file, as `50.md` does, so R10, R11 and
  AC 10 are noted under #46's acceptance criteria (AC 10 ticked; AC 7 and AC 9 partly done, with
  what is left)

- [x] **Step 1:** The three `grid gap-8 md:grid-cols-2` grids become
      `grid grid-cols-1 gap-8 md:grid-cols-2`: Tailwind v4's `grid-cols-1` is `minmax(0,1fr)`, the
      fix measured to remove the horizontal pan at 320, 375 and 390 px.
- [x] **Step 2:** Execution's code sample scrolls in a named, keyboard-reachable region: its
      `pre` gets `tabIndex={0}`, `role="region"`, `aria-label="ErrorAnalyzer source"` and
      `focus-ring overflow-x-auto text-xs leading-relaxed sm:text-sm`. The gate disables
      `scrollable-region-focusable`, so axe would not catch a scroller nobody can reach. Check that
      `.focus-ring`'s 2 px offset is not clipped by the Terminal's `overflow-hidden`; if it is, add
      `focus-visible:-outline-offset-2`. It is not: the `pre` sits in the Terminal's `p-4` body, so
      the 4 px the outline reaches is inside 16 px of padding. The metric label column is
      `w-20 shrink-0 sm:w-24`.
- [x] **Step 3:** The Execution stats reveal starts from `{ opacity: 0, y: 20 }` instead of
      `{ opacity: 0, x: 30 }` (#46 hero-v1). R10 walks the story with motion allowed, so the
      `x: 30` from-state comes back on the way up and leaves 6 px of overflow.
- [x] **Step 4:** Before deleting the expected-failure annotations, run R10 on `mobile-safari`
      (WebKit): the fix was measured in Chromium only. If WebKit still overflows, keep an expected
      failure for it alone (`test.fail(browserName === 'webkit', …)`). It does not: R10 passed on
      both phone projects at all three widths, so both annotations go.
- [x] **Step 5:** Delete the `test.fail()` annotations for R10 (phone) and R11 (desktop) and reword
      each file's header comment, which calls the row RED; add 820 to `DESKTOP_WIDTHS` (#46 AC9);
      add #46 AC8's checks at 320 px to the phone spec: the `pre` lies inside the viewport and
      scrolls (`scrollWidth > clientWidth`) with `tabindex="0"` and a non-empty accessible name; the
      TIME ELAPSED and commit-streak values end at or before x = 320; every `.tech-item` has
      `scrollWidth <= clientWidth`; the three loop stat cells fit their boxes.
- [x] **Step 6:** #46 AC10 in `story-phases.test.tsx`: spy on `fromTo` (and `from`, on `gsap` and on
      the timeline prototype) across every phase and its timer-driven reveals, and assert that no
      from-state has a positive `x`. It fails with the stats panel's `x: 30`.
- [x] **Step 7:** Verify: `git grep -n "R10, #46\|R11, #46" apps/web` prints nothing; both
      `layout-overflow` specs, `story`, `gsap-lazy`, `accessibility` and `mobile/accessibility` in
      CI mode on all three projects; the `story-phases` unit file.

**Rules.** Opacity still starts at 0 and ends at 1, never partial. The reduced-motion path is
untouched. The `gsap-css-conflicts` guard still passes. No `overflow-x: clip` safety net.

---

### Task 7: Fit the hero island to phone widths

Commit: `fix(web): fit the hero island to phone widths` (layout item 2).

**Files:**

- Modify: `apps/web/src/components/animated-hero/hero-content.tsx`
- Modify: `apps/web/e2e/mobile/layout-overflow.spec.ts`,
  `.claude/epics/audit-remediation-2026-09/46.md` (AC 8 ticked)

- [x] **Step 1:** The island takes `px-5 py-8 sm:px-12 sm:py-10` in place of its inline `padding`
      (both `backdropFilter` lines stay); below `sm` the player-card rows are a
      `grid-cols-[56px_minmax(0,1fr)] items-baseline gap-x-3` grid with `min-w-0` and a 1.45 line
      height on their values; the card's margin is `mb-6 sm:mb-8`, the tags' `mt-5 sm:mt-6`. The
      grid is gated with `max-sm:` rather than replacing the rows' `flex justify-between` at every
      width as first planned: the layout verifier measured it below `sm` only, and at every width it
      would move the desktop card's values from the right edge to the left, which nothing measured
      or approved. From `sm` the card is unchanged.
- [x] **Step 2:** The `h1` gets `text-balance`, and its first line's `whiteSpace: 'nowrap'` becomes
      `sm:whitespace-nowrap` (an inline style beats the class). The font size stays
      `clamp(30px, 5.5vw, 50px)`; the patch's `8vw` would change tablets (+15 px at 640 px). The
      subtitle is `text-[15px] sm:text-base` with its inline `fontSize` removed.
- [x] **Step 3:** #46 AC8's last clause in the phone spec at 320 px: the box of a `Range` over the
      `h1`'s contents lies inside the hero island's box. It failed before this task (the headline
      started at x = 0.3, the island's content at 16) on both phone projects.
- [x] **Step 4:** Verify: `served-html`, `hero-contrast`, both axe gates and the dimmed-text scanner
      stay green; screenshots at 320, 375, 412, 640, 768 and 1280 px, light and dark, are part of
      the set under "Last".

**Measured:** the LCP element stays the `h1` (6 runs), which paints in the same first frame; CLS 0;
at 320 px the headline spans x 88.5–231.5, inside the island at 24–296.

**Rules.** HeroContent stays a server component. No colour change: #47 hero-2 owns the tag colours.

---

### Task 8: Load GSAP on the visitor's first intent

Commit: `perf(web): load GSAP on the visitor's first intent instead of at idle`.

**Files:**

- Modify: `apps/web/src/components/animated-hero/load-gsap.ts`, `use-with-gsap.ts`, `index.tsx`,
  `gsap-runtime.ts`
- Modify: `apps/web/e2e/support/gsap.ts`, `apps/web/e2e/gsap-lazy.spec.ts`
- Create: `apps/web/e2e/mobile/gsap-intent.spec.ts`
- Test: `load-gsap.test.ts`, `lazy-gsap.test.tsx`, `lazy-gsap-failure.test.tsx`,
  `gauntlet-phase.test.tsx`, `loop-phase.test.tsx`, `story-phases.test.tsx` and
  `hud-elements.test.tsx`, in `apps/web/src/components/animated-hero/__tests__/`
- Modify: the "arrives when the browser is idle" comments in `e2e/console-clean.spec.ts`,
  `e2e/hero-contrast.spec.ts`, `e2e/layout-overflow.spec.ts` and `e2e/reduced-motion.spec.ts`, and
  the GSAP wait comments in `e2e/accessibility.spec.ts`, `e2e/mobile/accessibility.spec.ts` and
  `e2e/mobile/layout-overflow.spec.ts`
- Create: `docs/adr/0024-gsap-loads-on-first-intent.md`. Planned as 0023, but open pull request
  #120 had already taken 0023 when the number was picked, last, as the ADR index asks.
- Modify: `docs/adr/0022-no-boot-loader.md`, `docs/adr/README.md`, `docs/drift-manifest.json`,
  `CLAUDE.md`

- [x] **Step 1:** `load-gsap.ts`: delete `IDLE_TIMEOUT_MS` and `NO_IDLE_CALLBACK_DELAY_MS`; replace
      `whenIdle` with a memoised `whenIntent()` that resolves on the first `scroll`, `wheel`,
      `touchstart`, `pointerdown` or `keydown` on `window` (capture, passive; exported as
      `INTENT_EVENTS`), or at once when `window.scrollY > 0` at the moment it is armed (a restored
      position, a deep link, a soft navigation back); it removes every listener on first use, and
      on the server, with no `window`, it never resolves. Export `requestGsap()`, which resolves the
      intent, starts the load and returns the load promise, already handled so a caller may ignore
      it. No idle or timer fallback, and no IntersectionObserver near the first phase: that phase
      starts 73 px below the fold at 412×823, so any positive root margin fires at load and brings
      GSAP back into the window Lighthouse measures. Rewrite the header comment and the `loadGsap`
      doc.
- [x] **Step 2:** `use-with-gsap.ts`: `withGsap` calls `requestGsap()` before `runWithGsap(…)`, since
      an event handler asking for GSAP is itself intent; hovers keep working under reduced motion.
      Effects keep calling `runWithGsap` and wait for intent. `index.tsx` and `gsap-runtime.ts`:
      comments only.
- [x] **Step 3:** `e2e/support/gsap.ts`: drop the `IDLE_TIMEOUT_MS` import; the settle timeout is
      `LOAD_TIMEOUT_MS + 2_000`; before waiting, `expectGsapLoaded` sends a synthetic `scroll` on
      `window` through a new export, `sendIntent`. A trusted key press would put Chromium into
      keyboard modality and change `:focus-visible` for the rest of the test, so the comment says
      why a synthetic scroll is used. `gsap-lazy.spec.ts`'s failure test sends the same intent
      before waiting for the failure mark.
- [x] **Step 4:** Unit tests. `load-gsap.test.ts`: the idle-trigger tests become intent tests
      (nothing is fetched before intent, even after 10 s of fake time; each of the five events
      starts exactly one fetch; `scrollY > 0` when armed starts it at once without listening;
      `requestGsap()` starts it at once, armed or not; the listeners are gone after the first
      intent; nothing starts on the server); the other describes only swap the idle wait for an
      intent event. `lazy-gsap.test.tsx` gains a first step, nothing loads while ten seconds pass
      with no intent, and its walk now shows that a hover before any scroll plays once GSAP
      arrives: the walk's first hover is the intent that starts the load, and no scroll, wheel,
      touch or key is ever sent, so it no longer advances by `NO_IDLE_CALLBACK_DELAY_MS` and keeps
      every assertion (the `requestIdleCallback` precondition becomes "the page is at the top").
      `lazy-gsap-failure.test.tsx` sends a scroll to start the load, keeping every assertion. The
      four files that `await loadGsap()` in `beforeAll` (`gauntlet-phase`, `loop-phase`,
      `story-phases`, `hud-elements`) await `requestGsap()` instead, with their comments updated:
      under `whenIntent` with no fallback, `loadGsap()` alone never resolves in jsdom.
- [x] **Step 5:** e2e. `gsap-lazy.spec.ts` gains: with no input for 3 s after hydration no script
      carrying GSAP is requested and no mark is set, and after a `mouse.wheel` GSAP loads; an
      ArrowDown key press loads it; a reload at a restored scroll position loads it with no further
      input; and before any intent, axe with the gate's rule set finds 0 violations on `/` in both
      schemes, above the at-rest node floor. A new phone spec runs the "no input, no GSAP" check
      (with a tap as the intent) and the before-intent axe check under both phone projects, since
      Lighthouse scores the page before any input at 412 px. The axe passes hold the GSAP chunk
      while they run, so nothing the audit does can bring GSAP in under it. Incomplete
      colour-contrast nodes before intent, recorded and not gated: 146 on the desktop in both
      schemes, 70 on both phone projects. The IN_VIEW tests stay unchanged.
- [x] **Step 6:** ADR 0024, "GSAP loads on the visitor's first intent", in MADR order, `Proposed`
      until the pull request is ready to merge. Context: the evidence below. Alternatives: idle
      (before); after the first contentful paint (still inside Lighthouse's TBT window); an
      IntersectionObserver near the first phase (rejected above); a timer fallback; per-phase
      proximity builds (deferred). It supersedes ADR 0022 in part: 0022's status becomes
      `Superseded by ADR-0024`, with the pointer line "No longer applies: the clause of the fourth
      Decision bullet saying `load-gsap.ts` fetches GSAP once the browser is idle after hydration;
      the rest of its decision stands." (the 0002, 0004 and 0005 precedent). `docs/adr/README.md`:
      the new row, 0022's status cell, and the paragraph on partial supersessions.
      `docs/drift-manifest.json`: entries for the new record's links, its index row, the pointer
      line's link, and both 0022 status entries (`adr-index-0022-status` and
      `adr-index-0022-cell-status`) in the same commit, or the drift check fails.
- [x] **Step 7:** CLAUDE.md: "once the browser is idle after hydration" becomes the new trigger,
      and the e2e helper bullet says the helper sends that intent. Check the wording against the
      new source first.
- [x] **Step 8:** Verify: the unit suite; the whole e2e suite in CI mode (ten specs go through the
      helper); the drift check.

**Depends on #122.** The first full e2e run of this task failed `client-navigation.spec.ts` ("walks
/ to /work to a case study and back by link clicks") 6 of 6 times at load 5, on GSAP's
`Invalid scope` and null-target warnings. That is the race #122 fixes: a soft navigation away from
`/` just after GSAP arrives, which fails about 1 run in 10 on `main`. Here the click that navigates
away is itself the intent that starts the load, so GSAP lands in that window every time. The branch
carries #122's two commits, cherry-picked unchanged (`git cherry-pick -x`), just before this task;
merge #122 first, and they drop out when this branch is rebased onto `main`.

**Why.** JavaScript investigation (CPU-normalised, 4 runs): this task alone takes JS-only blocking
222 → 177 ms, and with Task 1 TBT 257 → 118 ms. Rendering investigation (GSAP chunk blocked, 5 runs,
one outlier excluded, load 4–57): TBT 375 → 234 ms, Speed Index 2702 → 2460 ms. GSAP drops out of
the Lantern graph in every run. Visitors who never interact never download the 44 KB, and
ScrollTrigger's permanent rAF loop never starts for them (208 ms/s at 4× CPU). At this task's
checkpoint, take 5 interleaved runs and report TBT per run and whether the document task split.

**Rules.** ADR 0022: no boot loader. ADR 0009 rule 4: the phases stay static and server-rendered;
only the fetch moves. GSAP is still reached only through `import()` in `load-gsap.ts`; the ESLint
rule and its test are unchanged. The from-state rule and reduced motion are unchanged. ADR 0012: a
partial supersession with a pointer line.

---

### Task 9: Build the story's timelines one task at a time

Commit: `perf(web): build the story's timelines one task at a time when GSAP arrives`.

**Files:**

- Modify: `apps/web/src/components/animated-hero/load-gsap.ts`, `apps/web/e2e/support/gsap.ts`,
  `docs/adr/0024-gsap-loads-on-first-intent.md`
- Test: `apps/web/src/components/animated-hero/__tests__/load-gsap.test.ts`,
  `lazy-gsap.test.tsx` (its walk fakes `setTimeout`, so it advances the drain's timers)

- [x] **Step 1:** `arrived` becomes an asynchronous drain: `runtime` stays unset until the queue is
      empty; each waiting callback runs, then the drain yields (`scheduler.yield()` where it exists,
      `setTimeout(0)` otherwise); callbacks queued during the drain join the queue in order;
      `runtime` and the loaded mark are set after the last callback. Update the docs on the mark,
      on `runWithGsap`'s ordering promise ("synchronously" applies once the queue has drained), and
      in `e2e/support/gsap.ts`.
- [x] **Step 2:** Tests (`runWithGsap`): callbacks run in order across tasks, and under fake timers
      only the first has run until the timers advance; a callback queued during the drain runs after
      those queued before it; the mark is set once, after the last callback; a callback that throws
      does not stop the rest. The gsap-lazy IN_VIEW tests stay green.
- [x] **Step 3:** Record the drain in ADR 0024's Decision (it is not yet accepted).
- [x] **Step 4:** Verify: the unit suite (the two drain tests fail against the synchronous
      `arrived`), and `gsap-lazy`, `story`, `console-clean`, `client-navigation`, `reduced-motion`,
      `hero-contrast` and `mobile/gsap-intent` in CI mode. The whole suite runs under "Last".

**Why.** With GSAP still loading at idle (4 runs), GSAP's blocking fell from 60–117 ms to about 0
(largest piece 45 ms simulated) and TBT 213 → 154 ms. After Task 8 Lighthouse no longer sees GSAP;
the arrival task (28–38 ms of CPU here, roughly 4× on a Moto G-class phone) moves into the
visitor's first scroll, and this task breaks it up.

---

### Last: the full gates

- [x] Screenshots, before and after, of the hero, Strategy, Execution, Loop and GameComplete at
      320, 375, 412, 640, 768 and 1280 px in light and dark, for the pull request and
      `ui-reviewer`.
- [x] Every gate CI runs and a production build, then the whole e2e suite in CI mode and in dev
      mode, one at a time:

```bash
pnpm check:allowbuilds && pnpm test:scripts && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
CI=true PLAYWRIGHT_PORT=3212 pnpm --filter web test:e2e --retries=0
PLAYWRIGHT_PORT=3212 pnpm --filter web test:e2e --retries=0
```

- [ ] The stop condition at the top, then the pull request (title
      `perf(web): raise the mobile Lighthouse score of / and fit the story to phone widths`, or two
      pull requests, see below): the template checklist with real output, the stop-condition table
      with per-run values and load, `Refs #46` (never a closing keyword: GitHub ignores negation),
      the review triage (`ui-reviewer` over the components, `adversarial-reviewer`,
      `edge-case-hunter`), the screenshots, and the questions under "For the owner to confirm".
      The index row moves to `In review` when the pull request opens and to `Shipped` only after
      the merge. Never merge without the owner.

---

## If the relative gate fails

1. **Measure again before changing code:** 7 interleaved pairs at a load of 5 or less, re-simulated
   from CPU time, and replayed at fixed cutoffs, to see which metric is short.
2. **Investigate LCP when the branch median is above 2.80 s, and TBT when it is above 140 ms,** or
   when a run's pair falls outside the scoring table above (at LCP 2.85 s, TBT would have to be at
   or below 112 ms). For LCP, list the requests that start before the observed cutoff in the branch
   traces. For TBT, check whether the document's first-layout task split across FCP (+87 ms in 7 of
   32 runs).
3. The levers left are all owner decisions (below, items 1 and 4). Do not relax the stop condition.
4. After three attempts, stop and report the measured numbers.

## Layout-patch items not applied

| Item                                   | Decision        | Reason                                                                                                                                                                                                          |
| -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 (PipelineStage `w-24 sm:w-28`)      | Rejected        | No defect: every pipeline row fits at 320, 375 and 390 px (238/238, 293/293, 308/308). The patch also names the wrong file; the span is in `hud-elements.tsx`.                                                  |
| 12 (`html, body { overflow-x: clip }`) | Rejected        | It hides the defect instead of fixing it: the Terminal and BUILD STATS would still reach x = 396.8 and stay clipped. It also makes `documentElement.scrollWidth` equal `clientWidth`, which blinds R10 and R11. |
| 11 (ProjectCard `p-4 sm:p-6`)          | Needs the owner | A design choice with no overflow: the cards measure 271/270 at 320 px.                                                                                                                                          |
| 8, the 10 px labels                    | Rejected        | Adds text below 12 px for no measured defect; the labels just wrap.                                                                                                                                             |
| 7, the "11 px" SVG labels              | Rejected        | They are in viewBox units, so they render at about 8.7 px anyway and nothing gets more legible.                                                                                                                 |
| 2, `clamp(26px, 8vw, 50px)`            | Replaced        | It changes tablets (+15 px at 640 px); `clamp(30px, 5.5vw, 50px)` is kept instead.                                                                                                                              |
| 3, `py-20 sm:py-24`                    | Rejected        | Its rationale is wrong (the sticky header never covers the card) and it pushes the skill tags below the fold. The verifier's `py-6` is not adopted either, because it was never measured.                       |
| 6, `overflow-x-auto` alone             | Replaced        | The overflow never engages without the grid-track fix; Task 6 does the real fix.                                                                                                                                |

## Owner decisions (not in this plan)

1. **No TmuxBackground on phones.** A visible design change. TBT about 0 (182 vs 178 ms JS-only
   blocking), about −150 ms of rendering CPU per 5 s on phones, and 74 fewer served elements (these
   estimates assumed phones would not be served the background; the note below says what the built
   change delivers). After Task 4 only one pane shows anyway.
   - **2026-09-25: built** on the branch `perf/phone-hero-and-font-axis`, at Task 4's phone width,
     below `md`: the background's root is `hidden md:flex`, and its clock and log ticks start only
     while `(min-width: 48rem)` matches, in effects. The page is prerendered once for every width,
     so the background is still served and hydrated: the page chunk, the served elements and the
     hydration work do not shrink. What phones lose is its layout, paint and ticks.
   - **2026-09-25: measured** with the font cut of the next section, both on the one branch, in 12
     interleaved mobile Lighthouse pairs against `main` at `0781e6d` (medians, `main` then branch):
     LCP 2,907 → 2,757 ms, lower in every pair; FCP 1,024 → 984.5 ms; main-thread work 1,550 →
     1,364.5 ms; long-task time 517.5 → 531.5 ms; bytes requested before first paint 258.3 →
     245.3 KB; CLS 0 on both. TBT rose from 145.5 to 217 ms, and the score fell from 94 to 92.
     TBT is bimodal on both sides, about 145 or about 220 ms: the high runs are the ones where the
     first long task on `/` splits in two, 4 of 12 on `main` and 7 of 12 on the branch, while the
     long tasks themselves stay the same size. Why the branch splits it more often is not
     established.
2. **A smaller hero-card blur below `sm`, or stopping the `hero-breathe` glow.** GPU only: the
   card's blur is about half of the GPU main-thread time at rest. No Lighthouse effect.
3. **Pausing decorative animations while they are off screen.** This is #47 hero-4; leave it there.
4. **AnimatedText splitting into characters only on hover.** Up to 279 fewer single-character spans
   (19% of the served elements), which shrinks the first layout (TBT noise of 0–90 ms). #47 hero-3
   and hero-8 redesign the same component, so decide it with #47.
5. **Replacing the fallback glyphs** ⬤ ⚡ (tmux) and ✓ ○ (HUD elements), plus the story emojis.
   25–31 ms of first-layout time unthrottled on macOS, no change to Lighthouse LCP, a visible glyph
   change.
6. **Layout item 11:** the featured-work card padding.

The manifest and icon requests at load are not a lever: removing them replayed at −105 ms of LCP
locally over HTTP/1.1, and at 0 (within ±8 ms) over HTTP/2 and on the production traces.

## For the owner to confirm

1. **Task 8 changes what a visitor sees on their first scroll.**
   - Most phone visitors reach Discovery with their first flick before the 44 KB arrives, so
     `isAlreadyReached` finishes Discovery at once and skips its entrance, rather than animating
     it. The IN_VIEW tests guard that nothing is ever hidden.
   - The three R16 headlines, which the server renders at `opacity-0` (still an expected failure in
     `served-html.spec.ts`), stay blank until GSAP arrives, which is now after the first intent
     rather than at idle.
   - Visitors who never scroll, tap or press a key never download GSAP.
   - Lighthouse's accessibility audit now scores the page as it looks before GSAP. The new
     before-intent axe tests cover that; the pull request reports the incomplete count.
2. **One pull request or two.** The critique recommends splitting the work: performance (Tasks 0–3,
   8, 9 and ADR 0024) and phone layout (Tasks 4–7, `Refs #46`), because the performance stop
   condition would otherwise hold back layout fixes that have no performance effect, and the
   overlap with #47, #118 and #119 grows with the size. Task 9 affects only the first scroll of real
   visitors and could also go alone. The commits are self-contained, so the split can be made when
   the pull requests are opened.
3. **The #46 split:** Tasks 5–7 resolve #46's hero-1 and hero-v1 (R10, R11, AC7–AC10). pages-1,
   pages-4 and pages-20 (R1–R9, the mobile menu) stay with #46, even though #46 says it lands as
   one pull request.
4. **#46's two open design questions, as the approved patch list answers them:** the Execution code
   sample scrolls, in a named, focusable region, rather than wrapping; the headline wraps below
   640 px, so it takes three lines on phones.
5. **The stats reveal starts from `y: 20`** instead of `x: 30`. #46 hero-v1 offers `y: 20` or
   `x: -30`.

## Deliberately not in this plan

- **Font weight-axis cut to 400–900.** −13.1 KB with outlines identical to today (only U+00A4 moves,
  by at most 0.4 units), but it replayed at 0 ms of LCP after Tasks 2–3, even at ×0.54 of the bytes.
  A real saving for visitors and a good follow-up; it must regenerate #118's mono mark file. Not
  400–800: that changes 42–80 advance widths.
  - **2026-09-25: built** on the branch `perf/phone-hero-and-font-axis`: −6,972 bytes on the sans
    file and −6,312 on the mono file, 13,284 in all. Measured again, U+00A4 moves by up to 0.5
    units, at 900. The instancer keeps the `maxp` values, because recomputing them changed a few
    pixels of weight-400 text in Chromium; with them kept, `/` and a case study render with no
    differing pixel. The mark file regenerates byte for byte, so it is unchanged.
- **ASCII-only font subsets** (a further −12.2 KB): no LCP effect either, and they narrow future
  glyph coverage.
- **`content-visibility: auto` on the phases:** with Task 1 it made TBT worse (213 → 267 ms), with
  GSAP deferred it gave no LCP gain, and it puts the axe node floors at risk.
- **Paint-path candidates** (no blur, no animation, `content-visibility`, theme first): none beat
  the baseline's LCP, and theme first made real FCP worse.
- **Removing the font preloads:** FCP 1257 → 1377 ms, because Lantern then treats the fonts as
  render-blocking.
- **Legacy and unused JavaScript:** Next's 1.4 KB polyfill module and code inside `react-dom`.
  Neither is actionable.
- **The forced-reflow insight:** a cross-thread false positive, with weight 0.
- **An "after first paint" gate:** Task 8 covers it for GSAP, and Tasks 2–3 for the prefetch and
  tmux.
- **tmux tick recycling and fewer panes:** runtime jank and battery only; Task 4 already shows one
  pane on phones.
- **Separate forced-read cleanups** in the Strategy phase and the section progress: 1–3 ms each, no
  effect on any metric.

## Coordination

On 2026-09-24 all of #118, #119, #120, #122 and #124 have merged. The branch is rebased onto
`a3d97f9`, #122's two cherry-picked commits dropped out in the rebase, and the baseline was rebuilt
at `a3d97f9`. The notes below are as written before those merges.

- **#118** (brand logo, open) changes `lib/brand-mark.tsx` and adds a Logo in Geist Mono semibold,
  drawn from the variable mono file that is already preloaded, plus a four-cycle blink. `main`
  already has `app/icon.tsx`, `app/apple-icon.tsx` and `favicon.ico`, so #118 adds no request at
  load and its LCP risk is low. It rewrites the logo `Link` that Task 2 edits (keep its
  `aria-label`, its `<Logo/>` and the `prefetch` prop) and edits `CLAUDE.md`. If it merges first,
  rebuild the baseline, because it changes `navigation.tsx` and the CSS.
- **#122** (GSAP scope on a soft navigation, open) must merge before this plan: Task 8 depends on
  its fix, and the branch carries its two commits until then (see Task 8).
- **#120** (security headers, open) took ADR number 0023, so this plan's record is 0024.
- **#119** (case-study copy) changes `case-studies.ts`, which feeds the page chunk and the RSC
  payload. If it merges first, rebuild the baseline.
- **#46:** see "For the owner to confirm", item 3. Reference it with `Refs #46`.
- **#47** (hero accessibility and motion, open) overlaps `hero-content.tsx`, `hero-section.tsx`,
  `animated-text.tsx` and the gauntlet. Whichever pull request lands second rebases. Its hero-2
  owns the tag colours in `hero-content.tsx`.
