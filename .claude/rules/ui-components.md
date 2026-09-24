---
paths:
  - 'apps/web/src/components/**'
  - 'apps/web/src/hooks/**'
  - 'apps/web/src/app/globals.css'
  - 'apps/web/src/app/**/*.tsx'
  - 'apps/web/eslint.config.mjs'
  - 'apps/web/src/test/dimmed-text.test.ts'
---

# Components, colour tokens, GSAP and the accessibility gate

Split out of `CLAUDE.md` on 2026-09-24. Claude Code loads this file when it reads a
file matching `paths`; `CLAUDE.md` keeps the summary and the index of rules.

## Quality gates

- Accessibility is gated. `apps/web/e2e/accessibility.spec.ts` runs axe-core with the rule set
  behind Lighthouse's accessibility category (kept in `e2e/axe.ts`) on all ten routes in
  `e2e/routes.ts`, in both colour schemes at the desktop viewport, at rest; again on `/` after the
  whole story has been scrolled; and again on `/` with a header nav link hovered and with one focused.
  `e2e/mobile/accessibility.spec.ts` runs the at-rest pass on `/` and `/work/self-healing-agent`
  under both phone projects. Any violation fails the `e2e` job. Each pass asserts a floor on how many
  nodes it measured, so content that stops being rendered or goes transparent fails too. Each
  desktop at-rest pass also holds a per-route, per-scheme budget of `incomplete` colour-contrast
  nodes (`INCOMPLETE_CONTRAST_BUDGET`): axe cannot decide text over a `backdrop-filter` or a
  gradient and does not count it as a violation, so that undecidable region may shrink but never
  grow. The budget is zero on eight of the ten routes, so the first blurred panel put behind text
  there fails; never widen a budget or lower a floor to quieten a failure. A new
  `text-[var(--accent)]` or an opacity-dimmed label fails there; see the accent token bullet under
  Conventions and ADR 0011, which superseded 0008.

## Conventions

- The accent colour has two tokens with different roles (ADR 0011, superseding 0008). `--accent` paints surfaces:
  solid fills that carry white text, borders, indicators and the `bg-[var(--accent)]/10` tints.
  `--accent-text` is the accent as text and the only accent allowed in a `text-` utility or a
  `color` style, because `--accent` misses WCAG AA as text in the dark theme (3.5:1 on the
  background, 3.2:1 on the card).
  Decorative SVG frames, brackets and lines drawn with `currentColor` keep `--accent`; icons that
  sit with text take `--accent-text`. A component with a hard-coded dark background scopes the dark
  tokens with the `dark` class **and** sets `color` on that same element: `color` inherits as an
  already-resolved value, so scoping alone leaves an unclassed child with the page theme's colour. Never dim text with an opacity modifier such as `/60` to make
  it look secondary, not even `aria-hidden` text (axe measures it anyway); use `--muted` instead.
  Never let a GSAP `from()`, `fromTo()` or `set()` leave text at a partial opacity: the "from"
  state renders immediately, before any scroll trigger fires.
- Status colours come from three theme tokens (ADR 0010): `--status-ok`, `--status-warn` and
  `--status-err`, used as `text-[var(--status-ok)]`, `bg-[var(--status-ok)]/10`,
  `border-[var(--status-ok)]/50` and so on for text, icons, borders, tints, bars, dots and glows
  alike, in the hero and on the work pages. Never use a palette status class such as
  `text-green-400` or `bg-red-500` in a component, nor a hard-coded status hex with a `dark:`
  override, and never dim status text: no alpha modifier on a status token used as a text colour
  and no resting `opacity-*` below 100 on an element whose text carries one (a reveal from
  `opacity-0` to full is fine). The light values are the first shades that pass AA on the HUD
  panels and on their own tints; anything dimmer fails. Inside `Terminal` the tokens resolve to
  their dark values in both themes.
- Components live in `apps/web/src/components`. `index.ts` is a barrel for the page-level ones
  (`ThemeProvider`, `useTheme`, `Navigation`, `Footer`, `Highlights`, `FeaturedWork`, `TechStack`,
  `CTA`, `PersonJsonLd`, `WebsiteJsonLd`), plus the `Logo` wordmark the header and footer draw.
  The hero and its phases live in `components/animated-hero` and are imported from there
  directly, not through the barrel.
  Layouts import from the component modules directly, never through the barrel: every client module
  reachable from a server component's imports lands in that layout's client chunk, so a barrel
  import in `app/layout.tsx` would ship `FeaturedWork` to every route (see ADR 0009). A
  `no-restricted-imports` rule in `apps/web/eslint.config.mjs`, scoped to `src/app/**/layout.tsx`,
  fails lint on it. The rule is a pattern rather than one fixed path, and
  `apps/web/src/test/eslint-config.test.ts` pins the spellings it is known to catch (`@/components`
  and `../components`, bare, with a trailing slash, or as `/index` with or without a `.ts`, `.tsx`,
  `.js` or `.jsx` extension, and a nested layout's `../../components`) and the near misses it lets
  through. It does not see a dynamic `import()`, and it reads layouts only.
- GSAP is loaded lazily, never imported by a rendered component.
  `apps/web/src/components/animated-hero/gsap-runtime.ts` imports `gsap`, and only `load-gsap.ts`
  reaches it, through `import()`, once the browser is idle after hydration. Effects run GSAP work
  through `runWithGsap` and event handlers through `useWithGsap`; `import type` is fine. A static
  import from anything the home page reaches puts about 44 KB gzip back into its initial chunk, so
  `@typescript-eslint/no-restricted-imports` in `apps/web/eslint.config.mjs` refuses one everywhere
  in `src` except that module, the tests and `circuit-background.tsx`, which still imports GSAP and
  two plugins statically and is rendered by no route. `apps/web/src/test/eslint-config.test.ts`
  pins the rule.
