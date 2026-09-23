## Building with this design system

These are the live site's own components (miloscvetkovic.dev), on `window.Portfolio`, styled with
Tailwind v4 utilities over CSS variables. There is no Button or Card component: the site writes
those in utility classes, and the recipes below are the site's own.

### Setup

- Wrap the design in `<ThemeProvider>`. It holds the theme that `Navigation`'s toggle reads and
  puts `light` or `dark` on `<html>` from the visitor's saved choice or OS setting.
- The dark theme is a `dark` class on an ancestor. To pin a region's theme, put the class and the
  colours on the same element, because `color` inherits already resolved:
  `<div className="dark bg-[var(--background)] text-[var(--foreground)]">`.
- `Terminal` is always dark, whatever the page theme. Links in `Navigation` and `Footer` are plain
  `<a>` tags here, and no link shows as the current page.

### Tokens

CSS variables, light values in `:root` and dark ones in `.dark`:

| Role           | Utilities                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Page           | `bg-[var(--background)]` `text-[var(--foreground)]`                                                       |
| Surface        | `bg-[var(--card)]` `hover:bg-[var(--card-hover)]` `border-[var(--border)]`                                |
| Secondary text | `text-[var(--muted)]`                                                                                     |
| Accent surface | `bg-[var(--accent)]` `hover:bg-[var(--accent-hover)]` `bg-[var(--accent)]/10` `border-[var(--accent)]/30` |
| Accent text    | `text-[var(--accent-text)]`                                                                               |
| Status         | `text-[var(--status-ok)]` `bg-[var(--status-warn)]/10` `border-[var(--status-err)]/50`                    |

- Accent text only ever uses `--accent-text`: `--accent` as text fails WCAG AA in the dark theme.
- Never dim text with an opacity modifier or `opacity-*`; use `--muted`.
- Status colours come only from `--status-ok`, `--status-warn` and `--status-err`, never from
  palette classes such as `text-green-400`.

### Type and layout

- `font-sans` is Geist, the body font; `font-mono` is Geist Mono. HUD labels are
  `font-mono text-xs uppercase tracking-wider text-[var(--muted)]`.
- Section: `<section className="border-t border-[var(--border)] py-20">` around
  `<div className="mx-auto max-w-5xl px-6">`; heading `text-3xl font-bold md:text-4xl`; lead
  `text-lg text-[var(--muted)]`.
- Primary button:
  `inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white hover:bg-[var(--accent-hover)]`.
  Secondary button:
  `inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--card-hover)]`.
- Every link, button and other focusable element also carries the site's focus ring:
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`.
  Leave it on: without it a keyboard user cannot see where they are.
- Only classes compiled into `_ds_bundle.css` exist. The common layout families are there (flex,
  grid, `md:grid-cols-*`, gap, padding, margin, `max-w-*`, text sizes, rounded, shadow); for
  anything else use an inline style with the tokens, such as `style={{ color: 'var(--muted)' }}`.

### Where the truth lives

- `_ds_bundle.css` holds the tokens (search for `:root {` and `.dark {`) and every utility.
- Each component's `.prompt.md` and `.d.ts` hold its props and working examples.
- Groups: `hud` (panels, terminal, stats and status rows: the site's signature look and the parts to
  build new UI from), `sections` (whole page sections), `featured-work`, and `animated-hero` (the
  home page's scroll story: decorative set pieces, not building blocks).
- `<CTA />`, the closing "Let's Connect" section with the LinkedIn, GitHub and X buttons, takes no
  props. It is on `window.Portfolio` but has no card of its own.

### Example

```jsx
<ThemeProvider>
  <section className="dark bg-[var(--background)] px-6 py-20 text-[var(--foreground)]">
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
      <HudPanel title="CI/CD PIPELINE" glow>
        <div className="space-y-3">
          <PipelineStage name="BUILD" status="passed" />
          <PipelineStage name="E2E TESTS" status="running" progress={64} />
        </div>
      </HudPanel>
      <HudPanel title="QUEST LOG">
        <div className="space-y-2">
          <QuestItem completed>Scope locked</QuestItem>
          <QuestItem completed={false}>Architecture designed</QuestItem>
        </div>
      </HudPanel>
    </div>
  </section>
</ThemeProvider>
```
