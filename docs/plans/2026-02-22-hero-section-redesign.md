# Hero Section Redesign

## Problem

The current hero section has three issues:
1. **Background is monotonous** — three fixed full-viewport layers (grid, canvas particles, scanlines) persist across the entire page, creating visual fatigue
2. **No story hook** — the hero is all game-UI chrome (player card, "NEW QUEST RECEIVED") with no inciting incident that drives the visitor to scroll
3. **Identity is incomplete** — "AI-Native Engineer" reduces a 13-year full-stack career to one trait. The player card doesn't reflect the real CV

## Solution

Redesign the hero section with story-first content and a contained atmospheric background.

### Content Layout (top to bottom)

**1. Player Card** (updated from CV)
```
PLAYER     Milos Cvetkovic
CLASS      Full Stack Engineer & Architect
SPEC       AI-Native Development
XP         13 years · 6 domains · 3 clouds
STATUS     ● Building at Obsidian 22
```

**2. Inciting Incident Terminal** (center stage, animated typing)
```
[03:14:07] ALERT  Error rate spike — production
[03:14:08] AGENT  Analyzing root cause...
[03:14:12] AGENT  Fix generated → PR #847 opened
[03:14:15] ✓      Tests passing. Awaiting approval.
           STATUS Nobody got paged.
```
This mirrors the Loop Phase (section 6) payoff, creating a narrative circle. The visitor sees a self-healing system in action and wants to know how it works.

**3. Headline**
> "This happened at 3am. Nobody woke up."
> I build systems that inherit chaos and ship clarity. Scroll to see how.

**4. Skill Tags** (floating below, subtle)
`TypeScript` `React` `NestJS` `Azure` `Terraform` `Claude Code` `DDD` `Kubernetes`

**5. Scroll Indicator** (same as current)

### Background Treatment

- **Remove** the three fixed global layers: GridBackground, AmbientBackground (canvas), ScanLines
- **Replace with** a dark atmospheric gradient contained to the hero section only (`position: absolute`, not `fixed`)
- Subtle radial violet glow behind the incident terminal
- Faint noise texture for depth
- Bottom gradient fade to `#0a0a0a` for clean transition to next section
- No grid lines, no floating code particles, no scan lines

### Technical Changes

**Files to modify:**
- `animated-hero/index.tsx` — Remove GridBackground, AmbientBackground, ScanLines imports and rendering
- `animated-hero/loading-screen.tsx` — Replace content with new player card, incident terminal, headline, skill tags
- `animated-hero/ambient-background.tsx` — Replace GridBackground/ScanLines with new `HeroBackground` component (contained to section)
- `animated-hero/hud-elements.tsx` — Update Terminal, StatDisplay to support new player card fields

**Files to potentially add:**
- `animated-hero/incident-terminal.tsx` — Animated typing sequence for the 3am incident

**Data source:**
- Player card stats derived from CV: Milos_Cvetkovic_-_Senior_Full_Stack_Software_Engineer.pdf
- Skill tags: TypeScript, React, NestJS, Azure, Terraform, Claude Code, DDD, Kubernetes

### Narrative Alignment

The hero now properly sets up the homepage quest arc:
1. **Hero** — See a self-healing system in action, meet the builder → "How did he do that?"
2. **Discovery** — He starts by asking the right questions
3. **Strategy** — Picks tools with purpose
4. **Execution** — Builds at velocity
5. **Gauntlet** — Passes quality gates
6. **Loop** — The system heals itself (callback to hero's incident)
7. **Game Complete** — "Let's build your system"

### Design Principles

- Background serves the story (mission control at night), not decoration
- Background is contained to hero section only — other sections have their own visual identity
- Content creates a question ("how?") that drives scrolling
- Player card reflects real CV data, not a reduced caricature
