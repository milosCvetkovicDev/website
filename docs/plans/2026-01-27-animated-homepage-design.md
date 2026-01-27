# Animated Homepage Design: "Watch Me Work"

## Overview

A game-inspired, animated homepage that shows visitors the behind-the-scenes process of AI-native development. Visitors become spectators watching a master player's HUD, stats, and real-time decision-making.

## Technical Stack

- **Animation Library:** GSAP (GreenSock) - industry standard, performant, scroll-trigger support
- **SVG Animations:** Custom SVG components with GSAP timeline control
- **Scroll Control:** GSAP ScrollTrigger for scroll-driven sections
- **Syntax Highlighting:** Prism.js or Shiki for code blocks
- **Typewriter Effects:** Custom implementation with GSAP

## Animation Behavior

- **Hero Section:** Auto-plays on page load (3-5 seconds)
- **Sections 2-6:** Scroll-triggered, pinned during animation
- **Performance:** Respect `prefers-reduced-motion` media query
- **Mobile:** Simplified animations, touch-friendly

---

## Section 1: THE LOADING SCREEN (Hero - Auto-play)

### Visual Elements
```
┌─────────────────────────────────────────────┐
│  PLAYER: Milos Cvetkovic                    │
│  CLASS:  AI-Native Engineer                 │
│  LEVEL:  10+ years                          │
│  STATUS: Ready                              │
└─────────────────────────────────────────────┘
```

### Animation Sequence
1. Screen boots with progress bar: "Initializing development environment..."
2. HUD fades in with player stats
3. Notification pops: "NEW QUEST RECEIVED"
4. Scroll indicator pulses

### Copy
- **Headline:** "You're about to watch how the game is actually played."
- **Subtext:** "Most devs show you the trophy. I'll show you the raid."

---

## Section 2: PHASE 1 — DISCOVERY (Scroll-triggered)

### Visual Elements
- Split screen: Chat interface (left) + Mind map building (right)
- Floating requirement tags extracting from conversation
- Quest log updating in corner

### Animation Sequence
1. Chat message types: "Build a system that monitors production and fixes itself."
2. Tags extract and float to mind map: `monitoring`, `autonomous`, `PR creation`
3. Constraint flags pulse red, then resolve
4. Quest log checkboxes tick

### Behind The Scenes Panel
```
☑ Requirements captured
☑ Constraints identified
☑ Scope locked
◻ Architecture designed
```

### Copy
- **Headline:** "First rule: know exactly what you're hunting."
- **Subtext:** "Before I write a single line, I know the shape of the whole system."

---

## Section 3: PHASE 2 — STRATEGY (Scroll-triggered)

### Visual Elements
- Tech tree (RPG skill tree style)
- Synergy bonuses appearing
- Architecture diagram assembling

### Animation Sequence
1. Mind map collapses into tech tree
2. Branches light up as selections are made:
   - Runtime: Bun ⚡ → "2x faster cold starts"
   - Framework: Elysia → "Type-safe, minimal overhead"
   - AI Core: Claude Agent SDK → "The brain"
   - Monitoring: Azure Log Analytics → "The eyes"
3. Synergy bonuses flash:
   - "Bun + Elysia = 40% smaller bundle"
   - "Claude SDK + GitHub API = autonomous PRs"
4. Architecture boxes connect with animated data flow lines

### Copy
- **Headline:** "Every tool is a choice. Every choice is a trade-off."
- **Subtext:** "I don't grab the hot framework. I pick what wins."

---

## Section 4: PHASE 3 — EXECUTION (Scroll-triggered)

### Visual Elements
- Code streaming panel (left)
- Stats HUD (right)
- Activity feed (bottom)
- Commit combo counter (sidebar)

### Animation Sequence
1. Code writes itself with syntax highlighting
2. Stats increment in real-time:
   ```
   FILES CREATED:    ████████░░  34
   TESTS PASSING:    ████████░░  89%
   TYPE COVERAGE:    ██████████  100%
   TIME ELAPSED:     00:14:32
   ```
3. Activity feed logs scroll:
   ```
   ✓ src/agent/analyzer.ts — Error pattern recognition
   ✓ src/agent/fixer.ts — Autonomous fix generation
   ✓ src/safety/limits.ts — Budget caps, daily limits
   ```
4. Commit counter increments: "x12 COMMIT STREAK"

### Copy
- **Headline:** "Execution isn't typing faster. It's thinking in systems."
- **Subtext:** "Claude writes the code. I architect the machine."

---

## Section 5: PHASE 4 — THE GAUNTLET (Scroll-triggered)

### Visual Elements
- CI/CD pipeline as boss fight gates
- Progress bars for each stage
- Cloud deployment target

### Animation Sequence
1. Code package enters pipeline
2. Each stage animates sequentially:
   ```
   STAGE 1: LINT        ███████████ PASSED
   STAGE 2: TYPE CHECK  ███████████ PASSED
   STAGE 3: UNIT TESTS  ███████████ PASSED
   STAGE 4: E2E TESTS   ███████████ PASSED
   STAGE 5: SECURITY    ███████████ PASSED
   STAGE 6: BUILD       ███████████ PASSED
   ```
3. Final gate opens with flourish
4. Deployment arrow hits cloud
5. "DEPLOYMENT SUCCESSFUL" + XP earned notification

### Copy
- **Headline:** "No code reaches production without surviving the gauntlet."
- **Subtext:** "Automated. Ruthless. Every. Single. Time."

---

## Section 6: PHASE 5 — THE LOOP (Scroll-triggered)

### Visual Elements
- Monitoring dashboard with live metrics
- Error alert pulsing
- Self-healing timeline

### Animation Sequence
1. Dashboard fades in with metrics
2. Red alert pulses: "ERROR DETECTED"
3. Timeline animates:
   ```
   03:14 AM — NullPointerException in /api/orders
   03:14 AM — Agent activated
   03:15 AM — Root cause identified: missing null check
   03:16 AM — Fix generated
   03:16 AM — PR #847 opened
   03:17 AM — Tests passing
   03:17 AM — Awaiting human approval
   ```
4. Error blip turns green
5. "SELF-HEALING PROTOCOL ACTIVE" notification

### Copy
- **Headline:** "The final boss is entropy. My system farms it for XP."
- **Subtext:** "At 3am, while you sleep, the code improves itself."

---

## Section 7: GAME COMPLETE (Final CTA)

### Visual Elements
```
┌─────────────────────────────────────────────┐
│  SESSION COMPLETE                           │
│                                             │
│  Ideas → Architecture → Code → Production   │
│  Time: 1 conversation                       │
│                                             │
│  This is how I play.                        │
│  Want to start a co-op campaign?            │
│                                             │
│  [GET IN TOUCH]                             │
└─────────────────────────────────────────────┘
```

### Animation Sequence
1. HUD elements fade out
2. Terminal-style box draws itself
3. Text types in
4. CTA button pulses

---

## Component Architecture

```
src/components/
├── animated-hero/
│   ├── index.tsx              # Main orchestrator
│   ├── loading-screen.tsx     # Section 1: Boot + HUD
│   ├── discovery-phase.tsx    # Section 2: Requirements
│   ├── strategy-phase.tsx     # Section 3: Tech tree
│   ├── execution-phase.tsx    # Section 4: Code streaming
│   ├── gauntlet-phase.tsx     # Section 5: CI/CD pipeline
│   ├── loop-phase.tsx         # Section 6: Self-healing
│   ├── game-complete.tsx      # Section 7: CTA
│   ├── hud-elements.tsx       # Reusable HUD components
│   ├── code-stream.tsx        # Syntax-highlighted code animation
│   └── use-gsap-scroll.ts     # Custom hook for scroll triggers
```

## Dependencies to Add

```json
{
  "gsap": "^3.12.0",
  "prismjs": "^1.29.0"
}
```

## Accessibility

- Respect `prefers-reduced-motion`: disable animations, show static version
- All animated text has ARIA labels
- Keyboard navigation support
- Sufficient color contrast in HUD elements

## Performance Targets

- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Total animation JS: < 50KB gzipped
- SVGs optimized with SVGO

## Mobile Considerations

- Simplified animations (fewer particles, shorter sequences)
- Touch-friendly scroll behavior
- Stacked layout instead of split panels
- Reduced motion by default on low-end devices
