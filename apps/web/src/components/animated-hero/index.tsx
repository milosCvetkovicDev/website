'use client';

import { useEffect, useState, lazy, Suspense, memo } from 'react';
import { LoadingScreen } from './loading-screen';
import { GridBackground, ScanLines } from './ambient-background';
import { SectionProgress } from './section-progress';

// Lazy load heavy components that are below the fold
const DiscoveryPhase = lazy(() => import('./discovery-phase').then(m => ({ default: m.DiscoveryPhase })));
const StrategyPhase = lazy(() => import('./strategy-phase').then(m => ({ default: m.StrategyPhase })));
const ExecutionPhase = lazy(() => import('./execution-phase').then(m => ({ default: m.ExecutionPhase })));
const GauntletPhase = lazy(() => import('./gauntlet-phase').then(m => ({ default: m.GauntletPhase })));
const LoopPhase = lazy(() => import('./loop-phase').then(m => ({ default: m.LoopPhase })));
const GameComplete = lazy(() => import('./game-complete').then(m => ({ default: m.GameComplete })));
const AmbientBackground = lazy(() => import('./ambient-background').then(m => ({ default: m.AmbientBackground })));

// Memoize static background components
const MemoizedGridBackground = memo(GridBackground);
const MemoizedScanLines = memo(ScanLines);
const MemoizedSectionProgress = memo(SectionProgress);

// Minimal loading placeholder for lazy sections
function SectionPlaceholder() {
  return <div className="min-h-screen" />;
}

export function AnimatedHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)] font-mono text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Ambient Effects Layer - static backgrounds render immediately */}
      <MemoizedGridBackground />
      <Suspense fallback={null}>
        <AmbientBackground />
      </Suspense>
      <MemoizedScanLines />

      {/* Section Progress Indicator */}
      <MemoizedSectionProgress />

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Section 1: Loading Screen / Hero - render immediately (above fold) */}
        <LoadingScreen />

        {/* Lazy loaded sections below the fold */}
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

// Re-export only the loading screen (used above the fold)
// Other phases are lazy-loaded internally
export { LoadingScreen } from './loading-screen';
