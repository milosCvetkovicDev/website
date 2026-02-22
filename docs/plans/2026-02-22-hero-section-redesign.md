# Hero Section Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the homepage hero section with story-driven content (inciting incident terminal, updated player card from CV, atmospheric background) confined to the hero only.

**Architecture:** Replace three global fixed background layers (GridBackground, AmbientBackground canvas, ScanLines) with a single section-scoped atmospheric background. Replace the current loading-screen content (generic player card + vague headline) with an animated incident terminal showing the self-healing agent in action, updated CV-accurate player stats, and a stronger headline that hooks into the narrative arc.

**Tech Stack:** React 19, TypeScript, Tailwind v4, GSAP (@gsap/react), Next.js App Router

---

### Task 1: Create the HeroBackground component

**Files:**
- Create: `apps/web/src/components/animated-hero/hero-background.tsx`

**Step 1: Create the contained atmospheric background**

This replaces `GridBackground`, `AmbientBackground`, and `ScanLines` with a single component scoped to the hero section (`position: absolute`, not `fixed`).

```tsx
'use client';

// Atmospheric background contained to hero section only.
// Replaces the global GridBackground + AmbientBackground + ScanLines layers.
export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Nebula gradient clouds */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 30% 35%, rgba(124, 58, 237, 0.12) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 45% at 70% 28%, rgba(6, 182, 212, 0.06) 0%, transparent 60%)',
            'radial-gradient(ellipse 45% 40% at 50% 58%, rgba(67, 56, 202, 0.08) 0%, transparent 65%)',
          ].join(', '),
        }}
      />

      {/* Central glow behind incident terminal */}
      <div
        className="absolute inset-0 animate-pulse"
        style={{
          background: 'radial-gradient(ellipse 35% 30% at 50% 42%, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
          animationDuration: '5s',
        }}
      />

      {/* Noise texture via SVG filter */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]">
        <filter id="heroNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#heroNoise)" fill="#2a1a4e" />
      </svg>

      {/* Bottom fade to background color */}
      <div
        className="absolute inset-x-0 bottom-0 h-[30%]"
        style={{
          background: 'linear-gradient(to bottom, transparent, var(--background))',
        }}
      />
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS (new file, no imports yet)

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/hero-background.tsx
git commit -m "feat: add HeroBackground component scoped to hero section"
```

---

### Task 2: Create the IncidentTerminal component

**Files:**
- Create: `apps/web/src/components/animated-hero/incident-terminal.tsx`

**Step 1: Build the animated typing terminal**

This is the center-stage "inciting incident" — an animated log sequence showing the self-healing agent resolving a 3am production error.

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  timestamp: string;
  level: 'alert' | 'agent' | 'success' | 'status';
  message: string;
  delay: number; // ms from start before this line appears
}

const LOG_SEQUENCE: LogEntry[] = [
  { timestamp: '03:14:07', level: 'alert', message: 'Error rate spike — production', delay: 800 },
  { timestamp: '03:14:08', level: 'agent', message: 'Analyzing root cause...', delay: 2000 },
  { timestamp: '03:14:12', level: 'agent', message: 'Fix generated → PR #847 opened', delay: 3800 },
  { timestamp: '03:14:15', level: 'success', message: 'Tests passing. Awaiting approval.', delay: 5200 },
  { timestamp: '', level: 'status', message: 'Nobody got paged.', delay: 6400 },
];

const LEVEL_STYLES: Record<LogEntry['level'], string> = {
  alert: 'text-red-400',
  agent: 'text-[var(--accent)]',
  success: 'text-green-400',
  status: 'text-[var(--muted)]',
};

const LEVEL_LABELS: Record<LogEntry['level'], string> = {
  alert: 'ALERT',
  agent: 'AGENT',
  success: '✓',
  status: 'STATUS',
};

export function IncidentTerminal() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [typingIndex, setTypingIndex] = useState(-1);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    LOG_SEQUENCE.forEach((entry, i) => {
      // Start typing effect slightly before full reveal
      setTimeout(() => setTypingIndex(i), entry.delay - 200);
      setTimeout(() => {
        setVisibleLines(i + 1);
        setTypingIndex(-1);
      }, entry.delay);
    });
  }, []);

  return (
    <div className="w-full max-w-lg">
      {/* Terminal chrome */}
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden shadow-[0_0_60px_rgba(139,92,246,0.08)]">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="ml-auto text-[10px] font-mono text-[var(--muted)]/60 uppercase tracking-wider">
            production · live
          </span>
        </div>

        {/* Log entries */}
        <div className="p-4 font-mono text-sm space-y-1.5 min-h-[140px]">
          {LOG_SEQUENCE.slice(0, visibleLines).map((entry, i) => (
            <div key={i} className="flex gap-3 animate-fade-in">
              {entry.timestamp ? (
                <span className="text-[var(--muted)]/50 shrink-0 tabular-nums">
                  [{entry.timestamp}]
                </span>
              ) : (
                <span className="shrink-0 w-[88px]" />
              )}
              <span className={`shrink-0 w-14 ${LEVEL_STYLES[entry.level]}`}>
                {LEVEL_LABELS[entry.level]}
              </span>
              <span className={entry.level === 'status' ? 'text-[var(--foreground)] font-semibold' : 'text-[var(--foreground)]/80'}>
                {entry.message}
              </span>
            </div>
          ))}

          {/* Typing indicator */}
          {typingIndex >= 0 && (
            <div className="flex gap-3">
              <span className="text-[var(--muted)]/50 shrink-0 tabular-nums">
                [{LOG_SEQUENCE[typingIndex]?.timestamp || '       '}]
              </span>
              <span className={`shrink-0 w-14 ${LEVEL_STYLES[LOG_SEQUENCE[typingIndex]?.level || 'agent']}`}>
                {LEVEL_LABELS[LOG_SEQUENCE[typingIndex]?.level || 'agent']}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse [animation-delay:300ms]" />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/incident-terminal.tsx
git commit -m "feat: add IncidentTerminal component with animated log sequence"
```

---

### Task 3: Rewrite loading-screen.tsx with new content

**Files:**
- Modify: `apps/web/src/components/animated-hero/loading-screen.tsx` (full rewrite)

**Step 1: Replace the loading screen with the new hero content**

Replace the entire content of `loading-screen.tsx`. This uses the existing `Terminal`, `StatDisplay`, and `AnimatedText` components, plus the new `IncidentTerminal`.

```tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { Terminal, StatDisplay } from './hud-elements';
import { AnimatedText } from './animated-text';
import { IncidentTerminal } from './incident-terminal';
import { HeroBackground } from './hero-background';

const SKILL_TAGS = [
  'TypeScript', 'React', 'NestJS', 'Azure', 'Terraform',
  'Claude Code', 'DDD', 'Kubernetes',
];

export function LoadingScreen() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollIndicator(window.scrollY <= 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
    >
      {/* Contained atmospheric background */}
      <HeroBackground />

      {/* Player Card — compact, positioned above the incident */}
      <div className="relative z-10 w-full max-w-md mb-8">
        <Terminal>
          <div className="space-y-2">
            <StatDisplay label="PLAYER" value="Milos Cvetkovic" />
            <StatDisplay label="CLASS" value="Full Stack Engineer & Architect" />
            <StatDisplay label="SPEC" value="AI-Native Development" />
            <StatDisplay label="XP" value="13 years · 6 domains · 3 clouds" />
            <div className="flex justify-between items-center pt-2 border-t border-[#30363d]">
              <span className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                STATUS
              </span>
              <span className="font-mono text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Building at Obsidian 22
              </span>
            </div>
          </div>
        </Terminal>
      </div>

      {/* Inciting Incident — center stage */}
      <div className="relative z-10">
        <IncidentTerminal />
      </div>

      {/* Headline */}
      <div className="relative z-10 text-center mt-10 max-w-2xl">
        <h1 className="text-3xl md:text-5xl font-bold mb-4">
          <AnimatedText animation="gravity" className="glitch-text">
            This happened at 3am. Nobody woke up.
          </AnimatedText>
        </h1>
        <p className="text-lg text-[var(--muted)]">
          <AnimatedText animation="blur-reveal">
            I build systems that inherit chaos and ship clarity.
          </AnimatedText>{' '}
          <span className="gradient-text font-semibold">Scroll to see how.</span>
        </p>
      </div>

      {/* Skill Tags */}
      <div className="relative z-10 flex flex-wrap justify-center gap-2 mt-8 max-w-lg">
        {SKILL_TAGS.map((tag) => (
          <span
            key={tag}
            className="px-2.5 py-1 text-[11px] font-mono rounded border border-[var(--accent)]/20 text-[var(--accent)]/70 bg-[var(--accent)]/5 hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Scroll Indicator */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 transition-opacity duration-300 ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <AnimatedText animation="perspective" className="text-[10px] font-mono text-[var(--accent)] tracking-widest uppercase">
          Scroll
        </AnimatedText>
        <div className="relative w-6 h-10 border-2 border-[var(--accent)]/50 rounded-full">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Verify no TypeScript errors**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/loading-screen.tsx
git commit -m "feat: rewrite hero with incident terminal, CV-accurate player card, and stronger headline"
```

---

### Task 4: Remove global background layers from AnimatedHero

**Files:**
- Modify: `apps/web/src/components/animated-hero/index.tsx`

**Step 1: Remove the global GridBackground, AmbientBackground, and ScanLines**

In `index.tsx`, remove:
- Import of `GridBackground, ScanLines` from `./ambient-background`
- Lazy import of `AmbientBackground`
- Memoized wrappers: `MemoizedGridBackground`, `MemoizedScanLines`
- Their JSX: `<MemoizedGridBackground />`, `<AmbientBackground />`, `<MemoizedScanLines />`

The background is now handled inside `LoadingScreen` via `<HeroBackground />`.

After editing, the `AnimatedHero` component should look like:

```tsx
'use client';

import { useEffect, useState, lazy, Suspense, memo } from 'react';
import { LoadingScreen } from './loading-screen';

const MemoizedLoadingScreen = memo(LoadingScreen);
import { SectionProgress } from './section-progress';

const DiscoveryPhase = lazy(() => import('./discovery-phase').then(m => ({ default: m.DiscoveryPhase })));
const StrategyPhase = lazy(() => import('./strategy-phase').then(m => ({ default: m.StrategyPhase })));
const ExecutionPhase = lazy(() => import('./execution-phase').then(m => ({ default: m.ExecutionPhase })));
const GauntletPhase = lazy(() => import('./gauntlet-phase').then(m => ({ default: m.GauntletPhase })));
const LoopPhase = lazy(() => import('./loop-phase').then(m => ({ default: m.LoopPhase })));
const GameComplete = lazy(() => import('./game-complete').then(m => ({ default: m.GameComplete })));

const MemoizedSectionProgress = memo(SectionProgress);

function SectionPlaceholder() {
  return <div className="min-h-screen" />;
}

const bootMessages = [
  { text: 'Initializing system...', delay: 0 },
  { text: 'Loading portfolio modules...', delay: 200 },
  { text: 'Establishing connection...', delay: 400 },
  { text: 'System ready', delay: 600 },
];

function BootstrapLoader({ visible }: { visible: boolean }) {
  // ... keep existing BootstrapLoader implementation unchanged ...
}

export function AnimatedHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative">
      <BootstrapLoader visible={!mounted} />

      {/* Section Progress Indicator */}
      <MemoizedSectionProgress />

      {/* Content Layer */}
      <div className="relative z-10">
        <MemoizedLoadingScreen />

        <Suspense fallback={<SectionPlaceholder />}>
          <DiscoveryPhase />
        </Suspense>
        <Suspense fallback={<SectionPlaceholder />}>
          <StrategyPhase />
        </Suspense>
        <Suspense fallback={<SectionPlaceholder />}>
          <ExecutionPhase />
        </Suspense>
        <Suspense fallback={<SectionPlaceholder />}>
          <GauntletPhase />
        </Suspense>
        <Suspense fallback={<SectionPlaceholder />}>
          <LoopPhase />
        </Suspense>
        <Suspense fallback={<SectionPlaceholder />}>
          <GameComplete />
        </Suspense>
      </div>
    </div>
  );
}

export { LoadingScreen } from './loading-screen';
```

**Step 2: Verify no TypeScript errors**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Verify the dev server renders correctly**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm dev:web`
Check: http://localhost:3000 — hero should show the new content with contained background. Scrolling past hero section should show solid dark background.

**Step 4: Commit**

```bash
git add apps/web/src/components/animated-hero/index.tsx
git commit -m "refactor: remove global background layers, background now scoped to hero"
```

---

### Task 5: Clean up unused ambient-background exports

**Files:**
- Modify: `apps/web/src/components/animated-hero/ambient-background.tsx`

**Step 1: Check if GridBackground, AmbientBackground, ScanLines are used elsewhere**

Run: `grep -r "GridBackground\|AmbientBackground\|ScanLines" apps/web/src/ --include="*.tsx" --include="*.ts"`

If they're only referenced in the files we already modified, they can be safely deleted or kept as dead code.

**Step 2: Remove or mark as deprecated**

If no other files reference them, delete the entire `ambient-background.tsx` file since all three components are replaced by `hero-background.tsx`.

**Step 3: Verify build passes**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck && pnpm build`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused ambient-background components (replaced by HeroBackground)"
```

---

### Task 6: Visual QA and polish

**Files:**
- Potentially tweak: `hero-background.tsx`, `incident-terminal.tsx`, `loading-screen.tsx`

**Step 1: Test in browser**

Run dev server and check:
- [ ] Hero background is contained to first section only
- [ ] No background bleeds into Discovery Phase section below
- [ ] Incident terminal animation plays on page load
- [ ] Player card shows correct CV data
- [ ] Skill tags render and have hover states
- [ ] Scroll indicator works and fades on scroll
- [ ] Light/dark theme both look correct
- [ ] Mobile responsive (card and terminal stack properly on small screens)
- [ ] Boot loader still works and fades into hero correctly
- [ ] `prefers-reduced-motion` is respected (no animation)

**Step 2: Adjust spacing/timing as needed**

Tune: animation delays in `IncidentTerminal`, gradient opacities in `HeroBackground`, spacing between elements in `LoadingScreen`.

**Step 3: Final commit**

```bash
git add -A
git commit -m "style: polish hero section spacing, timing, and responsive layout"
```

---

### Task 7: Clean up design preview files

**Files:**
- Delete: `docs/design-previews/` (all 6 files — 3 SVG + 3 HTML)

These were temporary design exploration artifacts.

```bash
rm -rf docs/design-previews/
git add -A
git commit -m "chore: remove temporary design preview files"
```
