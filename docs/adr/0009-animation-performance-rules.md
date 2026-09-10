# 0009. Animation performance rules for the home page

## Status

Accepted (corrected 2026-09-10)

## Date

2026-09-09

## Context

The home page is a scroll story: a boot loader, a hero with a live tmux terminal behind a frosted
content island, six GSAP-animated sections below the fold, then the featured work. Its first
Lighthouse run against production (2026-09-09, mobile emulation, simulated throttling, 4× CPU) came
back with performance 24, CLS 0.345 and TBT 2,160 ms although the whole page transfers 318 KiB.
Traces of the same build showed four independent causes, none of them about bytes:

1. Every tmux log line was appended to a bottom-anchored container, so each line moved the whole
   container up one row. Each move was a layout shift and they accumulated for as long as the tab
   stayed open, which is how a 0.001 shift became 0.345 in a long trace.
2. All six story sections mounted in one React commit as soon as their lazy chunks arrived, and
   their GSAP setup forced layout from inside that commit: one 135 ms task at 4× is 540 ms, none of
   it for anything the visitor could see.
3. Two keyframe animations moved elements with `top`, so the main thread laid out and painted at
   60 fps forever, and about 290 character spans carried a static `will-change: transform, opacity`,
   which made each one a compositing layer and pushed layer assignment to 1.3 ms per frame.
4. `app/layout.tsx` imported its client components through the `@/components` barrel. Every client
   module reachable from a server component's imports is bundled into that layout's client chunk, so
   `FeaturedWork` and the architecture graph shipped to every route, including the case studies.

Each of these is a pattern the next feature can reintroduce in an afternoon, which is why they are
recorded as rules rather than left in a pull request. The measurements and the trace evidence are in
[docs/plans/2026-09-09-home-page-performance-plan.md](../plans/2026-09-09-home-page-performance-plan.md).

## Decision

Animated and lazy-loaded UI in `apps/web` follows five rules.

1. **Nothing above the fold grows or moves once painted.** A stream of content renders into a
   fixed set of slots and rotates its data through them; it does not append or remove elements in
   the flow of anything the visitor can see. `AnimatedPane` in
   `apps/web/src/components/animated-hero/tmux-background.tsx` is the reference implementation:
   `ResizeObserver` sizes the slot grid to the pane, text is written into existing slots, and the
   only animation is an `element.animate` on the newest slot touching opacity and transform alone.
2. **Repeating animations move only `transform` and `opacity`.** No `top`, `left`, `width`,
   `height`, `margin` or `background-position` in `@keyframes`, in GSAP tweens that repeat, or in
   transitions that fire continuously: each of those forces style, layout and paint on every frame
   the animation runs. Paint-only properties such as `box-shadow` and `filter` cost a repaint
   rather than a relayout, so they are allowed sparingly and only where the animation stops when
   nothing can see it. The `GameComplete` call to action is the single instance today. A sweep that must travel a parent's height is a
   full-height element translated by its own height (`.scan-line` in `globals.css`), not a thin
   element with an animated offset.
3. **No static `will-change`.** GSAP promotes elements for the duration of a tween on its own, and a
   compositing layer per element is paid on every frame the main thread produces. `will-change` is
   acceptable only on a handful of elements and only while they are about to animate.
4. **Below-the-fold sections render like everything else.** The six story phases are imported
   directly by `apps/web/src/components/animated-hero/index.tsx`. Two attempts at deferring them
   both cost more than they saved and are recorded under Alternatives; the rule that survives is
   that a section's markup is in the document from the first paint and stays there. What is deferred
   is animation, not content: an animation that repeats forever stops while nothing can see it, with
   `toggleActions: 'play pause resume reverse'` on a GSAP timeline, `[data-active='false']` on an
   unhovered featured-work card, and `[animation-play-state:paused]` until hover on a `/work` card.
   An endless tween is never a child of a timeline a ScrollTrigger reverses: GSAP gives such a child
   a total duration of 1e10 seconds, the parent inherits it, and `reverse` then rewinds every second
   the tween has been running before the entrance itself moves.
5. **Server components import client components from their own modules.** `app/layout.tsx` does
   not import from the `@/components` barrel; pages may, because a page's chunk is only paid for by
   that page. The barrel stays for the page-level components it lists.

Two facts explain why rules 2 to 4 matter more here than on a static page. Loading GSAP starts two
permanent `requestAnimationFrame` loops (`gsap.ticker`, and ScrollTrigger's repaint workaround for
Firefox), and while any script or non-composited animation asks for a main-thread frame, Blink
re-resolves style for every running CSS animation on that frame, composited or not. So the cost of an
always-on animation is not what it does on the compositor; it is what it adds to every frame someone
else forces. Keeping GSAP out of the first seconds and keeping keyframes composited is what lets the
main thread go quiet between tmux ticks.

## Consequences

### Positive

- The tmux pane containers no longer appear in `LayoutShift` events at all, and the e2e guard that
  sums shifts while lines arrive reads 0 on this branch against 0.03 on `main`. The one shift
  Lighthouse still reports on `/` (0.034) is the centred boot loader re-centering when Lighthouse
  itself changes the emulated viewport size at about 0.9 s, which it counts by design within 500 ms
  of that event; it does not happen to visitors.
- The 135 ms phase-mount task is gone from the load trace. Per-frame `Layout` events dropped from
  30 per 500 ms to the tmux tick rate, and `Layerize` from 40 ms per 500 ms to about 1.5 ms.
- `/work/[slug]` and every other non-home route stopped loading the 27.7 KB FeaturedWork chunk.
- Nothing visible changed: the same pixels in light, dark and mobile screenshots, the same log
  lines arriving at the bottom of each pane and scrolling up, the same entrance animations once a
  section is reached.

### Trade-offs

- The story sections render and hydrate at load, and that is the price of the two reverted
  experiments. Measured on 2026-09-10, five interleaved runs per build on an idle machine
  (`benchmarkIndex` 1,554 to 2,001, no warnings), this build against `main` carrying the hydration
  gate: performance 92 against 96, LCP 2.77 s against 2.63 s, blocking time 234 ms against 94 ms,
  Speed Index 1.34 s against 1.13 s. Cumulative layout shift goes the other way, 0.016 against
  0.034, because nothing swaps a placeholder for a section any more. Against the build this whole
  effort started from (`a8b4a91`: performance 92, CLS 0.037, blocking time 252 ms) it is level or
  better on every metric, so what was given up is the deferral, not the work that made the page
  faster. Deferring the animation rather than the content — each phase importing GSAP from inside an
  approach-gated effect — is what would buy the blocking time back, and it is the open follow-up.
- Everyone pays for GSAP at load on `/`. `index.tsx` imports the six phases at module scope and each
  of them imports `gsap` and `ScrollTrigger` through `use-gsap-scroll.ts`, so GSAP is part of the
  route's initial client payload and evaluates during load rather than on intent or at idle. There
  are no intent listeners, no idle warm-up and no Data Saver check.
- The slot grid rotates text through up to 40 slots per pane on every tick, about 240 text node
  replacements per second across the five panes. That is cheaper than the layout shifts it replaces
  and invisible in the trace, but it is not free, and `MAX_LINES` should not grow without measuring.
- The scroll indicator's dot still costs a style recalculation per frame on this page, and the
  reason is not the dot. The measurement was re-run on 2026-09-10 with the instrument validated
  first: on a blank page the identical keyframes are fully composited (151 draw frames, no
  main-thread frames, no style recalculations), a keyframe animation of `left` in the same harness
  reports 60 recalculations per second, so the trace is not blind to animation-driven work, and a
  page with nothing animating reports no frames at all, so tracing does not itself force them. On
  the home page the site produces about 8 main-thread frames per second with every animation
  switched off; the dot's animation raises that to about 60, one style recalculation each. Hiding
  each structural suspect in turn changes nothing: not the tmux background, the hero content
  island, every `backdrop-filter`, the section progress and corner frames, the header and footer,
  everything below the hero, nor finally every element in the hero except the dot itself. So the
  cause is document-level and still unidentified, and it is not the dot's markup, its ancestors or
  its keyframes. Moving those keyframes from `top` to `transform` did remove the layout and the
  paint from each of those frames, which is the part rule 2 is about. The harness is
  `dot-bisect.mjs` and `dot-frames.mjs` in the scratch notes of that session; anyone resuming
  should start from the frame cadence, not from the animation.
- There is no `DeferredSection` and no prefetch hook any more; `index.tsx` renders the phases
  directly, which is also the last of the indirection those two experiments added.
- The hover text effects and any other interactivity inside a section are inert until it hydrates.
  The six sections hold one interactive element, the LinkedIn link, and it is a plain anchor that
  works without hydration.

## Alternatives considered

- **Keep appending log lines but stop the shift with a top-anchored, transform-scrolled container.**
  Rejected: removing the oldest line to cap the DOM still moves every sibling, so the cap would have
  had to go, and the container would have grown without bound.
- **Render placeholders instead of the sections until they approach.** Implemented first, then
  rejected in review: it removed the six sections and the LinkedIn call to action from the server
  HTML, which cost crawlers, no-JS readers, reader mode, find-in-page, print and keyboard
  reachability.
- **Hold each section's `Suspense` boundary suspended during hydration, so the server markup stays
  and only the client work waits.** Shipped in PR #15 and reverted on 2026-09-10. It does not work:
  React client-renders a boundary that suspends during hydration and throws the server markup away,
  so three seconds after load the home page held six placeholders where nine sections had been, and
  the copy came back only when the visitor scrolled to it. The HTML response was correct throughout,
  which is why the assertion written at the time passed. `apps/web/e2e/hero.spec.ts` now reads the
  live DOM after hydration instead.
- **Keep the sections lazy behind `Suspense` without the gate.** Measured and rejected the same day.
  It restores the markup, but every section shows a 100vh placeholder until its chunk arrives and
  the swap to real content is a layout shift: CLS 0.092 against 0.034, with blocking time 281 ms.
  Importing the phases directly gives CLS 0.016 at 234 ms.
- **Mount the story sections after `requestIdleCallback` instead of on approach.** Rejected: idle
  arrives about a second after load, inside the window Lighthouse measures and inside the time a real
  visitor is still looking at the hero. The work moved but was not removed.
- **Prefetch the section chunks at idle.** Measured and rejected: evaluating the shared GSAP chunk is
  a 33 ms task (132 ms at 4×) that landed at 0.7 s and started GSAP's frame loop for the rest of the
  session. The intent-and-idle prefetch that was kept instead was removed along with the deferral it
  served, and the phases now ship in the route's initial payload, so there is no separate chunk left
  to prefetch.
- **`will-change` only on the sections' hover targets.** Rejected: GSAP already promotes during
  tweens, and the hover effects are short; there was nothing left for `will-change` to buy.
- **A Lighthouse CI budget.** Deferred, not rejected. The numbers vary by ±100 ms TBT between runs
  on an idle machine and far more on a loaded one, so a gate needs a median of several runs and a
  runner that is quieter than GitHub's shared ones. The e2e layout-shift guard in
  `apps/web/e2e/hero.spec.ts` covers the regression that would hurt most.

## Corrections

### 2026-09-10

This record was accepted on 2026-09-09. On 2026-09-10 the change merged as `743a860`
("keep the story sections in the DOM and reverse the closing section at once", PR #22) rewrote parts
of it in place — rule 4 inside `## Decision`, two `### Trade-offs` bullets and two entries under
`## Alternatives considered` — and recorded nowhere that it had done so. [ADR
0001](0001-record-architecture-decisions.md) was in force that day and did not allow it: an accepted
record was immutable. This entry is the only account of that rewrite in the record itself.

Two claims it left behind are false, and are corrected here. Neither was in the record when it was
accepted, so neither is the case [ADR 0012](0012-correcting-accepted-records.md) describes as false
about the world as it stood at acceptance; both entered a day later, in the same commit that made
them false, and neither was ever true of any state of this repository. ADR 0012's other branch does
not reach them either, because a claim that was never true has not been overtaken. What they have in
common is that fixing them changes no part of `## Decision`, changes neither the option the decision
selects nor the conditions under which it would be revisited, and adds no guidance, obligations or
recommendations the record did not already carry — which is the test ADR 0012 sets for a correction.
Supersession is the wrong instrument here: `## Decision` still selects importing the phases directly
and is accurate as it stands, and retiring a standing decision to fix two sentences is exactly the
outcome ADR 0012 was written to avoid.

**A prefetch mechanism that does not exist**, in `### Trade-offs`. The record read: "Nobody pays for
GSAP during the first second: the intent listeners are armed one second after hydration, so a pointer
already resting over the page does not count. After that the first pointer, touch, key, wheel or
scroll event loads the chunks, and with no interaction at all they are still warmed after three idle
seconds. Only Data Saver suppresses the prefetch entirely." It now reads: "Everyone pays for GSAP at
load on `/`. `index.tsx` imports the six phases at module scope and each of them imports `gsap` and
`ScrollTrigger` through `use-gsap-scroll.ts`, so GSAP is part of the route's initial client payload
and evaluates during load rather than on intent or at idle. There are no intent listeners, no idle
warm-up and no Data Saver check." What was wrong: the bullet describes as live the behaviour
`use-prefetch-phases.ts` implemented, and `743a860` deleted that file in the same change that wrote
the bullet, leaving it contradicting the bullet four below it in the same section, "There is no
`DeferredSection` and no prefetch hook any more". Evidence:
`git show --name-status 743a860 -- apps/web/src/components/animated-hero/` reports `D` for
`use-prefetch-phases.ts` and `deferred-section.tsx`, and
`git grep -n -i prefetch -- . ':!docs' ':!pnpm-lock.yaml'` returns no hits, so nothing outside this
directory's prose mentions prefetching at all.

**A rejected alternative pointing at a design that is gone**, in `## Alternatives considered`, under
**Prefetch the section chunks at idle**. The record read: "Waiting for intent or a few idle seconds
keeps the same experience for anyone who scrolls." It now reads: "The intent-and-idle prefetch that
was kept instead was removed along with the deferral it served, and the phases now ship in the
route's initial payload, so there is no separate chunk left to prefetch." What was wrong: that
sentence named intent-or-idle prefetch as what the repository does instead of prefetching at idle, so
a reader re-evaluating this alternative would weigh it against a mechanism that no longer exists. The
measurement and the rejection are untouched, as ADR 0012 requires of a rejected alternative, and they
stand on their own: evaluating the shared GSAP chunk at 0.7 s was the measured reason to reject
idle-only prefetch, independently of what was kept in its place. Evidence: the same `git grep` above,
and `git show 743a860 -- docs/adr/0009-animation-performance-rules.md`, whose diff rewrites the
surrounding entries while leaving this sentence untouched.

Not repaired here: the edit `743a860` made to rule 4 inside `## Decision`. Rule 4 as it now stands
describes the code accurately, so there is no false statement for ADR 0012's annotation rule to
attach to, and ADR 0012 forbids rewriting `## Decision` in any case. What is wrong with it is that it
is not the text this record was accepted with, and until this entry nothing said so.
