# 0006. Hydration-safe client state

## Status

Accepted

## Date

2026-09-08

## Context

`apps/web` pins `eslint-config-next` 16.1.5, which ships version 7 of the React Hooks ESLint
plugin. That version's recommended set turns on `react-hooks/set-state-in-effect`, and it reported
six effects that computed state React could have read directly. Most of them had the same shape:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
```

The six were the theme provider's mount effect (`setTheme` and `setMounted` in one effect), three
effects in `animated-hero/index.tsx` (`BootstrapLoader`'s `setIsComplete`, its `setProgress`
follow-up, and `AnimatedHero`'s `setMounted`), the shared `usePrefersReducedMotion` in
`animated-hero/use-gsap-scroll.ts`, and the dead `components/hero.tsx`, which was deleted rather
than migrated. Between them they covered three kinds of browser state: mount detection, the
reduced-motion preference and the theme. A local copy of the reduced-motion effect in
`animated-hero/tmux-background.tsx` was not reported but had the same shape, and it was migrated
with the rest. The hero scroll indicator was not reported either; its initial value was merely
wrong on a reload at a restored scroll position, and it is fixed here with the same mechanism.

The rule is not a style preference here. Each of those sites rendered once with a value already
known to be wrong, then set state from an effect and rendered again. For the theme that second
render was visible: the server sent dark markup, the effect read `localStorage`, and a user on
light saw a light-to-dark flash on first paint. `react-hooks/set-state-in-effect` is an error in
the plugin's recommended set, which `eslint-config-next` enables, so CI failed on it outright. See
[ADR 0003](0003-formatting-and-linting-standards.md) for the lint bar and
[ADR 0004](0004-ci-pipeline-and-quality-gates.md) for where it runs.

## Decision

Browser state that React does not own is read with `useSyncExternalStore`, never with an effect
that calls `setState`. Four call sites encode this:

| Concern         | Where                                                    | Server snapshot |
| --------------- | -------------------------------------------------------- | --------------- |
| Mount detection | `apps/web/src/hooks/use-is-hydrated.ts`                  | `false`         |
| Reduced motion  | `apps/web/src/hooks/use-prefers-reduced-motion.ts`       | `false`         |
| Theme           | `apps/web/src/components/theme-provider.tsx`             | `'dark'`        |
| Scroll position | `apps/web/src/components/animated-hero/hero-section.tsx` | `false`         |

`useIsHydrated` uses a no-op subscribe with a client snapshot of `true` and a server snapshot of
`false`, so it reads `false` while server-rendering and while hydrating, then `true` once React has
mounted. `usePrefersReducedMotion` subscribes to the `(prefers-reduced-motion: reduce)` media
query. The theme provider subscribes to both the `storage` event and the
`(prefers-color-scheme: dark)` query, keeping a module-level listener set so `toggleTheme` can
notify React after a write.

The server snapshot is not a fallback value, it is a contract. React calls `getServerSnapshot`
during the SSR pass **and** during the hydration render, and compares the resulting markup with the
HTML the server sent. If it returned the real browser value, hydration would mismatch and React
would throw away the server HTML for that subtree. That is why `useIsHydrated` is deliberately
`false` during hydration rather than `true`: it is the value the server actually rendered with.

Because the theme snapshot is a fixed `'dark'` on the server, correct first paint is handled
outside React. `themeInitScript` in `apps/web/src/app/layout.tsx` runs in `<head>` before hydration
and adds `dark` or `light` to `<html>`, and both `<html>` and `<body>` carry
`suppressHydrationWarning` so that class is not treated as a mismatch. The provider's effect
mirrors the same class after hydration, so nothing flips during the hydration commit itself.

Every accessor reached through `useSyncExternalStore` is written defensively, because `getSnapshot`
runs during render and on every store notification. A throw there fails the render, not just an
effect. So `localStorage` reads and writes are wrapped in `try`/`catch` (it throws in private mode,
with site data blocked, and on quota), with a module-level `memoryTheme` fallback used when a write
fails; and `window.matchMedia` is checked with a `typeof` guard in `usePrefersReducedMotion`, which
guards `window` itself as well because its subscribe path can run before the client snapshot, and
in the theme provider's `canMatchMedia`, which only ever runs on the client.
`IntersectionObserver` is checked with `typeof IntersectionObserver === 'undefined'` before
construction in `tmux-background.tsx`, but not for the render-safety reason above: that call sits
in an effect, and the guard is there because jsdom does not define the API and the unit tests stub
browser globals per file. The same guards are not yet applied to the six components that still
sample `matchMedia` inline, or to the `IntersectionObserver` in `circuit-background.tsx`; those
also run only in effects, where a throw is contained, but they should converge on the hooks.

State that can be derived is derived rather than stored. The boot loader in
`apps/web/src/components/animated-hero/index.tsx` computes `isComplete` and `displayProgress` from
the `visible` prop instead of tracking completion separately, and `loop-phase.tsx` derives
`shownEvents`, `shownAlertStatus` and `protocolVisible` from `prefersReducedMotion` so the
reduced-motion end state is rendered directly rather than animated into place. Suppressing
`react-hooks/set-state-in-effect` with an `eslint-disable` comment is not acceptable here.

Hooks that wrap browser state live in `apps/web/src/hooks/`, one file per concern, each with a test
in `apps/web/src/hooks/__tests__/`. `usePrefersReducedMotion` moved there from
`animated-hero/use-gsap-scroll.ts`, which now exports only `useGsapScroll` and the GSAP re-exports,
so an older import of it will not resolve. `apps/playground` enables the same plugin's recommended
set from its own `eslint-plugin-react-hooks` 7 and is held to the same rule. Verify with
`pnpm --filter web lint` and `pnpm --filter web test`.

## Consequences

### Positive

- The second render is part of the hydration contract instead of an effect-driven cascade: React
  reads the server snapshot, commits, then re-renders once from the client snapshot if it differs.
  No effect fires, and no downstream effect chain is triggered by the change.
- The theme is correct on first paint, so the light-to-dark flash is gone.
- The scroll indicator corrects itself on reload at a restored scroll position. The hydration render
  still uses the server snapshot (`false`), but the client snapshot is read immediately after the
  commit rather than waiting for the next scroll event, which is what the old effect required.
- Reduced motion is live in the three components that use the hook: the circuit background, the tmux
  background and the loop phase. Six others (`discovery-phase`, `strategy-phase`, `execution-phase`,
  `gauntlet-phase`, `game-complete` and `section-progress`) still sample `matchMedia` once inside an
  effect and are left for a later change. A theme change in one tab propagates to the others through
  the `storage` event. The OS colour scheme is live only while nothing is stored: a stored
  preference wins, by design.
- Lint passes at `--max-warnings 0` with no `react-hooks` suppressions anywhere; the only
  `eslint-disable` comments in `apps/web` are two `@typescript-eslint/no-explicit-any` lines in
  `animated-hero/animated-text.tsx`. The hooks are unit tested in `apps/web/src/hooks/__tests__/`
  and the theme store in `apps/web/src/components/__tests__/theme-provider.test.tsx`.

### Trade-offs

- `getSnapshot` runs on every render, so `readTheme` touches `localStorage` and `matchMedia`
  frequently. Both are cheap, but the functions must stay allocation-free and must keep returning a
  referentially stable value or React will loop.
- The theme logic exists twice: once as the inline script string in `layout.tsx` and once as
  `readTheme` in `theme-provider.tsx`. The two must be kept in step by hand.
- `listeners` and `memoryTheme` are module-level state with no reset hook. `theme-provider.test.tsx`
  works around this by ordering its cases so the blocked-storage block runs last; a case added after
  it would inherit a poisoned `memoryTheme`, because once a write has failed `readStoredTheme`
  prefers `memoryTheme` over `localStorage` for the rest of the module's lifetime.
- Users whose stored preference is light still receive dark HTML from the server; the inline script
  corrects it before paint, and `suppressHydrationWarning` is required for that to be legal.
- `useIsHydrated` still renders mount-gated UI twice by design. That is the price of a correct
  hydration pass, not a bug to remove.

## Alternatives considered

- **Disable the rule.** Rejected. The rule was describing two real defects (an extra render and a
  visible flash), so silencing it would have kept both.
- **Keep the effect but hoist it into one context provider exposing `mounted`.** Rejected. It moves
  the cascade rather than removing it, still renders the wrong value once, and still needs the
  suppression.
- **Store the theme in a cookie and render it on the server.** This is the only option that removes
  all three theme trade-offs above: the server would emit the correct class, the inline script and
  `suppressHydrationWarning` would both go, and `getServerSnapshot` could return the real value.
  Rejected because reading a cookie makes every page dynamic, which opts the routes out of the full
  static prerender that [ADR 0005](0005-hosting-on-vercel.md) depends on. A four-line script kept in
  step by hand is the cheaper cost.
- **Adopt `next-themes`.** Rejected. It adds a runtime dependency for a two-value toggle, and the
  defensive `localStorage` and `matchMedia` guards would still be needed around it.
