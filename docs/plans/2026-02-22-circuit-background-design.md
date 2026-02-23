# Circuit Boot-Up Background — Hero Section

## Overview

Add a dense, animated SVG circuit board background to the hero/INIT section of the homepage. The animation syncs with the existing boot loading sequence — starting dark, tracing circuit paths outward as progress fills, reaching a full living network by boot completion.

## Design Decisions

- **Intensity:** Bold & immersive — the animation IS the experience
- **Theme:** System booting up — circuit paths tracing, nodes lighting, data flowing
- **Timing:** Synced with boot progress bar (0-100%)
- **Tech:** SVG + GSAP (matches existing animation architecture)
- **Density:** High — real motherboard feel, 30-40 paths, 40-50 nodes
- **Distribution:** Full even viewport coverage, paths clip at edges (infinite feel)

## Visual Composition

The hero section background is a dense circuit board pattern covering the full viewport. Paths are mostly horizontal/vertical with 90-degree turns (PCB routing style). Content floats above this living network.

### SVG Element Counts

| Element | Count | Description |
|---------|-------|-------------|
| Primary trunk paths | ~8 | Thick, long horizontal/vertical runs spanning viewport |
| Secondary branches | ~15 | Medium paths branching at 90deg from trunks |
| Tertiary traces | ~12-15 | Thin short connectors, stubs, dead-ends |
| IC pad nodes | ~6-8 | Large circles at major intersections |
| Via points | ~15-20 | Medium circles where paths cross |
| Solder points | ~20 | Small circles at endpoints/corners |
| Data particles | 8-12 | Moving circles traveling along paths |

### Color Palette (all using `--accent` / `#8B5CF6`)

- Paths resting: `accent/15` → traced: `accent/40`
- Nodes resting: `accent/20` → pulsing peak: `accent/80`
- Particles: full `accent` with blur glow
- Energy pulse: `accent/10` expanding radially

## Animation Timeline

| Boot % | Circuit State |
|--------|---------------|
| 0% | Dark void. Single pulse ripple from center. |
| 0-30% | Primary trunk paths trace outward (stroke-dashoffset animation). |
| 30-60% | Nodes glow on (opacity + scale). Secondary branches trace. |
| 60-90% | Data particles begin flowing via MotionPathPlugin. Node pulse loop starts. |
| 90-100% | Full network alive. Energy wave. Tertiary traces complete. |
| Post-boot | Idle mode: slow particle flow, gentle node pulsing, energy wave every ~8s. |

## Architecture

### New Component

`CircuitBackground` — client-side React component in `apps/web/src/components/animated-hero/circuit-background.tsx`

### Layer Stack (back to front)

1. `GridBackground` (existing, z-0)
2. `CircuitBackground` (NEW, z-[1])
3. `ScanLines` (existing, z-50)
4. Content (z-10)

Note: `AmbientBackground` (floating code particles) may be reduced or removed since CircuitBackground serves a similar atmospheric purpose with more visual impact.

### Boot Sync Mechanism

`BootstrapLoader` currently manages progress internally. Lift the `progress` state to `AnimatedHero` so both `BootstrapLoader` and `CircuitBackground` can consume it. Alternatively, use a shared ref or context.

### SVG Structure

```
<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <filter id="glow">...</filter>
    <filter id="particleGlow">...</filter>
  </defs>

  <g class="circuit-paths">
    <path class="trunk" d="..." />     <!-- 8 primary paths -->
    <path class="branch" d="..." />    <!-- 15 secondary paths -->
    <path class="trace" d="..." />     <!-- 12-15 tertiary paths -->
  </g>

  <g class="nodes">
    <circle class="ic-pad" />          <!-- 6-8 large -->
    <circle class="via" />             <!-- 15-20 medium -->
    <circle class="solder" />          <!-- ~20 small -->
  </g>

  <g class="particles">
    <circle class="data-particle" />   <!-- 8-12 moving -->
  </g>

  <circle class="energy-pulse" />      <!-- periodic expanding ring -->
</svg>
```

### GSAP Timeline

```
masterTimeline
  ├── trunkTrace (0-30%): stroke-dashoffset animations on trunk paths
  ├── nodeGlow (30-50%): opacity + scale on IC pads and vias
  ├── branchTrace (30-60%): stroke-dashoffset on secondary paths
  ├── particleStart (60-90%): MotionPathPlugin on data particles
  ├── tertiaryTrace (70-100%): stroke-dashoffset on thin traces
  ├── solderGlow (80-100%): small node opacity
  └── energyPulse (90-100%): radial expansion + fade
```

After boot: idle timeline loops particle motion, node pulse, and periodic energy waves.

## Performance

- SVG renders use `will-change: opacity, transform` for GPU compositing
- GSAP uses only `transform` and `opacity` (no layout triggers)
- `prefers-reduced-motion`: show static circuit at final state, no animation
- Particle count: 8 on mobile, 12 on desktop
- Circuit SVG hand-crafted, ~8-12KB
- `preserveAspectRatio="xMidYMid slice"` for responsive full-bleed
- IntersectionObserver pauses idle animations when section scrolls out of view

## Files to Create/Modify

| File | Action |
|------|--------|
| `animated-hero/circuit-background.tsx` | CREATE — new component |
| `animated-hero/index.tsx` | MODIFY — add CircuitBackground, lift boot progress |
| `animated-hero/ambient-background.tsx` | MODIFY — possibly remove AmbientBackground or reduce its presence |
