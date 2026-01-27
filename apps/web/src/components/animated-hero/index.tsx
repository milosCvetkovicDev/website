'use client';

import { useEffect, useState } from 'react';
import { LoadingScreen } from './loading-screen';
import { DiscoveryPhase } from './discovery-phase';
import { StrategyPhase } from './strategy-phase';
import { ExecutionPhase } from './execution-phase';
import { GauntletPhase } from './gauntlet-phase';
import { LoopPhase } from './loop-phase';
import { GameComplete } from './game-complete';
import { AmbientBackground, GridBackground, ScanLines } from './ambient-background';
import { SectionProgress } from './section-progress';

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
      {/* Ambient Effects Layer */}
      <GridBackground />
      <AmbientBackground />
      <ScanLines />

      {/* Section Progress Indicator */}
      <SectionProgress />

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Section 1: Loading Screen / Hero */}
        <LoadingScreen />

        {/* Section 2: Discovery Phase */}
        <DiscoveryPhase />

        {/* Section 3: Strategy Phase */}
        <StrategyPhase />

        {/* Section 4: Execution Phase */}
        <ExecutionPhase />

        {/* Section 5: The Gauntlet (CI/CD) */}
        <GauntletPhase />

        {/* Section 6: The Loop (Self-Healing) */}
        <LoopPhase />

        {/* Section 7: Game Complete (CTA) */}
        <GameComplete />
      </div>
    </div>
  );
}

// Re-export components for individual use if needed
export { LoadingScreen } from './loading-screen';
export { DiscoveryPhase } from './discovery-phase';
export { StrategyPhase } from './strategy-phase';
export { ExecutionPhase } from './execution-phase';
export { GauntletPhase } from './gauntlet-phase';
export { LoopPhase } from './loop-phase';
export { GameComplete } from './game-complete';
