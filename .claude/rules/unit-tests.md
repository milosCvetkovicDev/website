---
paths:
  - 'apps/web/src/**/__tests__/**'
  - 'apps/web/src/test/**'
  - 'apps/web/vitest.config.ts'
---

# Unit tests (Vitest)

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Testing

- Unit tests sit next to the code in `__tests__` folders. `apps/web/vitest.config.ts` picks up
  `src/**/*.test.{ts,tsx}` in jsdom with globals enabled; `src/test/setup.ts` only imports
  `@testing-library/jest-dom/vitest`.
- Browser APIs are stubbed per test file, not globally. `matchMedia` and `IntersectionObserver` are
  defined in a `beforeEach` inside the file that needs them, as in
  `src/components/animated-hero/__tests__/tmux-background.test.tsx`. Keep new stubs local too.
- Building a jsdom window costs about two seconds in every worker, and it is by far the largest
  single cost in the suite. A test file with no DOM in it declares `@vitest-environment node` in a
  docblock at the top, as the three `src/data/__tests__` files do.
- Two query patterns dominate a slow test file, and a CPU profile says which. `getByRole` with a
  `name` option recomputes the accessible name of every candidate on every call, so resolve an
  element once and reuse it unless the accessible name is what the test is asserting. And every
  GSAP tween reads its start value through `getComputedStyle`, which jsdom answers by matching its
  user-agent stylesheet against the element, so a mount that builds a timeline is expensive:
  prefer walking one mount through a lifecycle over re-mounting per assertion.
- `testTimeout` stays at the 5s default. A test that genuinely needs longer takes an explicit
  timeout as `it`'s third argument, with a comment saying why, as the phase lifecycle test in
  `src/components/animated-hero/__tests__/story-phases.test.tsx` does. Raising the global default
  hides the next slow test instead.
- Verified defects that an open task will fix are recorded as expected failures, `test.fail()` in
  Playwright and `it.fails` in Vitest, each naming its manifest row and fixing issue (see
  `.claude/epics/audit-remediation-2026-09/43.md`). An expected failure that passes fails the run, so
  the pull request that fixes the defect deletes the annotation in the same change.
