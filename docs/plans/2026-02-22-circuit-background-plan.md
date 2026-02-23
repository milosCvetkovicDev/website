# Circuit Boot-Up Background Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dense animated SVG circuit board background to the hero section that syncs with the boot loading sequence, creating an immersive "system booting up" experience.

**Architecture:** A new `CircuitBackground` component renders a full-viewport SVG with hand-crafted circuit paths, intersection nodes, and data particles. GSAP orchestrates the boot-up animation (path tracing → node glow → particle flow) synced to loading progress via a lifted ref. After boot, an idle loop maintains continuous subtle motion.

**Tech Stack:** React 19, SVG, GSAP 3.14 (MotionPathPlugin, DrawSVGPlugin), TypeScript

---

### Task 1: Lift boot progress to a shared ref

**Files:**
- Modify: `apps/web/src/components/animated-hero/index.tsx`

**Step 1: Add a progress ref to AnimatedHero**

In the `AnimatedHero` component, create a ref that both `BootstrapLoader` and the future `CircuitBackground` can read:

```tsx
// In AnimatedHero, add:
const bootProgressRef = useRef(0);
```

**Step 2: Pass the ref to BootstrapLoader**

Update `BootstrapLoader` to accept and write to the ref:

```tsx
// Update BootstrapLoader signature:
function BootstrapLoader({ visible, progressRef }: { visible: boolean; progressRef: React.MutableRefObject<number> }) {

// Inside the setProgress callback, sync the ref:
setProgress(prev => {
  // ... existing logic ...
  const next = Math.min(prev + increment, 95);
  progressRef.current = next;
  return next;
});

// In the completion effect:
useEffect(() => {
  if (!visible && progress < 100) {
    setProgress(100);
    progressRef.current = 100;
  }
}, [visible, progress, progressRef]);
```

Pass it in the JSX:

```tsx
<BootstrapLoader visible={!mounted} progressRef={bootProgressRef} />
```

**Step 3: Verify the build compiles**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add apps/web/src/components/animated-hero/index.tsx
git commit -m "refactor: lift boot progress to shared ref for circuit background sync"
```

---

### Task 2: Create the circuit SVG data module

**Files:**
- Create: `apps/web/src/components/animated-hero/circuit-data.ts`

This is a pure data module — no React, no GSAP. It defines the SVG path strings, node positions, and particle route indices. Keeping data separate from rendering makes both easier to maintain and test.

**Step 1: Create the circuit data file**

```ts
// Circuit board SVG path data, node positions, and particle routes.
// ViewBox: 0 0 1920 1080. Paths use PCB-style routing (horizontal/vertical with 90° turns).

export interface CircuitPath {
  d: string;
  tier: 'trunk' | 'branch' | 'trace';
  strokeWidth: number;
}

export interface CircuitNode {
  cx: number;
  cy: number;
  r: number;
  tier: 'ic' | 'via' | 'solder';
}

export interface ParticleRoute {
  pathIndex: number; // index into circuitPaths
}

// ── Primary Trunk Paths (8) ─────────────────────────────
// Long horizontal/vertical runs spanning most of the viewport
export const circuitPaths: CircuitPath[] = [
  // === TRUNK PATHS (8) === thick main arteries
  // Horizontal trunks
  { d: 'M0,200 H480 L480,200 H960 L960,200 H1440 L1440,200 H1920', tier: 'trunk', strokeWidth: 2.5 },
  { d: 'M0,540 H320 L320,540 H640 L640,540 H1280 L1280,540 H1920', tier: 'trunk', strokeWidth: 2.5 },
  { d: 'M0,880 H400 L400,880 H800 L800,880 H1200 L1200,880 H1920', tier: 'trunk', strokeWidth: 2.5 },
  // Vertical trunks
  { d: 'M320,0 V270 L320,270 V540 L320,540 V810 L320,810 V1080', tier: 'trunk', strokeWidth: 2.5 },
  { d: 'M640,0 V200 L640,200 V540 L640,540 V880 L640,880 V1080', tier: 'trunk', strokeWidth: 2.5 },
  { d: 'M960,0 V200 L960,200 V540 L960,540 V880 L960,880 V1080', tier: 'trunk', strokeWidth: 2.5 },
  { d: 'M1280,0 V200 L1280,200 V540 L1280,540 V880 L1280,880 V1080', tier: 'trunk', strokeWidth: 2.5 },
  { d: 'M1600,0 V270 L1600,270 V540 L1600,540 V810 L1600,810 V1080', tier: 'trunk', strokeWidth: 2.5 },

  // === BRANCH PATHS (15) === medium branches off trunks
  // Horizontal branches
  { d: 'M320,270 H640', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M640,350 H960', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M960,270 H1280', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M1280,350 H1600', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M480,440 H800', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M1120,440 H1440', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M320,660 H640', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M960,660 H1280', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M640,760 H960', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M1280,760 H1600', tier: 'branch', strokeWidth: 1.5 },
  // Vertical branches
  { d: 'M480,200 V440', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M800,440 V660', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M1120,200 V440', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M1440,440 V660', tier: 'branch', strokeWidth: 1.5 },
  { d: 'M160,540 V810', tier: 'branch', strokeWidth: 1.5 },

  // === TRACE PATHS (12) === thin short connectors & stubs
  { d: 'M480,200 L520,160', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M640,350 L680,310', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M960,270 L1000,230', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M1280,350 L1320,310', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M800,660 L840,620', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M1120,440 L1160,400', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M160,540 L120,500', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M1760,540 L1800,500', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M400,880 L440,840', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M1200,880 L1240,840', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M320,100 L360,60', tier: 'trace', strokeWidth: 0.8 },
  { d: 'M1600,980 L1640,940', tier: 'trace', strokeWidth: 0.8 },
];

// ── Nodes ───────────────────────────────────────────────
// Placed at path intersections and endpoints
export const circuitNodes: CircuitNode[] = [
  // IC pads — large, at major intersections (8)
  { cx: 320, cy: 200, r: 8, tier: 'ic' },
  { cx: 640, cy: 200, r: 8, tier: 'ic' },
  { cx: 960, cy: 540, r: 10, tier: 'ic' },  // Center — largest
  { cx: 1280, cy: 200, r: 8, tier: 'ic' },
  { cx: 320, cy: 540, r: 8, tier: 'ic' },
  { cx: 640, cy: 540, r: 8, tier: 'ic' },
  { cx: 1280, cy: 540, r: 8, tier: 'ic' },
  { cx: 960, cy: 880, r: 8, tier: 'ic' },

  // Via points — medium, at branch intersections (18)
  { cx: 480, cy: 200, r: 5, tier: 'via' },
  { cx: 960, cy: 200, r: 5, tier: 'via' },
  { cx: 1440, cy: 200, r: 5, tier: 'via' },
  { cx: 320, cy: 270, r: 5, tier: 'via' },
  { cx: 640, cy: 270, r: 5, tier: 'via' },
  { cx: 960, cy: 270, r: 5, tier: 'via' },
  { cx: 1280, cy: 270, r: 5, tier: 'via' },
  { cx: 640, cy: 350, r: 5, tier: 'via' },
  { cx: 1280, cy: 350, r: 5, tier: 'via' },
  { cx: 480, cy: 440, r: 5, tier: 'via' },
  { cx: 800, cy: 440, r: 5, tier: 'via' },
  { cx: 1120, cy: 440, r: 5, tier: 'via' },
  { cx: 1440, cy: 440, r: 5, tier: 'via' },
  { cx: 320, cy: 660, r: 5, tier: 'via' },
  { cx: 640, cy: 660, r: 5, tier: 'via' },
  { cx: 800, cy: 660, r: 5, tier: 'via' },
  { cx: 960, cy: 660, r: 5, tier: 'via' },
  { cx: 1280, cy: 660, r: 5, tier: 'via' },

  // Solder points — small, at endpoints and corners (20)
  { cx: 160, cy: 540, r: 3, tier: 'solder' },
  { cx: 1600, cy: 200, r: 3, tier: 'solder' },
  { cx: 1600, cy: 540, r: 3, tier: 'solder' },
  { cx: 1600, cy: 270, r: 3, tier: 'solder' },
  { cx: 1600, cy: 810, r: 3, tier: 'solder' },
  { cx: 320, cy: 810, r: 3, tier: 'solder' },
  { cx: 400, cy: 880, r: 3, tier: 'solder' },
  { cx: 800, cy: 880, r: 3, tier: 'solder' },
  { cx: 1200, cy: 880, r: 3, tier: 'solder' },
  { cx: 640, cy: 760, r: 3, tier: 'solder' },
  { cx: 960, cy: 760, r: 3, tier: 'solder' },
  { cx: 1280, cy: 760, r: 3, tier: 'solder' },
  { cx: 1600, cy: 760, r: 3, tier: 'solder' },
  { cx: 520, cy: 160, r: 3, tier: 'solder' },
  { cx: 680, cy: 310, r: 3, tier: 'solder' },
  { cx: 1000, cy: 230, r: 3, tier: 'solder' },
  { cx: 1320, cy: 310, r: 3, tier: 'solder' },
  { cx: 840, cy: 620, r: 3, tier: 'solder' },
  { cx: 1160, cy: 400, r: 3, tier: 'solder' },
  { cx: 120, cy: 500, r: 3, tier: 'solder' },
];

// ── Particle Routes ─────────────────────────────────────
// Indices reference circuitPaths. Particles travel along these paths.
// Choose a mix of trunk and branch paths for visual variety.
export const particleRoutes: ParticleRoute[] = [
  { pathIndex: 0 },  // top horizontal trunk
  { pathIndex: 1 },  // middle horizontal trunk
  { pathIndex: 2 },  // bottom horizontal trunk
  { pathIndex: 3 },  // left vertical trunk
  { pathIndex: 5 },  // center vertical trunk
  { pathIndex: 6 },  // right-center vertical trunk
  { pathIndex: 8 },  // branch: 320,270 → 640
  { pathIndex: 10 }, // branch: 480,440 → 800
  { pathIndex: 12 }, // branch: 960,660 → 1280
  { pathIndex: 14 }, // branch: 640,760 → 960
  { pathIndex: 17 }, // branch: 480,200 → 440
  { pathIndex: 19 }, // branch: 160,540 → 810
];
```

**Step 2: Verify the build compiles**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/circuit-data.ts
git commit -m "feat: add circuit board SVG data for hero background"
```

---

### Task 3: Create the CircuitBackground component (static render)

**Files:**
- Create: `apps/web/src/components/animated-hero/circuit-background.tsx`

Build the component that renders the SVG with all paths, nodes, and particles — but without animation first. This lets us see the visual result and iterate on the layout before adding GSAP.

**Step 1: Create the component file**

```tsx
'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { circuitPaths, circuitNodes, particleRoutes } from './circuit-data';
import { usePrefersReducedMotion } from './use-gsap-scroll';

export interface CircuitBackgroundHandle {
  /** Call to advance animation to match boot progress (0-100) */
  syncProgress: (progress: number) => void;
  /** Call when boot is complete to start idle loop */
  startIdle: () => void;
}

export const CircuitBackground = forwardRef<CircuitBackgroundHandle>(
  function CircuitBackground(_props, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const prefersReducedMotion = usePrefersReducedMotion();

    // Expose imperative methods (animation will be added in Task 4)
    useImperativeHandle(ref, () => ({
      syncProgress: (_progress: number) => {
        // Will be implemented with GSAP in Task 4
      },
      startIdle: () => {
        // Will be implemented with GSAP in Task 5
      },
    }));

    // For reduced motion: show static fully-lit circuit
    const staticOpacity = prefersReducedMotion ? 1 : 0;

    return (
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Glow filter for nodes */}
            <filter id="circuit-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Stronger glow for particles */}
            <filter id="particle-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Circuit Paths */}
          <g className="circuit-paths">
            {circuitPaths.map((path, i) => (
              <path
                key={`path-${i}`}
                d={path.d}
                fill="none"
                stroke="rgba(139, 92, 246, 0.4)"
                strokeWidth={path.strokeWidth}
                strokeLinecap="round"
                opacity={prefersReducedMotion ? 1 : 0}
                data-tier={path.tier}
                data-index={i}
              />
            ))}
          </g>

          {/* Nodes */}
          <g className="circuit-nodes">
            {circuitNodes.map((node, i) => (
              <circle
                key={`node-${i}`}
                cx={node.cx}
                cy={node.cy}
                r={node.r}
                fill="rgba(139, 92, 246, 0.8)"
                filter={node.tier === 'ic' ? 'url(#circuit-glow)' : undefined}
                opacity={staticOpacity}
                data-tier={node.tier}
                data-index={i}
              />
            ))}
          </g>

          {/* Data Particles (hidden initially, animated in Task 4) */}
          <g className="circuit-particles">
            {particleRoutes.map((_, i) => (
              <circle
                key={`particle-${i}`}
                r={3}
                fill="rgba(139, 92, 246, 1)"
                filter="url(#particle-glow)"
                opacity={0}
                data-particle={i}
              />
            ))}
          </g>

          {/* Energy Pulse (hidden initially) */}
          <circle
            className="energy-pulse"
            cx={960}
            cy={540}
            r={0}
            fill="none"
            stroke="rgba(139, 92, 246, 0.1)"
            strokeWidth={2}
            opacity={0}
          />
        </svg>
      </div>
    );
  }
);
```

**Step 2: Verify the build compiles**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/circuit-background.tsx
git commit -m "feat: add CircuitBackground component with static SVG render"
```

---

### Task 4: Wire CircuitBackground into AnimatedHero and add boot animation

**Files:**
- Modify: `apps/web/src/components/animated-hero/index.tsx`
- Modify: `apps/web/src/components/animated-hero/circuit-background.tsx`

**Step 1: Import and render CircuitBackground in AnimatedHero**

In `index.tsx`, add the circuit background between GridBackground and ScanLines. Pass `bootProgressRef` and connect the sync mechanism:

```tsx
// Add imports at top:
import { CircuitBackground } from './circuit-background';
import type { CircuitBackgroundHandle } from './circuit-background';

// In AnimatedHero component, add:
const circuitRef = useRef<CircuitBackgroundHandle>(null);

// Add a useEffect to sync progress with circuit animation:
useEffect(() => {
  if (!mounted) return;
  // Boot complete — trigger idle mode
  circuitRef.current?.startIdle();
}, [mounted]);

// Render CircuitBackground in JSX (between GridBackground and ScanLines):
<CircuitBackground ref={circuitRef} progressRef={bootProgressRef} />
```

Also remove the `AmbientBackground` lazy import and render — it's being replaced by CircuitBackground.

**Step 2: Implement GSAP boot animation in CircuitBackground**

Update `circuit-background.tsx` to register GSAP plugins and build the boot timeline:

```tsx
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin);
}
```

Add `progressRef` prop:

```tsx
interface CircuitBackgroundProps {
  progressRef: React.RefObject<number>;
}

export const CircuitBackground = forwardRef<CircuitBackgroundHandle, CircuitBackgroundProps>(
  function CircuitBackground({ progressRef }, ref) {
```

Build the master timeline inside a `useEffect`:

```tsx
useEffect(() => {
  const svg = svgRef.current;
  if (!svg || prefersReducedMotion) return;

  const paths = svg.querySelectorAll('.circuit-paths path');
  const nodes = svg.querySelectorAll('.circuit-nodes circle');
  const particles = svg.querySelectorAll('.circuit-particles circle');
  const energyPulse = svg.querySelector('.energy-pulse');

  // Set initial state — all paths hidden via DrawSVG
  const trunkPaths = svg.querySelectorAll('[data-tier="trunk"]');
  const branchPaths = svg.querySelectorAll('[data-tier="branch"]');
  const tracePaths = svg.querySelectorAll('[data-tier="trace"]');

  const icNodes = svg.querySelectorAll('[data-tier="ic"]');
  const viaNodes = svg.querySelectorAll('[data-tier="via"]');
  const solderNodes = svg.querySelectorAll('[data-tier="solder"]');

  // Initialize: hide everything
  gsap.set(paths, { drawSVG: '0%', opacity: 1 });
  gsap.set(nodes, { opacity: 0, scale: 0.3, transformOrigin: 'center center' });
  gsap.set(particles, { opacity: 0 });

  // Build master timeline (paused — we'll scrub it with progress)
  const master = gsap.timeline({ paused: true });

  // Phase 1 (0-0.3): Trunk paths trace outward
  master.to(trunkPaths, {
    drawSVG: '100%',
    duration: 0.3,
    stagger: 0.03,
    ease: 'power2.out',
  }, 0);

  // Phase 2 (0.25-0.55): IC nodes glow on, branches trace
  master.to(icNodes, {
    opacity: 1,
    scale: 1,
    duration: 0.15,
    stagger: 0.02,
    ease: 'back.out(1.7)',
  }, 0.25);

  master.to(branchPaths, {
    drawSVG: '100%',
    duration: 0.3,
    stagger: 0.02,
    ease: 'power1.out',
  }, 0.3);

  master.to(viaNodes, {
    opacity: 1,
    scale: 1,
    duration: 0.15,
    stagger: 0.01,
    ease: 'back.out(1.4)',
  }, 0.4);

  // Phase 3 (0.6-0.9): Tertiary traces, solder nodes, particles appear
  master.to(tracePaths, {
    drawSVG: '100%',
    duration: 0.2,
    stagger: 0.015,
    ease: 'power1.out',
  }, 0.6);

  master.to(solderNodes, {
    opacity: 1,
    scale: 1,
    duration: 0.1,
    stagger: 0.01,
    ease: 'power2.out',
  }, 0.7);

  // Particles fade in
  master.to(particles, {
    opacity: 1,
    duration: 0.1,
    stagger: 0.02,
  }, 0.75);

  // Phase 4 (0.9-1.0): Energy pulse
  if (energyPulse) {
    master.fromTo(energyPulse, {
      attr: { r: 0 },
      opacity: 0.3,
    }, {
      attr: { r: 600 },
      opacity: 0,
      duration: 0.1,
      ease: 'power2.out',
    }, 0.9);
  }

  // Store timeline ref for scrubbing
  const timelineRef = { current: master };

  // Poll progress and scrub timeline
  let rafId: number;
  const syncLoop = () => {
    const p = (progressRef.current ?? 0) / 100; // normalize to 0-1
    const current = master.progress();
    // Smooth lerp toward target
    const next = current + (p - current) * 0.1;
    master.progress(Math.min(next, 1));
    rafId = requestAnimationFrame(syncLoop);
  };
  rafId = requestAnimationFrame(syncLoop);

  return () => {
    cancelAnimationFrame(rafId);
    master.kill();
  };
}, [prefersReducedMotion, progressRef]);
```

**Step 3: Verify the build compiles**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 4: Test visually in browser**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm dev:web`

Open http://localhost:3000 and verify:
- Circuit paths trace as boot progress fills
- Nodes glow at intersections
- The boot screen shows the circuit animating behind it
- After boot completes, circuit is fully visible behind the hero content

**Step 5: Commit**

```bash
git add apps/web/src/components/animated-hero/circuit-background.tsx apps/web/src/components/animated-hero/index.tsx
git commit -m "feat: add GSAP boot animation to circuit background synced with loader"
```

---

### Task 5: Add idle loop animation (post-boot)

**Files:**
- Modify: `apps/web/src/components/animated-hero/circuit-background.tsx`

After the boot animation completes, start a looping idle animation: particles traveling along paths, nodes pulsing, and periodic energy waves.

**Step 1: Implement the idle timeline**

Add a second `useEffect` or extend the existing one. When `startIdle()` is called:

```tsx
// Inside the component, add idle timeline builder:
const idleTimelineRef = useRef<gsap.core.Timeline | null>(null);

// In useImperativeHandle:
startIdle: () => {
  if (idleTimelineRef.current || prefersReducedMotion) return;
  const svg = svgRef.current;
  if (!svg) return;

  const particles = svg.querySelectorAll('.circuit-particles circle');
  const icNodes = svg.querySelectorAll('[data-tier="ic"]');
  const energyPulse = svg.querySelector('.energy-pulse');
  const pathElements = svg.querySelectorAll('.circuit-paths path');

  const idle = gsap.timeline({ repeat: -1 });

  // Particle motion along paths
  particles.forEach((particle, i) => {
    const route = particleRoutes[i];
    if (!route) return;
    const pathEl = pathElements[route.pathIndex];
    if (!pathEl) return;

    gsap.to(particle, {
      motionPath: {
        path: pathEl,
        align: pathEl,
        alignOrigin: [0.5, 0.5],
      },
      duration: 4 + Math.random() * 4,
      repeat: -1,
      ease: 'none',
      delay: Math.random() * 3,
    });
  });

  // Node pulsing — gentle opacity oscillation on IC nodes
  gsap.to(icNodes, {
    opacity: 0.4,
    duration: 2,
    stagger: { each: 0.3, repeat: -1, yoyo: true },
    ease: 'sine.inOut',
  });

  // Periodic energy pulse every 8 seconds
  if (energyPulse) {
    gsap.timeline({ repeat: -1, repeatDelay: 8 }).fromTo(energyPulse, {
      attr: { r: 0 },
      opacity: 0.15,
    }, {
      attr: { r: 800 },
      opacity: 0,
      duration: 3,
      ease: 'power2.out',
    });
  }

  idleTimelineRef.current = idle;
},
```

Clean up idle animations on unmount by killing all GSAP tweens targeting SVG children.

**Step 2: Add IntersectionObserver to pause idle when off-screen**

```tsx
useEffect(() => {
  const svg = svgRef.current;
  if (!svg) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries[0]?.isIntersecting ?? false;
      if (idleTimelineRef.current) {
        visible ? idleTimelineRef.current.play() : idleTimelineRef.current.pause();
      }
    },
    { threshold: 0 }
  );
  observer.observe(svg);

  return () => observer.disconnect();
}, []);
```

**Step 3: Verify the build compiles**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 4: Test visually**

Run dev server and verify:
- After boot completes, particles begin traveling along circuit paths
- IC nodes pulse gently
- Energy wave ripples every ~8s
- Scrolling past the hero pauses the idle animation

**Step 5: Commit**

```bash
git add apps/web/src/components/animated-hero/circuit-background.tsx
git commit -m "feat: add idle loop with particle motion, node pulse, and energy waves"
```

---

### Task 6: Remove AmbientBackground and clean up

**Files:**
- Modify: `apps/web/src/components/animated-hero/index.tsx`
- Modify: `apps/web/src/components/animated-hero/ambient-background.tsx`

The `CircuitBackground` replaces `AmbientBackground` (floating code particles). Remove it to avoid visual noise overlap.

**Step 1: Remove AmbientBackground from index.tsx**

Remove the lazy import line:
```tsx
// DELETE: const AmbientBackground = lazy(() => import('./ambient-background').then(m => ({ default: m.AmbientBackground })));
```

Remove the JSX render:
```tsx
// DELETE:
// <Suspense fallback={null}>
//   <AmbientBackground />
// </Suspense>
```

**Step 2: Remove the AmbientBackground export from ambient-background.tsx**

Delete the entire `AmbientBackground` function from `ambient-background.tsx`. Keep `GridBackground` and `ScanLines` — those are still used.

**Step 3: Verify the build compiles**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/animated-hero/index.tsx apps/web/src/components/animated-hero/ambient-background.tsx
git commit -m "refactor: remove AmbientBackground, replaced by CircuitBackground"
```

---

### Task 7: Polish — responsive particle count and visual tuning

**Files:**
- Modify: `apps/web/src/components/animated-hero/circuit-background.tsx`

**Step 1: Add responsive particle count**

Only render 8 particles on mobile (< 768px viewport width), full 12 on desktop. Use a simple window.innerWidth check in the idle setup:

```tsx
const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
const activeParticleCount = isMobile ? 8 : particleRoutes.length;
// Only animate the first N particles
const activeParticles = Array.from(particles).slice(0, activeParticleCount);
```

**Step 2: Fine-tune opacity values**

After visual testing, adjust these values for the right balance:
- Path resting opacity: adjust if too bright or too dim
- Node glow intensity: adjust filter stdDeviation
- Particle glow radius: adjust filter

These are judgment calls best made in the browser — iterate visually.

**Step 3: Verify build and visual test**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm typecheck && pnpm build`
Expected: PASS on both

**Step 4: Commit**

```bash
git add apps/web/src/components/animated-hero/circuit-background.tsx
git commit -m "feat: responsive particle count and visual polish for circuit background"
```

---

### Task 8: Final verification

**Step 1: Run full build**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm build`
Expected: Build succeeds with no errors

**Step 2: Run lint**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live && pnpm lint`
Expected: No lint errors

**Step 3: Visual QA in production build**

Run: `cd /Users/milos/projects/personal/portfolio/.worktrees/go-live/apps/web && npx next start`

Test:
- [ ] Page loads → boot screen with circuit animating behind
- [ ] Circuit traces sync with progress bar
- [ ] Boot completes → circuit fully visible, idle animation starts
- [ ] Scroll down → idle animation pauses (performance)
- [ ] Scroll back up → idle resumes
- [ ] Mobile viewport → reduced particles
- [ ] `prefers-reduced-motion` → static fully-lit circuit, no animation
- [ ] No console errors

**Step 4: Final commit if any adjustments**

```bash
git add -A
git commit -m "chore: final polish for circuit background"
```
