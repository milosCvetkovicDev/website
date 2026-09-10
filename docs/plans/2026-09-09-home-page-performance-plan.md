# Home page performance plan: CLS and TBT

> **For agentic workers:** REQUIRED SUB-SKILL: Use `performance-optimization` (measure, change one thing, re-measure, keep or revert) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the home page's Lighthouse performance to CLS below 0.1 and TBT below 600 ms under the settings the baseline was taken with (Lighthouse 13.4.1 CLI, default mobile emulation, simulated throttling, 4× CPU slowdown), keep LCP under 2.5 s where achievable, and change nothing visible.

**Design:** This plan carries its own rationale. The decisions are in the table below; the ones that other code must keep following are recorded in [ADR 0009](../adr/0009-animation-performance-rules.md).

**Branch:** `perf/home-page-cls-and-tbt` (from `main` at `a8b4a91`).

**Stop condition for the whole PR (all must hold):**

```bash
pnpm --filter web build && (cd apps/web && pnpm exec next start -p 3100 &)
# from apps/web, CHROME_PATH pointing at Playwright's chromium:
pnpm dlx lighthouse http://localhost:3100/ --output=json --output-path=/tmp/lh-after.json \
  --only-categories=performance --chrome-flags="--headless=new"
# .audits.metrics.details.items[0]: cumulativeLayoutShift < 0.1, totalBlockingTime < 600
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
pnpm --filter web test:e2e                                                     # all passed
```

## Baseline

The numbers that opened this work were taken on 2026-09-09 against the first production build on
Vercel: performance 24, LCP 4.6 s, FCP 2.7 s, CLS 0.345, TBT 2,160 ms, with three layout shifts
attributed to `div.flex > div.flex > div.relative > div.absolute` inside the hero. They did not
reproduce on an otherwise idle machine on the same day: the same command against the same Vercel
deployment gave performance 83, LCP 2.2 s, CLS 0.034, TBT 635 ms, and against a local production
build (three runs) performance 88 to 92, LCP 2.6 to 2.7 s, CLS 0.006 to 0.037, TBT 230 to 354 ms.
The original run was most likely taken under CPU contention with a longer trace, which multiplies
every per-frame cost. The causes are the same in every trace, and they are what this plan fixes:

| Finding                                                                                                                                                                  | Evidence in the trace                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every tmux log line appended to a bottom-anchored container moves the whole container up one line. Each move is a layout shift; they accumulate for the life of the tab. | `LayoutShift` events every 200 to 400 ms on the pane containers, `[165,809,80,14] -> [165,786,80,37]` and so on, 0.0002 to 0.001 each, growing.      |
| All six story sections mount in one React commit as soon as their lazy chunks arrive, and their GSAP setup forces layout from inside that commit.                        | One 135 ms task (540 ms at 4×) at 660 ms: `FunctionCall` 135 ms containing `Layout` 56 ms and `UpdateLayoutTree` 41 ms, 54 ms of it forced by GSAP.  |
| The page renders a frame every 16 ms forever: two keyframe animations animate `top`, which is a layout property, so the main thread lays out and paints at 60 fps.       | 30 `Layout`, 30 `UpdateLayoutTree` and 30 `Commit` events per 500 ms bucket after load.                                                              |
| About 290 character spans in the story sections carry `will-change: transform, opacity`, so each is a compositing layer and every frame pays to re-layerize them.        | `Layerize` rises from 0.25 ms per frame before the sections mount to 1.3 ms per frame after, 37 to 42 ms per 500 ms.                                 |
| `layout.tsx` imports its client components through the `@/components` barrel, which pulls `FeaturedWork` and its data into the layout chunk that every route loads.      | `/work/self-healing-agent` loads the 27.7 KB chunk containing `VIEW ARCHIVE` and the architecture graph although it renders neither.                 |
| The first layout of the page costs 43 ms for 535 layout objects.                                                                                                         | First `Layout` event at 111 ms. Consistent with instantiating the two web fonts on first use. Not actionable without changing the fonts; left as is. |

## Decisions

| #   | Decision                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Each tmux pane renders a fixed grid of line slots sized to the pane and rotates text through them, newest at the bottom. No element is appended or removed on a tick.                                                                           | Text changes inside boxes that do not move are not layout shifts. Appending to a bottom-anchored container was the whole of the hero's CLS. The look is identical: lines still arrive at the bottom and scroll up.                                             |
| D2  | Keyframes animate only `transform` and `opacity`. `hero-scroll-bounce` and `scan-down` move to `translateY`; the scan line becomes a full-height element with a 1px gradient.                                                                   | A `top` animation forces style, layout and paint on every frame for as long as it runs. The transform versions produce the same pixels on the compositor.                                                                                                      |
| D3  | No static `will-change` on the animated-text character spans.                                                                                                                                                                                   | It promoted about 290 spans to compositing layers on a page that already re-composites constantly. GSAP promotes elements for the duration of a tween on its own.                                                                                              |
| D4  | Story sections stay server-rendered and hydrate when they approach the viewport (a Suspense boundary held dehydrated until an IntersectionObserver fires); their chunks are prefetched on the first sign of intent or after a few idle seconds. | Mounting all six at load was the largest task in the trace and none of them is visible at load. Keeping the markup keeps crawlers, assistive technology, find-in-page and print whole; the first version rendered placeholders instead and review rejected it. |
| D5  | `layout.tsx` imports `ThemeProvider`, `Navigation`, `Footer` and the JSON-LD components from their own modules, not from the barrel.                                                                                                            | Client modules reachable from a server component's import graph are bundled into that layout's client chunk whether rendered or not. The barrel stays for pages; the layout is the one place where its cost is paid on every route.                            |

## Tasks

### Task 1: Shift-free tmux log lines (D1)

**Files:** `apps/web/src/components/animated-hero/tmux-background.tsx`, `apps/web/src/components/animated-hero/__tests__/tmux-background.test.tsx`

- [x] Replace `AnimatedPane`'s append-and-trim container with a fixed slot grid sized by `ResizeObserver`, text rotated on each tick, newest slot animated with `element.animate` (opacity and transform only).
- [x] Unit test: slots keep their count across ticks, the newest text lands in the last slot, earlier text moves up.
- [x] Re-measure: no `LayoutShift` events on the pane containers in the trace.

### Task 2: Compositor-only keyframes and no static will-change (D2, D3)

**Files:** `apps/web/src/app/globals.css`, `apps/web/src/components/animated-hero/index.tsx`, `apps/web/src/components/animated-hero/hero-section.tsx`, `apps/web/src/components/animated-hero/animated-text.tsx`, `apps/web/src/components/featured-work.tsx`

- [x] `hero-scroll-bounce` animates `translateY(0 -> 13px)` with the dot's `top: 7px` static.
- [x] `scan-down` animates `translateY(-2px -> 100%)` on a full-height `.scan-line` element whose 1px gradient is a background image; both call sites (boot loader, featured work cards) use it.
- [x] Remove `gpuAcceleratedStyle` from `animated-text.tsx`.
- [x] Re-measure: `Layout` per 500 ms dropped from 30 to 2 to 8 (tmux ticks), `Layerize` from 37 to 42 ms to 1 to 3 ms. Style recalcs stay at 60 per second while the scroll dot animates; see the ADR trade-offs.

### Task 3: Mount story sections on approach (D4)

**Files:** `apps/web/src/components/animated-hero/index.tsx`

- [x] `DeferredSection` (`deferred-section.tsx`) server-renders each phase and suspends its Suspense boundary during hydration until an `IntersectionObserver` (top-only root margin, so anything already scrolled past counts) reports it near the viewport; then the lazy phase hydrates. No `IntersectionObserver` means hydrate after the page has hydrated. A failed chunk falls back to the placeholder instead of `error.tsx`.
- [x] Prefetch the six phase modules once (`use-prefetch-phases.ts`): on the first pointer, touch, key or scroll event, armed one second after hydration, or after 3 s idle (`requestIdleCallback` with a timeout fallback), never under Data Saver. Idle-only prefetch was measured first and rejected: it evaluated the shared GSAP chunk (33 ms observed, 132 ms at 4×) at 0.7 s, inside the window Lighthouse scores.
- [x] Re-measure: the long task at phase mount is gone from the load trace; TBT below 600 ms with margin.

### Task 4: Keep FeaturedWork out of the layout chunk (D5)

**Files:** `apps/web/src/app/layout.tsx`, `CLAUDE.md`

- [x] Direct imports in `layout.tsx`; note the rule next to the barrel convention in `CLAUDE.md`.
- [x] Re-measure `/work/self-healing-agent`: the chunk containing `VIEW ARCHIVE` is no longer in its script list.

### Task 5: Guards

**Files:** `apps/web/e2e/hero.spec.ts`

- [x] e2e: observe `layout-shift` entries for four seconds of log activity and assert the summed value stays under 0.005 (and that lines did land); assert the section copy is in the HTML response; scroll through the whole story programmatically and assert the summed shift stays under 0.02.
- [x] Existing e2e and unit suites green: 56 unit tests, 13 e2e against the branch build; the new shift guard fails against `main` (0.015), so it is a real guard.

### Task 6: Verification and review

- [x] Playwright screenshots of the hero in light, dark and mobile (375×812) before and after; visually identical.
- [x] `ui-reviewer` on the changed components, `adversarial-reviewer` on the diff, `edge-case-hunter` on the changed files; 38 findings triaged in the PR as fixed, rejected with the reason, or deferred. The largest one, the sections leaving the server HTML, reshaped D4.
- [x] Full gate: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` and `pnpm --filter web test:e2e`, run with `--force` so Turbo does not replay another checkout's cache.

### Task 7: Documentation

- [x] `docs/runbooks/deploy.md`: Lighthouse baseline paragraph with before and after numbers.
- [x] `docs/adr/0009-animation-performance-rules.md` plus the index row; index row for this plan in `docs/plans/README.md`.

### Task 8: Pull request

- [x] Conventional commits on `perf/home-page-cls-and-tbt`, PR #15 against `main` using the template with the real command output; squash merge is the remaining step.

## Ledger

Every attempt, kept or not, so the next person does not re-run a dead one.

| Attempt                                           | Before                                                                                   | After                                                                                                                                                                                                                  | Verdict                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| D1 tmux slots                                     | 11 to 19 `LayoutShift` events on the pane containers per 3 s trace; CLS 0.006 to 0.037   | 0 pane shifts; CLS 0 in 11 of 12 runs, 0.034 once (Lighthouse's own viewport change)                                                                                                                                   | kept                                     |
| D2 + D3 compositor-only keyframes, no will-change | `Layout` 30 and `Layerize` 30 per 500 ms, 1.3 ms each; `Layerize` 37 to 42 ms per 500 ms | `Layout` 2 to 8 per 500 ms; `Layerize` 1 to 3 ms per 500 ms                                                                                                                                                            | kept                                     |
| D4 mount on approach, prefetch at idle            | 135 ms task at 660 ms (phase mount + GSAP forced layout); TBT 230 to 354 ms              | task gone; GSAP chunk eval 33 ms at 0.7 s instead; TBT 68 to 713 ms (machine loaded, bench 715)                                                                                                                        | superseded by the intent-based prefetch  |
| D4 mount on approach, prefetch on intent or 3 s   | as above                                                                                 | interleaved with main, bench 1,600 to 1,900: TBT 70 to 76 ms vs 217 to 468 ms; perf 96 vs 84 to 93                                                                                                                     | kept                                     |
| D4 with placeholders instead of server HTML       | sections in the HTML response on main                                                    | six empty 100vh blocks in the HTML; LinkedIn CTA unreachable by keyboard until scrolled                                                                                                                                | rejected in review; replaced by the gate |
| D4 hydration gate (server HTML kept)              | as above                                                                                 | interleaved with main on a quiet machine (bench 2,061 to 2,160): perf 96 vs 92 to 93, TBT 86 to 87 vs 194 to 256 ms, SI 1.06 vs 1.53 s, LCP 2.61 s both; section copy back in the HTML                                 | kept                                     |
| D5 layout imports                                 | `/work/[slug]` loads the 27.7 KB chunk containing FeaturedWork                           | chunk gone from the route; perf 98 vs 97 to 98, TBT 57 to 58 vs 58 to 65 ms (within noise)                                                                                                                             | kept for the bytes, not for the score    |
| Font instantiation in the first layout            | first `Layout` 39 ms for 535 objects; 21 ms with woff2 blocked                           | not changed: the fonts are the design                                                                                                                                                                                  | not attempted                            |
| Scroll dot compositing                            | 60 style recalcs per second attributed to the dot's transform animation                  | every variant tried (margin centering, `translate` keyframes, radius, `will-change`, probes at any size) still re-styled per frame although Chrome reports `compositeFailed=0`; opacity-only probes eventually did too | left as is, recorded in ADR 0009         |
