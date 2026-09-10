# 0010. Status colour tokens

## Status

Accepted (corrected 2026-09-10)

## Date

2026-09-09

## Context

ADR 0008 split the violet accent by role and left one class of contrast failure for a follow-up:
the hero's scrolled-in phases (Strategy, Execution, The Gauntlet, The Loop, Session Complete) and
the HUD elements they share coloured their status text, icons, borders, tints, bars and dots with
Tailwind palette classes: `text-green-400`, `text-yellow-400/80`, `text-red-400`,
`bg-green-500/10`, `border-green-500/50` and similar. The review of this record found the same
class of colour in three more places that no audit had reached: the hero island's `STATUS`
readout, which hard-coded `#16a34a` with a `dark:` override to `#4ade80` (3.3:1 on its card in the
light theme, above the fold), and the live-status dot, label and impact ticks on `/work` and
`/work/[slug]` (`text-green-500/80` at 1.9:1, `text-green-400` at 1.7:1). In all, 62 palette sites
and the three toast glows across eleven files.

The 400 shades were chosen for the dark theme, where they measure between 6.0:1 and 12.6:1 on
the page, on the HUD panels and on their own tints. Nothing in those classes is theme-aware, so the
light theme rendered the same colours on a near-white page, where they measure 1.3:1 to 1.7:1 once
their section has scrolled into view: "DEPLOYMENT SUCCESSFUL", the synergy toasts, "COMMIT
STREAK", the "99.9%" metric and the achievement toasts among them. An axe-core 4.11.1 run in the
light theme against the production build reported 11 failing nodes per viewport after scrolling to
the bottom of `/`, and 7 mid-animation; none at rest, because every phase sits at `opacity: 0`
until its scroll trigger fires, which is why the audits behind ADR 0008 never saw them. The hero
island and the `/work` cards sit on translucent surfaces, for which axe returns "needs review"
rather than a verdict, so those failures were found by computation.

The tmux background solved the same problem for its status bar with per-theme tokens
(`--tmux-status-ok` `#15803d`, `--tmux-status-wrn` `#b45309`, `--tmux-status-err` `#dc2626`:
Tailwind v3's green-700, amber-700 and red-600), but those are tuned for the pane background
alone. Status text in the phases sits on four light surfaces: the page (`#fafafa`), a HUD panel
(the accent at 5% over the page), its own 10% tint over the page (the toasts and the deployment
and combo panels) and that tint inside a HUD panel (the alert box). Each layer of tint costs a
third to a half of a ratio point. green-700 and amber-700 pass on the page (4.7:1 and 4.8:1) and
fail on a HUD panel (4.40:1 and 4.47:1) and on their tints (3.9:1 to 4.2:1); red-600 fails on every
surface but the page; red-700 passes everywhere. Dimming makes it worse: status text with an
opacity modifier fails on every candidate shade (green-800 at `/70` is 3.2:1 on its tint), the
same trap ADR 0008 closed for the accent.

## Decision

Three status tokens are declared in `apps/web/src/app/globals.css` beside the accent tokens and
registered in `@theme inline` like them. Each references a Tailwind palette shade with
`theme(--color-green-800)` and so on; the build inlines the oklch value (as `lab()`, with a hex
fallback for browsers without it), so the dark shades are exactly the ones the status text used
before and the light shades are named rather than tuned by hand.

| Token           | Light               | Dark                 | Role                                                                                                    |
| --------------- | ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `--status-ok`   | `green-800` #016630 | `green-400` #05df72  | Success: passed stages, resolved alerts, the deployment panel, toasts, ticks, the live-status readouts. |
| `--status-warn` | `amber-800` #973c00 | `yellow-400` #fdc700 | Attention: running stages, deploying, the commit streak, the auto-fix count.                            |
| `--status-err`  | `red-700` #c10007   | `red-400` #ff6467    | Failure: failed stages, the error alert, error lines in the healing log.                                |

The hex values are what Chromium renders for the inlined `lab()` colours, read back from the page
through a canvas; the build's hex fallbacks for amber-800 and red-700 differ by a few units
(`#953d00`, `#bf000f`) because Lightning CSS maps out-of-gamut oklch differently. Contrast is
computed from the rendered values with the tints blended in gamma space, which reproduces axe's
own background readings (`#e1f5e9` for green-500 at 10% over the page). Light theme, hardest
surface first (its own tint inside a HUD panel, its own tint over the page, a HUD panel, the page):
`--status-ok` 5.5, 5.9, 6.3 and 6.8:1; `--status-warn` 5.4, 5.8, 6.3 and 6.8:1; `--status-err` 4.8,
5.1, 5.7 and 6.2:1. A hovered HUD panel doubles its accent tint, which takes the error alert to
4.5:1 for the seconds it is red; red-800 would add margin and was judged too dark for the
healing-log line. Dark-theme text keeps its previous colours and stays at 6.0:1 or better
everywhere.

Rules that follow:

- One token per role serves every use: text, icons drawn with `currentColor`, borders
  (`border-[var(--status-ok)]/50`), tints (`bg-[var(--status-ok)]/10`), progress bars, indicator
  dots, strike-through decoration and the toast glows
  (`shadow-[0_0_20px_color-mix(in_oklab,var(--status-ok)_20%,transparent)]`). A palette status
  class in a component (`text-green-400`, `bg-red-500` and the like), a hard-coded status hex, or a
  `dark:` override that swaps one for another, is a review finding.
- Status text is never dimmed: no alpha modifier on a status token used as a text colour, and no
  resting `opacity-*` below 100 on an element whose text carries one. Alpha on tints, borders and
  decoration is the design, and a reveal from `opacity-0` to full opacity is not dimming. A
  secondary line in a toast takes the toast colour at full opacity; the weight of the title carries
  the hierarchy.
- The tokens are used in the arbitrary-value form (`text-[var(--status-ok)]`), the convention ADR
  0008 set for the accent; the `--color-status-*` registration in `@theme inline` exists for parity
  with the other tokens and emits nothing until a utility uses it.
- Inside the `Terminal` window, which carries the `dark` class so the `.dark { … }` block applies to
  its subtree (ADR 0008), the tokens resolve to their dark values in both themes: "SESSION
  COMPLETE" and the chat arrows render exactly as before.
- Syntax highlighting inside `Terminal` (`text-purple-400`, `text-blue-400`, `text-yellow-300`) and
  the red and cyan split of the glitch effect in `AnimatedText` are not status colours and keep
  their palette classes. The tmux tokens keep theirs: they are a palette choice for the pane
  chrome, not status roles of the page.

## Consequences

### Positive

- axe-core reports no failing node on `/` in either colour scheme at rest, mid-animation and fully
  scrolled, on desktop and mobile viewports, and none on `/work` and `/work/self-healing-agent`.
  Text inside the HUD panels and on the translucent cards comes back "needs review" rather than
  pass, because `backdrop-blur-sm` and alpha backgrounds stop axe resolving their backdrop; the
  ratios above are computed for those nodes.
- Status colours have one source of truth per theme. Retuning a shade or adding a theme is a change
  to `globals.css`, not to eleven files.
- The hero island's status readout (7.1:1 on its card), the `/work` status labels and ticks, the
  boot loader's ticks and the quest-log ticks are legible in the light theme as well.

### Trade-offs

- Dark theme: status text and icons stay on the green-400, yellow-400 and red-400 shades, and
  every colour inside the hero phases keeps its exact bytes (`#05df72`, `#fdc700`, `#ff6467`,
  measured in the page before and after). Five elements outside the phases do change, each of them
  previously on a different shade: the hero island's readout and the dot beside it, both from
  Tailwind v3's green-400 `#4ade80` to v4's `#05df72`; and on the work pages the live-status label
  (green-500 at 80% alpha), the dot beside it (green-500) and the case-study impact tick icon
  (green-500), all to `#05df72` at full opacity. Solid status fills (the pipeline bars, the alert
  dot, the work cards' live-status dot, the unused `ProgressBar` variants) move from the 500 shade
  to the 400 shade the text used, one Tailwind step lighter; the 10% tints, the 50% borders and
  the 20% glows shift by the same step, which is not visible at those alphas.
- Light theme: this is where the look changes. Bars, dots, borders, tints and glows are now the 800
  and 700 shades, darker than the 500 shades that shipped; a 10% tint of green-800 over the page is
  a grey-green rather than a mint. The warn colour is a dark amber rather than a yellow: no yellow
  lighter than yellow-800 clears 4.5:1 on these surfaces, yellow-700 reaching 3.88:1 on its own
  tint inside a HUD panel. Yellow-800 itself clears it there, at 5.28:1.
- Six pieces of status text were dimmed and are now at full colour in both themes: "COMMIT STREAK"
  (`/80`), "Production environment updated" (`/70`), the work cards' live-status label (`/80`), the
  hover-only "LOCKED" label (`/60`, now also `aria-hidden`), and the subtitles of the two toasts
  (`opacity-80`).
- The alpha forms compile to `color-mix()` under `@supports`, with the solid colour as the
  fallback, so a browser without `color-mix()` would paint the tints solid. Every accent tint on
  the site already has that shape, and Tailwind v4's floor (Safari 16.4, Chrome 111, Firefox 128)
  excludes such browsers.
- The rule is enforced by review, like ADR 0008's; an ESLint restriction on palette status classes
  and an axe run in the e2e job are the natural follow-up.

## Alternatives considered

**A `dark:` override per usage**, such as `text-green-800 dark:text-green-400`. 62 places to keep
in step, each a chance to miss one; the hero island had exactly that pattern and still failed, and
the tmux background had already established the token approach for the same problem. Rejected.

**Separate text and fill tokens**, mirroring the accent split in ADR 0008, so that dark bars and
dots keep their 500 shade. Six tokens for a one-step difference on a 2px bar and a 12px dot; the
accent split exists because white text sits on the accent fill, which no status colour carries.
Rejected for now; fill tokens can be added later if the shade is missed.

**Reuse the tmux tokens.** Their light values are tuned for the pane background and measure 4.2:1
on a green tint, and their dark values (`#b9e87a` and friends) are not the colours the phases use,
so the dark theme would change. Rejected.

**Move only the text and leave fills on palette classes.** Fixes the audit but leaves two colour
systems in the same files and a rule with a footnote. Rejected.

## Corrections

### 2026-09-10

Six factual claims in this record were false when it was accepted. The decision is untouched: the
three tokens, their values and the rules that follow from them all stand. They were found by an
independent audit of the merged branch and checked by a second reviewer who recomputed every figure
from source.

The ratios below come from one script, `ratio.mjs`, which reads the oklch definitions out of the
installed `tailwindcss/theme.css`, converts them to sRGB, composites the tints over the page in
gamma space and applies the WCAG 2.x relative-luminance formula. It is checkable against axe rather
than self-asserted: it reproduces axe's own reported background of `#e1f5e9` for green-500 at 10%
over `#fafafa`. The surfaces are the page `--background` `#fafafa`, a `HudPanel` at `--accent` 5%
(`hud-elements.tsx:94`), the same panel hovered at 10% (`hover:bg-[var(--accent)]/10`, same line),
and a status token's own 10% tint over each.

```
$ node ratio.mjs green-700 amber-700 red-700 yellow-700 yellow-800
shade        hex      page   panel  own/10  own/10@panel  own/10@hovered
green-700    #008236  4.738  4.399  4.139  3.861  3.607
amber-700    #bb4d00  4.820  4.474  4.214  3.922  3.672
red-700      #c10007  6.152  5.711  5.111  4.764  4.456
yellow-700   #a65f00  4.725  4.386  4.167  3.880  3.609
yellow-800   #894b00  6.553  6.084  5.672  5.278  4.906
```

1. Context said green-700 and amber-700 "fail on a HUD panel (4.4:1 and 4.5:1)". Amber-700 on a HUD
   panel is 4.474:1, and rounding it to "4.5:1" while calling it a failure prints the AA threshold
   itself as a failing value. Replaced with "(4.40:1 and 4.47:1)". Evidence: the `panel` column
   above, green-700 4.399 and amber-700 4.474.

2. Decision says, of the light-theme ratios: "A hovered HUD panel doubles its accent tint, which
   takes the error alert to 4.5:1 for the seconds it is red; red-800 would add margin and was
   judged too dark for the healing-log line." The sentence stands as accepted, and this entry
   records what is true. The value is 4.456:1, not 4.5:1, so it is below the threshold rather than
   at it. This is the one state in the change that does not meet the bar the record is about, and
   the record presented it as meeting it. Evidence: the `own/10@hovered` column above, red-700
   4.456, against 4.764 at rest in `own/10@panel`. The element is the loop phase's alert box,
   `loop-phase.tsx:175-200`, which carries `border-[var(--status-err)]/50 bg-[var(--status-err)]/10`
   and `text-[var(--status-err)]` inside the `MONITORING DASHBOARD` `HudPanel` at
   `loop-phase.tsx:159`. Context says "red-700 passes everywhere"; that sentence is scoped to the
   four surfaces its own paragraph names, and a hovered panel is not one of them, so it is left as
   written.

3. Consequences said dark-theme "text, icons and the readouts keep their bytes ... except the hero
   island's readout", naming one exception where there are five, all of them brought into the
   change during its review. Now enumerated. Evidence:

   ```
   $ git diff b037b75 217ae62 -- apps/web/src/components/animated-hero/hero-content.tsx \
       apps/web/src/app/work/page.tsx 'apps/web/src/app/work/[slug]/page.tsx'
   -  <dd className="font-mono text-[#16a34a] dark:text-[#4ade80]" ...
   -    className="mr-1.5 ... rounded-full bg-[#16a34a] dark:bg-[#4ade80]"
   -  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
   -  <span className="font-mono text-[10px] text-green-500/80">{meta.status}</span>
   -  <span className="mt-1.5 text-green-500">
   ```

   Tailwind v3 green-400 is `#4ade80` and v4 green-400 is `#05df72`; v4 green-500 is `#00c950`.
   Every other removed status class was already a 400 shade, which the tokens reproduce byte for
   byte.

4. Consequences said "no yellow clears 4.5:1 on a light surface". Yellow-800 `#894b00` clears it on
   all four surfaces this record lists, its worst being 5.278:1 on its own tint inside a HUD panel.
   Yellow-700, the next shade lighter, already fails there at 3.880:1, and every lighter yellow
   fails by more. Evidence: the `yellow-800` and `yellow-700` rows above.

5. Consequences said "Five pieces of status text were dimmed"; there are six. The one missing from
   the list is the work cards' live-status label. Evidence:

   ```
   $ git grep -nE 'text-(green|yellow|amber|red)-[0-9]{3}/[0-9]+' b037b75 -- apps/web/src
   b037b75:apps/web/src/app/work/page.tsx:78: ... text-green-500/80">{meta.status}</span>
   b037b75:.../animated-hero/execution-phase.tsx:295: ... text-yellow-400/80">COMMIT STREAK</span>
   b037b75:.../animated-hero/gauntlet-phase.tsx:230: ... text-green-400/70">
   b037b75:.../animated-hero/strategy-phase.tsx:183: ... text-green-400/60 opacity-0 ...
   ```

   Four alpha-dimmed status texts, plus the two toast subtitles carrying `opacity-80`
   (`gauntlet-phase.tsx:246`, `loop-phase.tsx:230`), is six.

6. Consequences said the hero island's status readout is "6.8:1". That is its ratio on the page, and
   the readout is not on the page: `hero-content.tsx:24` puts it on `bg-white/95`, which composites
   to `#ffffff` over `#fafafa`. On that surface it is 7.132:1. Replaced with "7.1:1 on its card".
   Evidence, using the same conversion with the card as the background:

   ```
   card = #ffffff
   green-800 #016630 on that card: 7.132
   old #16a34a on that card:       3.296
   ```

   The 3.296 figure is the one Context already reports as "3.3:1 on its card", so both sections now
   measure that node on the same surface.
