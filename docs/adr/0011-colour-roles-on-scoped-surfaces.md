# 0011. Colour roles, corrected for scoped surfaces and stacked tints

## Status

Accepted

## Date

2026-09-10

## Context

[ADR 0008](0008-accent-colour-roles.md) split the violet accent into a surface token `--accent` and
a text token `--accent-text`, tuned `--muted` alongside them, and wrote down the rules that follow.
It shipped in [#14](https://github.com/milosCvetkovicDev/website/pull/14). Validating that merge
against the combined tree, with the axe gate from #18 and the status colour tokens from #19 in
place, turned up two defects in the record itself. Both are corrections to 0008, not new decisions,
and this record carries them because an accepted record is not edited in place.

**The dark-surface rule was incomplete, and the gap was hiding invisible text.** 0008 said that
anything carrying text on a hard-coded dark surface "applies the `dark` class to scope the dark
tokens to its subtree". The `Terminal` component did exactly that. But `color` is an inherited
property whose value is resolved once, where it is declared: `body` sets `color: var(--foreground)`,
which resolves to `#171717` in the light theme, and every descendant inherits that resolved grey.
Redefining `--foreground` further down the tree does not re-resolve it. So scoping fixed only the
descendants that name a token themselves. A descendant with no colour class of its own kept the
light theme's near-black on the terminal's `#0d1117`, at 1.05:1. `game-complete.tsx` had exactly
one such element, the closing line "This is how I work. Every time.", which was invisible in the
light theme. Neither the Lighthouse audit nor the axe gate sees it, because both run at rest and
that phase sits at `opacity: 0` until its scroll trigger fires.

**`--muted` fails on a tint stacked on a tint.** 0008 set the light `--muted` to `#666666` and
claimed it "is tuned to pass on every surface it is used on". It passes on `--background` (5.5:1)
and on a single `bg-[var(--accent)]/5` or `/10` tint. It does not pass where a `/10` tag pill sits
on a `/5` panel, as the requirement tags do inside the discovery phase's HUD panel: the effective
background is `#e8def8` and `#666666` measures 4.40:1, under the 4.5:1 that record requires.

## Decision

The token roles from 0008 stand unchanged, with one value corrected:

| Token           | Light     | Dark      | Role                                                                                                       |
| --------------- | --------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `--accent`      | `#7c3aed` | `#7c3aed` | Surfaces: solid fills that carry white text (5.7:1), borders, indicators, tints, focus and selection.      |
| `--accent-text` | `#6d28d9` | `#a78bfa` | The accent as text. At least 4.5:1 on `--background`, `--card` and every accent tint up to `/20`.          |
| `--muted`       | `#636363` | `#a3a3a3` | Secondary text. `#666666` was 4.4:1 on a `/10` tag pill stacked on a `/5` panel; `#636363` is 4.6:1 there. |

`--accent-hover` is unchanged: `#6d28d9` light, `#834bf1` dark.

Every rule in 0008 carries over. One is corrected and one is added:

- **Corrected.** Anything that carries text on a hard-coded dark surface applies the `dark` class to
  scope the dark tokens to its subtree **and sets `color` on that same element**. The class alone
  only reaches descendants that name a token; `color` inherits as an already-resolved value, so a
  descendant with no colour class of its own keeps whatever the page theme resolved on `<body>`.
  `Terminal` in `animated-hero/hud-elements.tsx` is the one such surface today and now does both.
- **Added.** A token is only "tuned to pass" on surfaces it has actually been measured against.
  Translucent tints stack: a `/10` pill on a `/5` panel is a third surface, not either of the two.
  When a token is introduced or moved, measure it on the stacked case as well.

## Consequences

- The closing line of the hero is legible in the light theme. Setting `color` on the scoped element
  fixes the whole class of bug rather than that one element, so a future unclassed child of a
  terminal cannot reintroduce it.
- `--muted` is one step darker in the light theme. It gains contrast everywhere it is already used,
  from 5.5:1 to 5.7:1 on the page background, so nothing else needs revisiting.
- Neither defect is reachable by an at-rest audit, which is how both survived a run that scored 100.
  The gap between "the audit is green" and "the page is correct" is the scroll-triggered phases;
  auditing them properly means driving the page to the bottom first, which
  `apps/web/e2e/accessibility.spec.ts` deliberately does not do.
- 0008 is superseded rather than edited, so the numbers it quotes stay readable as the state on
  2026-09-09.

## Alternatives considered

**Amend ADR 0008 in place.** Two lines would have done it. Rejected because
[ADR 0001](0001-record-architecture-decisions.md) says an accepted record is superseded, not
rewritten, and 0008 had already merged.

**Give the terminal's unclassed text a colour class instead.** Fixes the one element found and
leaves the trap armed for the next one. Rejected: the surface should be self-contained.

**Leave `--muted` and give the tag prefix its own colour.** A local override on the element that
happens to fail, which is the per-element patching 0008 exists to stop. Rejected.
