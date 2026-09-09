# 0009. Animation performance rules for the home page

## Status

Accepted

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
   only animation is a transform on the newest slot.
2. **Keyframes animate `transform` and `opacity` only.** No `top`, `left`, `width`, `height`,
   `margin`, `box-shadow` or `background-position` in `@keyframes`, in GSAP tweens that repeat, or
   in transitions that fire continuously. A sweep that must travel a parent's height is a
   full-height element translated by its own height (`.scan-line` in `globals.css`), not a thin
   element with an animated offset.
3. **No static `will-change`.** GSAP promotes elements for the duration of a tween on its own, and a
   compositing layer per element is paid on every frame the main thread produces. `will-change` is
   acceptable only on a handful of elements and only while they are about to animate.
4. **Sections below the fold stay server-rendered but hydrate only when they approach the
   viewport.** `DeferredSection` in `apps/web/src/components/animated-hero/deferred-section.tsx`
   suspends its Suspense boundary during hydration until an `IntersectionObserver` reports the
   section near the viewport (or already scrolled past), so React leaves the server HTML in place:
   the copy is there for crawlers, assistive technology, find-in-page and print from the first
   byte, and the chunk, hydration and GSAP work all wait. Removing the markup from the HTML instead
   was tried first and rejected in review. The chunks are prefetched by `use-prefetch-phases.ts`
   after the first sign of intent (pointer, touch, key or scroll, armed one second after hydration)
   or a few idle seconds, never under Data Saver and never during the first paint's window. A chunk
   that fails to load falls back to the section placeholder instead of the route's error page. An
   animation that repeats forever pauses while its section is scrolled past
   (`toggleActions: 'play pause resume reverse'`; `[data-active='false'] .scan-line`).
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

- A section hydrates when its top edge reaches the viewport, and its GSAP entrance sets the
  animated elements to opacity 0 at that moment, exactly as it did at 0.7 s before this change. On a
  slow connection with no earlier intent signal the chunk may still be downloading when the section
  is reached, and a fast flick can show its static server-rendered content for a frame or two before
  the entrance takes over; the 96 px of top padding and the unanimated phase header absorb most of
  that. This is the accepted cost of not paying for six sections at load, and it is bounded: nothing
  is ever missing from the page, only late to animate.
- Visitors who never scroll never load GSAP. Visitors who move the pointer load it within a second,
  as before.
- The slot grid rotates text through up to 40 slots per pane on every tick, about 240 text node
  replacements per second across the five panes. That is cheaper than the layout shifts it replaces
  and invisible in the trace, but it is not free, and `MAX_LINES` should not grow without measuring.
- In headless Chrome traces the scroll indicator's dot still costs a style recalculation per frame:
  Chrome reports its transform animation as composited (`compositeFailed=0`) and yet re-resolves
  its style every frame, and probe elements with opacity-only Web Animations eventually showed the
  same, so the measurement is not reliable at that granularity and it was not pursued further.
  Moving the keyframes from `top` to `transform` still removed the layout and paint from each of
  those frames.
- `DeferredSection` holds one `IntersectionObserver` per section until it fires; browsers without
  the API hydrate everything once the page has hydrated. The gate relies on React keeping a
  dehydrated Suspense boundary's server HTML while a component inside it suspends during hydration,
  the same contract `React.lazy` depends on.
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
  reachability, and it swapped a 100vh placeholder for content of a different height. The hydration
  gate keeps every byte of markup and defers exactly the same client work.
- **Mount the story sections after `requestIdleCallback` instead of on approach.** Rejected: idle
  arrives about a second after load, inside the window Lighthouse measures and inside the time a real
  visitor is still looking at the hero. The work moved but was not removed.
- **Prefetch the section chunks at idle.** Measured and rejected: evaluating the shared GSAP chunk is
  a 33 ms task (132 ms at 4×) that landed at 0.7 s and started GSAP's frame loop for the rest of the
  session. Waiting for intent or a few idle seconds keeps the same experience for anyone who scrolls.
- **`will-change` only on the sections' hover targets.** Rejected: GSAP already promotes during
  tweens, and the hover effects are short; there was nothing left for `will-change` to buy.
- **A Lighthouse CI budget.** Deferred, not rejected. The numbers vary by ±100 ms TBT between runs
  on an idle machine and far more on a loaded one, so a gate needs a median of several runs and a
  runner that is quieter than GitHub's shared ones. The e2e layout-shift guard in
  `apps/web/e2e/hero.spec.ts` covers the regression that would hurt most.
