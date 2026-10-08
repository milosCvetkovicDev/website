---
paths:
  - 'apps/web/src/**/__tests__/**'
  - 'apps/web/src/test/**'
  - 'apps/web/vitest.config.mts'
---

# Unit tests (Vitest)

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Testing

- Unit tests sit next to the code in `__tests__` folders. `apps/web/vitest.config.mts` picks up
  `src/**/*.test.{ts,tsx}` in jsdom with globals enabled; `src/test/setup.ts` only imports
  `@testing-library/jest-dom/vitest`.
- Browser APIs are stubbed per test file, not globally. `matchMedia` and `IntersectionObserver` are
  defined in a `beforeEach` inside the file that needs them, as in
  `src/components/animated-hero/__tests__/tmux-background.test.tsx`. Keep new stubs local too.
- jsdom does not implement `window.scrollTo`, and `ScrollTrigger.refresh()` calls it: each call
  prints `Not implemented: Window's scrollTo() method` into the run's output. A file whose mounts
  refresh ScrollTrigger defines a no-op in `vi.hoisted` for its whole lifetime, as
  `gauntlet-phase.test.tsx` and `story-phases.test.tsx` in `src/components/animated-hero/__tests__`
  do; `vi.restoreAllMocks()` leaves a property definition in place. The definition stays inside
  the file only because Vitest gives every test file its own environment (`isolate`, on by default
  and not changed in `vitest.config.mts`). A file that asserts on the calls spies on it per test
  instead, as `section-progress.test.tsx` does.
- Building a jsdom window costs about two seconds in every worker, and it is by far the largest
  single cost in the suite. A test file with no DOM in it declares `@vitest-environment node` in a
  docblock at the top, as the `src/data/__tests__` files and the config tests in `src/test` do.
- Two query patterns dominate a slow test file, and a CPU profile says which. `getByRole` with a
  `name` option recomputes the accessible name of every candidate on every call, so resolve an
  element once and reuse it unless the accessible name is what the test is asserting. And every
  GSAP tween reads its start value through `getComputedStyle`, which jsdom answers by matching its
  user-agent stylesheet against the element, so a mount that builds a timeline is expensive:
  prefer walking one mount through a lifecycle over re-mounting per assertion.
- A test about one tween made with `gsap.to` or `gsap.fromTo` picks it through
  `src/components/animated-hero/__tests__/gsap-tweens.ts`, never by indexing that spy's
  `mock.calls` or `mock.results`: `calls[0]` is whichever tween the component happened to create
  first, and the next tween added ahead of it silently becomes the subject. `pickTween` reads a spy
  on `gsap.to` and `pickFromToTween` one on `gsap.fromTo`, each with a query that says what the tween
  is (`progressDriver(seconds)`, `fromToOf(element, what)`, or a predicate of your own); both throw
  when no call matches, and when several do and the test did not pass `{ latest: true }`, listing
  every call the spy saw. Tweens built on a timeline never reach either spy. Find the target
  through the data hook the component puts on it (`data-loop`, `data-reveal`, `data-gauntlet`), as
  `loop-phase.test.tsx` and `gauntlet-phase.test.tsx` do.
- `src/data/__tests__/content-dates.test.tsx` owns a file snapshot, `src/data/content-dates.json`
  (`app-router-and-content.md` says what it records). It pins the clock before any import, with
  `vi.useFakeTimers({ toFake: ['Date'], now })` inside `vi.hoisted`: `/` and `/about` print the years
  of experience, so on the live clock the committed file would go stale every 1 January. Only
  `Date` is faked, because faked timers can leave the server renderer waiting. It renders pages
  with `react-dom/static`'s `prerender` in the node environment and reads their text without a DOM.
  `/` is rendered twice, as served and finished (`usePrefersReducedMotion` mocked to true); copy
  shown only mid-animation is in neither render. In CI Vitest refuses to write a snapshot, so a
  stale or missing manifest fails; `pnpm --filter web content-dates:update` rewrites it locally.
- `testTimeout` stays at the 5s default. A test that genuinely needs longer takes an explicit
  timeout as `it`'s third argument, with a comment saying why, as the phase lifecycle test in
  `src/components/animated-hero/__tests__/story-phases.test.tsx` does. Raising the global default
  hides the next slow test instead.
- `pnpm --filter web test:coverage` runs the same suite with `@vitest/coverage-v8` and prints a
  text summary over `src/**/*.{ts,tsx}`, less the test files and the test infrastructure
  (`src/test/**` and everything in `__tests__` folders). It is report-only: no threshold, and CI
  does not run it; adding either is a decision of its own. A failing test still fails the run, and
  the summary is printed anyway (`reportOnFailure`). The provider must match vitest's version
  exactly, so the pull request that bumps `vitest` bumps `@vitest/coverage-v8` to the same version;
  `scripts/vitest-coverage-pair.test.mjs` (`pnpm test:scripts`, in CI) fails when the lockfile
  installs any `@vitest/*` package at another version than vitest. See `dependencies.md` for how
  to add or bump it without flipping unrelated lockfile peer suffixes.
- Verified defects that an open task will fix are recorded as expected failures, `test.fail()` in
  Playwright and `it.fails` in Vitest, each naming its manifest row and fixing issue (see
  `.claude/epics/audit-remediation-2026-09/43.md`). An expected failure that passes fails the run, so
  the pull request that fixes the defect deletes the annotation in the same change.
