# Route-wide hydration marker — design

**Date:** 2026-09-13
**Status:** Approved
**Branch:** `test/route-hydration-marker`
**Related:** #47 (hero-9), #50 (tests-5, AC 12), PR #74 (`e2e/support/hydration.ts`)

## Context

CLAUDE.md requires an e2e spec to wait for hydration before it interacts, because events fired
before React hydrates are lost. The only thing a spec can wait on today is the home page's
BootstrapLoader: `System Boot` is server-rendered and unmounts 600 ms after `useIsHydrated` flips.
Every other route has no loader, so the wait's locator matches nothing and the wait passes at once.
Both planned replacements keep that property:

- PR #74 centralises the wait as `expectHydrated` and `gotoHydrated` in
  `apps/web/e2e/support/hydration.ts`, still keyed on the loader. Its own comment says that off `/`
  the wait passes at once.
- #47 (hero-9) replaces the loader with `data-hydrated` on the story wrapper, waited on as
  `[data-hydrated="false"]` with `toHaveCount(0)`. Off `/` that count is 0 from the first byte.

It matters. While fixing `e2e/work-cards.spec.ts` on 2026-09-13, a probe of the card anchor for
React's `__reactProps$` key at the moment `page.goto('/work')` resolved found it unhydrated in 2 of 7
samples. The click still worked every time, but only because React 19 hydrates synchronously on a
discrete event and Playwright's actionability checks bought about 250 ms.

These specs interact on a route other than `/` with no hydration wait at all:

| Spec                            | Interaction                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| `e2e/work-cards.spec.ts`        | the pointer and keyboard card tests, once per case study     |
| `e2e/case-study.spec.ts`        | the "Back to Work" link                                      |
| `e2e/not-found.spec.ts`         | the "View Work" recovery link                                |
| `e2e/theme.spec.ts`             | the theme toggle on `/about`, then a nav link after a reload |
| `e2e/mobile/navigation.spec.ts` | the menu, through its `open()` helper, on every route        |

## Goals

1. One marker, rendered on every route, that reads `false` in the served HTML and `true` once React
   has hydrated the page.
2. The shared wait fails, naming the marker, when a route does not render it, instead of passing.
3. The five specs above wait before they interact.
4. ADR 0006 holds: the value comes from `useIsHydrated`, with no `setState` in an effect and no
   `eslint-disable` for a React Hooks rule.

## Non-goals

- Deleting the BootstrapLoader. That is #47 (hero-9).
- Moving the other inline `System Boot` waits into the helper. There are 20 on `main`, across 13
  specs. #74 moves six of them, and #47's AC 14 leaves no spec naming `System Boot` once the loader
  is gone. Until then they keep working, because the loader still exists.
- Changing what any of the five specs asserts. Only when they start interacting moves.
- A guard against a future Suspense boundary around a page's content. See D6.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                | Why                                                                                                                                                                                                                                                                                                                                                                                                              | Rejected alternative                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | A client component, `HydrationMarker` in `src/components/hydration-marker.tsx`, rendered once by `src/app/layout.tsx` inside `<body>`, after `ThemeProvider`, imported from its module.                                                                 | The root layout is the one component every route renders, the 404 included. A component of its own has one job and one unit test, and stays out of the theme store. The direct import keeps to ADR 0009's layout-barrel rule.                                                                                                                                                                                    | Rendering the span inside `ThemeProvider`, which would give the theme store a test-only job that #48's theme work would have to carry. #47's marker on the story wrapper, which exists only on `/`.                               |
| **D2** | The markup is `<span id="hydration-marker" hidden data-hydrated="false">`, and `"true"` after hydration.                                                                                                                                                | The `id` makes it exactly one element and keeps it apart from any other `data-hydrated`, such as #47's planned story attribute. `hidden` computes to `display: none`: no box, no flex item in the `flex-col` body, no accessibility-tree node, nothing focusable, so the skip link stays the first tab stop and axe has nothing to measure.                                                                      | A `<meta>` tag: React 19 hoists it into `<head>`, which `seo-surface.spec.ts` reads and ADR 0017 governs. A `window` global set from an effect: it is absent from the served HTML, so nothing can prove its unhydrated value.     |
| **D3** | The value is `useIsHydrated()`, whose server snapshot is `false`.                                                                                                                                                                                       | ADR 0006's contract: React uses the server snapshot for the SSR pass and the hydration render, then re-renders from the client snapshot straight after the hydration commit. The served HTML therefore says `false`, hydration matches it, and the flip needs no effect.                                                                                                                                         | An effect writing `document.body.dataset.hydrated` over a server-rendered `data-hydrated="false"`: it mutates the DOM outside React, depends on effect timing rather than the snapshot contract, and is state React does not own. |
| **D4** | `expectHydrated` waits positively: `#hydration-marker` must reach `data-hydrated="true"` within 30 s. Until #47 deletes the boot loader, it then waits for `System Boot` to be hidden as well.                                                          | A route that stops rendering the marker times out with the locator in the message. A negative wait (`[data-hydrated="false"]` count 0) passes on a page that renders no marker at all, which is the failure being removed. The loader clause keeps #74's callers exactly as they are: the loader stays in the DOM for 600 ms after hydration, and the axe and console gates among them audit the page behind it. | #47's `toHaveCount(0)` form.                                                                                                                                                                                                      |
| **D5** | This branch starts from `main` and adds `e2e/support/hydration.ts` with #74's exact exports and signatures: `expectHydrated(page)` and `gotoHydrated(page, path, options?)`.                                                                            | It stays independent of the #73 and #74 stack. Whichever of the two lands second has a one-file add/add conflict, resolved by keeping this body. #74's call sites need no change, because the API is identical.                                                                                                                                                                                                  | Stacking on `test/harness-hygiene`: a triple stack, and squash-merging a base closes the pull requests built on it. Waiting for #74 to merge first.                                                                               |
| **D6** | The marker covers the layout's hydration pass. A page whose content sits inside a `<Suspense>` boundary, or under a `loading.tsx`, would hydrate that content after the marker flips. This is documented in the helper and in CLAUDE.md, with no guard. | React hydrates an already-resolved boundary in a later pass at Offscreen priority, while the marker's post-hydration re-render is synchronous. Today no route puts `<main>` inside a boundary: Next adds one only for a `loading.tsx`, and there is none. The probe below measured the order on every route shape.                                                                                               | Asserting in e2e that the served HTML opens no boundary before `<main>`: that parses React's private `<!--$-->` comment format, which can change in any React release.                                                            |
| **D7** | No ADR. CLAUDE.md's Testing bullet names the marker, the helper and the D6 limit.                                                                                                                                                                       | This applies ADR 0006 rather than changing it, and it is a test contract of the kind CLAUDE.md already records. The 2026-09-10 design rejected a layout marker (its D5), but that marker was a build fingerprint that would only have saved a `next dev` boot. This one is the only observable signal of hydration, and #47 already plans a production marker for the same purpose.                              | A new ADR, numbered at PR time.                                                                                                                                                                                                   |

## Evidence: hydration order on a production build

Measured on 2026-09-13 with `next start` on a private port, 7 samples per route, light colour
scheme. The proxy for a layout-level marker is the header's theme toggle. Its label is rendered from
`mounted`, which comes from `useIsHydrated` in `ThemeProvider`, so it flips in the same
post-hydration re-render D1 relies on. A `MutationObserver` checked, at the moment the label
flipped, whether the first link, heading or button in `<main>` carried React's `__reactProps$` key.

| Route                      | `<main>` inside a Suspense boundary | Label flipped before content hydrated | Label flip, typical |
| -------------------------- | ----------------------------------- | ------------------------------------- | ------------------- |
| `/`                        | no                                  | 0 / 7                                 | 630–715 ms          |
| `/work`                    | no                                  | 0 / 7                                 | 270–290 ms          |
| `/about`                   | no                                  | 0 / 7                                 | 260–280 ms          |
| `/work/self-healing-agent` | no                                  | 0 / 7                                 | 220–230 ms          |
| `/does-not-exist` (404)    | no                                  | 0 / 7                                 | 220–250 ms          |

## Adopting the helper

| Spec                        | Change                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `work-cards.spec.ts`        | The pointer and keyboard loops navigate with `gotoHydrated`. Its two inline `System Boot` waits on `/` fold into `gotoHydrated` too. |
| `case-study.spec.ts`        | The back-link test navigates with `gotoHydrated`.                                                                                    |
| `not-found.spec.ts`         | The recovery-link test navigates with `gotoHydrated`.                                                                                |
| `theme.spec.ts`             | The UI toggle test navigates with `gotoHydrated`, and calls `expectHydrated` after `page.reload()`, before it clicks the nav link.   |
| `mobile/navigation.spec.ts` | `open()` becomes `gotoHydrated`, which also replaces its inline `System Boot` wait.                                                  |

A soft navigation needs no wait. The layout persists across it, so the marker stays `true`, and the
new route's content is rendered on the client rather than hydrated.

## Proof

- **Unit:** `src/components/__tests__/hydration-marker.test.tsx`. `renderToString` gives
  `data-hydrated="false"`. `hydrateRoot` over that same markup reaches `data-hydrated="true"`, and
  neither `onRecoverableError` nor `console.error` fires, so the flip is not a hydration mismatch.
  React reports an attribute-only mismatch, the only kind this component could produce, through
  `console.error` alone.
- **e2e:** `e2e/hydration-marker.spec.ts` on the desktop project, with `retries: 0`.
  - For every route in `PAGE_ROUTES`, plus `/work/does-not-exist`, the served document (read through
    the body of the `page.goto` response, so it is the document the browser navigated to, and parsed
    with `DOMParser`, as `served-html.spec.ts` does) holds exactly one
    `#hydration-marker` with `data-hydrated="false"`.
  - Loaded in the browser, each of those routes reaches `"true"` through `expectHydrated`.
  - With JavaScript disabled, `/work` keeps `"false"`, so the served markup alone cannot satisfy the
    wait; the unit test is what shows that React's hydration is what flips it.
- **Red first:** the unit test and the served-HTML test fail before the component exists. The
  helper's positive wait is also shown failing once against a layout that does not render the marker.

## Consequences

- A hidden span and a small client component join the root layout's chunk on every route. The first-load JS for
  `/` and `/work` is measured before and after and recorded in the pull request.
- #47 (hero-9) no longer needs a marker of its own. When it lands it deletes the loader, and the
  remaining `System Boot` waits move into this helper. The task files' plan sections are not editable
  by implementing agents, so the pull request records the change on #47 and #50 instead.
- PR #74 gets the add/add conflict from D5.
- CLAUDE.md's Testing bullet about the `System Boot` wait is rewritten around the marker.

## Verification

`pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test` exit 0, then both e2e modes:

```bash
pnpm --filter web test:e2e
```

```bash
pnpm --filter web build && CI=true pnpm --filter web test:e2e
```
