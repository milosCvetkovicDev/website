# 0024. GSAP loads on the visitor's first intent

## Status

Accepted

## Date

2026-09-24

## Context

ADR 0022 put LCP work on `/` after early script, and #48 took GSAP out of the home page's initial
chunk: `load-gsap.ts` in `apps/web/src/components/animated-hero` fetched it once the browser was
idle after hydration, and the story phases built their timelines when it arrived. That moved GSAP
out of the served HTML, but not out of the window Lighthouse measures.

Lighthouse 12.8.2 with its default mobile configuration gives the page no input, and it counts
blocking time until the page goes quiet. Idle after hydration is inside that window, so GSAP's
evaluation and every timeline it builds counted. Measured on 2026-09-23 and 2026-09-24:

- **Locally**, `next start` against `d1da60f`: performance 86 to 89, TBT 211 to 285 ms. GSAP was
  requested between 807 and 1,191 ms, and its blocking time was 60 to 117 ms. Once loaded,
  ScrollTrigger's animation-frame loop runs for the rest of the visit, 208 ms of every second at 4×
  CPU slowdown.
- **CPU-normalised**, four interleaved runs of each variant: loading GSAP on intent alone took the
  page's JavaScript blocking time from 222 to 177 ms; with the theme context kept stable through
  hydration as well, TBT went from 257 to 118 ms.
- **With the GSAP chunk blocked**, five runs with one outlier excluded, load 4 to 57: TBT 375 to
  234 ms, Speed Index 2,702 to 2,460 ms.
- **In production**, over HTTP/2: performance 94 to 96, TBT 165 to 230 ms, with GSAP a long task of
  90 to 94 ms.

A visitor who reads the hero and leaves never needs GSAP. A visitor who scrolls needs it for the
entrances of sections below the fold, and the first of those starts 73 px below the fold on a
412×823 phone.

## Decision

- On `/`, `load-gsap.ts` fetches GSAP on the visitor's first `scroll`, `wheel`, `touchstart`,
  `pointerdown` or `keydown` on `window`, listened for in the capture phase and passively, or at
  once when the page is already scrolled when the story arms the wait (a restored position, a deep
  link, a soft navigation back). The listeners are removed on the first event. There is no idle,
  timer or intersection fallback.
- An event handler that asks for GSAP is intent in itself: `useWithGsap` calls `requestGsap()` before
  queueing its callback, so a hover before any scroll still plays once GSAP has arrived. Effects do
  not; they wait for the visitor.
- Until GSAP arrives every section shows what the server rendered. A phase whose section is already
  in view when its timeline is built finishes its entrance at once (`isAlreadyReached`), as it did
  when GSAP arrived late at idle.
- When GSAP arrives, the callbacks that waited for it run one per task, yielding to the browser
  between them (`scheduler.yield()` where it exists, a zero-delay timeout otherwise), so building
  every phase's timeline is a string of short tasks in the visitor's first scroll rather than one
  long one. A callback passed meanwhile joins the end of the queue, and the loaded mark and the
  load's promise follow the last callback.
- The end-to-end helper `expectGsapLoaded` sends that intent, a synthetic `scroll` on `window`,
  before it waits. `apps/web/e2e/gsap-lazy.spec.ts` and `apps/web/e2e/mobile/gsap-intent.spec.ts`
  pin the page before intent: no request for GSAP without input, each kind of intent loading it,
  and no axe violation under the gate's rule set before GSAP.
- This supersedes [ADR 0022](0022-no-boot-loader.md) in part: the clause of its fourth Decision
  bullet saying `load-gsap.ts` fetches GSAP once the browser is idle after hydration. The rest of
  0022's decision stands.

## Consequences

### Positive

- GSAP drops out of Lighthouse's simulated load and out of its blocking-time window in every run,
  whichever side of the first frame it would have been requested on.
- A visitor who never scrolls, taps or presses a key never downloads the 44 KB, and ScrollTrigger's
  animation-frame loop never starts for them.
- Lighthouse's accessibility audit, which gives no input either, scores the page as served, and a
  test holds that page to the same rule set as the gate.

### Trade-offs

- Most phone visitors reach Discovery with their first flick before the 44 KB has arrived, so its
  entrance is finished at once rather than played.
- The three headlines the server renders at `opacity-0` (row R16, still an expected failure in
  `served-html.spec.ts`) stay blank until GSAP arrives, which is now after the first intent rather
  than at idle.
- The accessibility gate at rest measures the page after GSAP, because its helper sends intent; the
  page before GSAP is measured by the specs named above instead.
- The work GSAP does when it arrives, 28 to 38 ms of CPU here and roughly four times that on a Moto
  G-class phone, moves into the visitor's first scroll. Split into one task per phase it no longer
  blocks input for all of that time: with GSAP still loading at idle, the split alone took GSAP's
  blocking time from 60 to 117 ms to about 0, and its largest piece to 45 ms simulated.
- A callback that waits for GSAP now runs a task or more after the one before it, not in the same
  task, so a spec measuring what GSAP does waits for the loaded mark, which follows the last one.

## Alternatives considered

- **Idle after hydration**, as before. Inside Lighthouse's window, as measured above.
- **After the first contentful paint.** Earlier than idle, and still inside the blocking-time
  window.
- **An intersection observer near the first phase.** The first phase starts 73 px below the fold on
  a 412×823 phone, so any positive root margin fires at load and brings GSAP back into the window.
- **A timer fallback after some seconds.** It gives nothing to the visitor who never scrolls and
  lands inside or just after the window on a slow device.
- **Building each phase only as it approaches.** A larger change to every phase; deferred.
