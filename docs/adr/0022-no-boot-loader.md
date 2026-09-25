# 0022. The home page renders no boot loader

## Status

Superseded by ADR-0024

No longer applies: the clause of the fourth Decision bullet saying `load-gsap.ts` fetches GSAP once
the browser is idle after hydration; the rest of its decision stands. See
[ADR 0024](0024-gsap-loads-on-first-intent.md).

## Date

2026-09-23

## Context

The external SEO audit of 2026-09-23 measured `/` at Lighthouse mobile performance 72, with LCP
4.2 s and FCP 3.2 s, and put a 2.2 s "element render delay" on the hero H1 down to `BootstrapLoader`.
The server rendered that loader as a fixed, full-screen panel at full opacity, and it faded out
500 to 600 ms after hydration. The audit asked for the loader to stop blocking the first paint.

It was measured before anything changed: origin/main at 6a4d9d6, Next 16.3.5, a local `next start`,
Lighthouse 12.8.2 with its default mobile preset and simulated throttling. The loader never covered
the H1.

- **Stacking.** The loader was `fixed inset-0 z-[1]` and the story `relative z-10`, both in the root
  stacking context, so the story painted over it. With JavaScript off, `elementFromPoint` at the H1's
  centre returned the H1, and at the centre of the loader's own "System Boot" label it returned the
  hero's player card.
- **Paint order.** Under Playwright at 4× CPU and about 1.5 Mbps, the H1 was the LCP entry at
  1,956 ms. Hydration finished at 4,624 ms, and the loader stayed at opacity 1 until 4,703 ms.
- **Baseline**, the median of three runs: performance 80, FCP 1.04 s, LCP 3.49 s, TBT 373 ms, CLS 0.
  The LCP element was the hero H1, with a render delay of 3.0 s.
- **Without the loader**, in interleaved A/B runs: simulated LCP 3.46 s against 3.64 s. The 179 ms
  difference is inside the spread between runs, and FCP did not move. Under applied throttling, LCP
  was 2.14 s against about 2.3 s.

The render delay comes from the harness, not the page. In the unthrottled trace, Lighthouse's first
frame lands about 1.2 s in, after every script has already run. Its simulation (Lantern) therefore
charges all early JavaScript to the H1: React and the Next runtime, about 140 KB gzip, plus the page
chunk with GSAP and the story, about 61 KB. Removing the story's phases and GSAP from the bundle
measured simulated LCP 456 ms lower and performance 89.

What the loader did cost:

- about 160 lines of client code, which the page chunk shipped to every visitor;
- a fixed layer over the whole viewport until 600 ms after hydration, which nobody saw;
- the CLS of 0.03 to 0.06 that Lighthouse attributed to it when re-centring its emulated viewport;
- 18 end-to-end assertions keyed on its text rather than on hydration: 16 inline waits for it to
  hide, one check that it stayed hidden after a soft navigation, and one wait inside the shared
  hydration helper.

## Decision

- `/` renders no boot loader. `BootstrapLoader` and its boot messages are deleted from
  `apps/web/src/components/animated-hero/index.tsx`, and no post-hydration HUD takes their place:
  the hero, served in the HTML, is the first thing the page paints.
- Nothing the server renders may sit over the hero H1 or the paragraph under it.
  `apps/web/e2e/served-html.spec.ts` asserts this with JavaScript off: the element at the centre of
  each is that element.
- End-to-end specs wait for hydration only through `apps/web/e2e/support/hydration.ts`
  (`expectHydrated` after a navigation or reload, `gotoHydrated` for a navigation), which reads the
  hydration marker. No spec keys a wait on page text.
- LCP work on `/` goes after early script, not after the paint. The measured lever is keeping GSAP
  out of the page's initial chunk, and #48 does that: `load-gsap.ts` in
  `apps/web/src/components/animated-hero` fetches it once the browser is idle after hydration.

## Consequences

### Positive

- The 16 inline waits became `expectHydrated`, a positive wait on the hydration marker, so a route
  that stops rendering the marker times out instead of passing at once. The helper's own wait went
  with the loader.
- The `System Boot` text and the four boot messages no longer exist anywhere in `apps/web/src`, and
  the page chunk no longer ships the code that drew them. The `.scan-line` utility stays, because
  the work pages use it too.
- Issue #47's finding hero-9, which planned to delete the loader and move these waits to a
  hydration marker, is done by this record.

### Trade-offs

- The check that the loader was not showing after a soft navigation back to `/` is gone rather
  than converted; the document marker in `client-navigation.spec.ts` is what catches a full load.
- Under Lighthouse's simulation, mobile LCP on `/` is bounded by early script. React and the Next
  runtime alone kept it near 3.2 s in this harness. Deleting the loader removes a layer and its
  code but is not expected to move LCP, and it did not.
- ADR 0006's use of the loader as an example of derived state, and ADR 0009's note on the CLS it
  caused, describe code that no longer exists. Both were true when written, so under ADR 0012 they
  are not corrected.
- The same holds for three passages the GSAP change in #48 overtakes. ADR 0009's trade-off that
  everyone pays for GSAP at load on `/` and its "open follow-up" describe the page before GSAP left
  the initial chunk, and ADR 0006 names `use-gsap-scroll.ts`, which #48 deleted. ADR 0009 also
  rejected prefetching GSAP at idle, but against a build that mounted the story on approach; against
  the static import that replaced that deferral, idle is later than before, not earlier.

## Alternatives considered

- **A post-hydration HUD in a corner**, at most 300 ms, never covering the hero, and skipped under
  reduced motion and Data Saver. It would have kept the boot-sequence look, but it changes no
  metric: the premise that the loader blocked the paint was false. It adds a flash to every load
  and a component whose only job is decoration, and the waits would still have had to move off
  its text.
- **Keeping the loader and leaving it to #47.** That keeps code that renders on every visit, is
  never seen, and ties the suite's waits to the text of an invisible element.
- **Rendering the loader only when motion is allowed and Data Saver is off.** It has the same costs
  as keeping it, on fewer visits.
