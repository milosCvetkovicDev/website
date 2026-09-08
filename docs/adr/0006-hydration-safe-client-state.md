# 0006. Hydration-safe client state

## Status

Accepted

## Date

2026-09-08

## Context

`apps/web` pins `eslint-config-next` 16.1.5, which ships version 7 of the React Hooks ESLint
plugin. That version enables `react-hooks/set-state-in-effect`, and it flagged six places where
the codebase read browser-only state with the same shape:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
```

The six sites covered four kinds of state: mount detection (the animated hero and the theme
provider), the reduced-motion preference (the circuit background, the tmux background and the loop
phase), the theme, and the window scroll position (the hero scroll indicator).

The rule is not a style preference here. Every one of those sites rendered once with a value known
to be wrong, then set state from an effect and rendered again. For the theme that second render was
visible: the server sent dark markup, the effect read `localStorage`, and a user on light saw a
light-to-dark flash on first paint. Lint runs with `--max-warnings 0` in CI, so the code could not
be left as it was.

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

Every accessor is written defensively, because `getSnapshot` runs during render and on every store
notification. A throw there fails the render, not just an effect. So `localStorage` reads and
writes are wrapped in `try`/`catch` (it throws in private mode, with site data blocked, and on
quota), with a module-level `memoryTheme` fallback used when a write fails; `window.matchMedia` is
checked with a `typeof` guard before use in both hooks; and `IntersectionObserver` is checked with
`typeof IntersectionObserver === 'undefined'` before construction in `tmux-background.tsx`.

State that can be derived is derived rather than stored. The boot loader in
`apps/web/src/components/animated-hero/index.tsx` computes `isComplete` and `displayProgress` from
the `visible` prop instead of tracking completion separately, and `loop-phase.tsx` derives
`shownEvents`, `shownAlertStatus` and `protocolVisible` from `prefersReducedMotion` so the
reduced-motion end state is rendered directly rather than animated into place. Suppressing
`react-hooks/set-state-in-effect` with an `eslint-disable` comment is not acceptable here.

## Consequences

### Positive

- One render instead of two for each of these values, and no cascading update after hydration.
- The theme is correct on first paint, so the light-to-dark flash is gone.
- The scroll indicator is correct on reload at a restored scroll position, because the value is read
  rather than assumed to start at zero.
- Reduced motion and the OS colour scheme are live: changing either in system settings updates the
  page without a reload, and a theme change in one tab propagates to the others.
- Lint passes at `--max-warnings 0` with no suppressions, and the hooks are unit tested in
  `apps/web/src/hooks/__tests__/`.

### Trade-offs

- `getSnapshot` runs on every render, so `readTheme` touches `localStorage` and `matchMedia`
  frequently. Both are cheap, but the functions must stay allocation-free and must keep returning a
  referentially stable value or React will loop.
- The theme logic exists twice: once as the inline script string in `layout.tsx` and once as
  `readTheme` in `theme-provider.tsx`. The two must be kept in step by hand. `listeners` and
  `memoryTheme` are module-level state, which tests have to reset between cases.
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
- **Adopt `next-themes`.** Rejected. It adds a runtime dependency for a two-value toggle, and the
  defensive `localStorage` and `matchMedia` guards would still be needed around it.
