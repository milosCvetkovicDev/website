# 0008. Accent colour roles

## Status

Superseded by [ADR 0011](0011-colour-roles-on-scoped-surfaces.md)

## Date

2026-09-09

## Context

The site has one violet accent, `--accent: #8b5cf6`, and until this record it was used for
everything: text such as section labels and tag pills, solid button fills under white text,
borders, indicator dots, progress bars and the translucent tints behind pills. A Lighthouse 13.4.1
accessibility run on 2026-09-09 against the first production build scored `/` and
`/work/self-healing-agent` at 96, and every point lost to colour contrast traced back to that one
value being asked to do two jobs at once.

As text, `#8b5cf6` is 4.1:1 on the light background (`#fafafa`), 4.3:1 on the dark card
(`#171717`) and 3.9:1 on the dark `bg-[var(--accent)]/20` tint, all short of the 4.5:1 that WCAG
2.1 AA requires for normal text. As a fill under white text it is 4.2:1, also short. Any single
value fails one of the two roles: a colour light enough to read on the dark theme's surfaces cannot
carry white text, and a colour dark enough to carry white text disappears as text on the dark
theme. The pattern of dimming accent text with an opacity modifier (`text-[var(--accent)]/60`)
made it worse, down to 2.3:1; the same trick on the secondary `--muted` token survives only in the
boot loader, which leaves the DOM once the page has hydrated. The Featured Work heading had already run into it: it uses the tmux pane-title colour in
the dark theme to sit with the terminal chrome, and in the light theme it had to fall back to
`--accent-hover` because the accent failed there. That fallback is the per-element patching a
text-safe token makes unnecessary; the dark-theme tmux colour is a palette choice and stays.

Two related findings came out of the same audit. axe-core, the engine behind Lighthouse's
accessibility category, does not exempt `aria-hidden` elements from its contrast rule (it checks
what is visible on screen, not what assistive technology receives), so hiding decorative text from
screen readers does not remove a contrast failure. And GSAP's `fromTo()` renders its "from" state
the moment the tween is created, so a scroll-triggered reveal that starts at `opacity: 0.3` leaves
that text dimmed on the page for every visitor who has not scrolled there yet, which is the state
an audit sees.

## Decision

The accent is split by role into two tokens declared in `apps/web/src/app/globals.css`, with a
third token tuned alongside them:

| Token           | Light     | Dark      | Role                                                                                                  |
| --------------- | --------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `--accent`      | `#7c3aed` | `#7c3aed` | Surfaces: solid fills that carry white text (5.7:1), borders, indicators, tints, focus and selection. |
| `--accent-text` | `#6d28d9` | `#a78bfa` | The accent as text. At least 4.5:1 on `--background`, `--card` and every accent tint up to `/20`.     |
| `--muted`       | `#666666` | `#a3a3a3` | Secondary text. The light value was `#737373`, which was 4.3:1 on the `bg-[var(--accent)]/5` panels.  |

`--accent-hover` stays the hover state of solid fills: `#6d28d9` in light and `#834bf1` in dark,
so a hovered button still brightens in the dark theme while white text stays at 4.9:1 (the old
dark hover, `#a78bfa`, was 2.7:1).

Rules that follow from the split:

- `--accent-text` is the only accent allowed in a `text-` utility or a `color` style. `--accent`
  is never used as a text colour. Decorative frames, brackets and lines drawn with `currentColor`
  keep `--accent`, because they are graphics and their requirement is 3:1; icons that sit with text
  or on a tint take `--accent-text` like the text next to them.
- Text is not dimmed with an opacity modifier to look secondary, decorative or `aria-hidden` text
  included, since axe measures it either way. Secondary text uses `--muted`, which is tuned to
  pass on every surface it is used on.
- A GSAP reveal that animates opacity starts from `0`, never from a partial value, so hidden text
  is skipped by the audit rather than measured in its dimmed state.
- Purely visual chrome, such as the section readout in the hero's corner frame, is `aria-hidden`
  for the benefit of screen-reader users and still meets the contrast requirement, because the
  two are independent.
- Anything that carries text on a hard-coded dark surface, such as the `Terminal` window in the
  hero, applies the `dark` class to scope the dark tokens to its subtree instead of picking colours
  by hand.

## Consequences

- Both audited pages score 100 on the accessibility category, and the theme is AA-clean on the
  home page and the case study at rest in light and dark.
- The dark theme's accent text is a step lighter (`#a78bfa`, the previous hover colour) and the
  light theme's a step deeper (`#6d28d9`); solid fills are one Tailwind step deeper (`#7c3aed`)
  in both. The hue, the tints and the layout are unchanged. The glows are hard-coded
  `rgba(139,92,246,…)` and were left alone: they read as a lighter halo around the deeper fill.
- Every one of the 74 accent text usages was renamed to `text-[var(--accent-text)]`; a new
  `text-[var(--accent)]` on text is a review finding, not a style choice.
- The hero's scrolled-in phases still contain hard-coded palette colours (`text-green-400`,
  `text-yellow-400`) that fail in the light theme once revealed. They are not covered by the
  tokens and are left for a follow-up. They do not affect the audit because every phase sits at
  `opacity: 0` until its scroll trigger fires, and axe skips hidden elements; the audit runs on
  the unscrolled page.

## Alternatives considered

**Lighten `--accent` itself in the dark theme.** Fixes the text at the cost of every white-on-accent
button (2.7:1 at `#a78bfa`) and changes the colour of every border, dot and tint. Rejected because
the fill role needs the opposite adjustment.

**Nudge only the elements Lighthouse named.** The four case-study pills and the three hero labels
could be patched with `dark:` variants. Rejected because the same value fails in the same way on
every other page, and the Featured Work heading showed where that road leads.

**Keep `--accent` as the text colour and add a `--accent-fill` for buttons.** Leaves 90 text usages
on a token that fails AA on the light background, so the light theme would still need a second
pass. Rejected in favour of naming the text role explicitly.

**Hide the failing decorative text from assistive technology.** Does not change what axe-core
measures, so the audit would still fail; and the text would still be hard to read. The readout is
hidden anyway, for screen-reader users, in addition to being made legible.
