'use client';

import { useEffect, useState } from 'react';
import { LoadingScreen } from './loading-screen';
import { DiscoveryPhase } from './discovery-phase';
import { StrategyPhase } from './strategy-phase';
import { ExecutionPhase } from './execution-phase';
import { GauntletPhase } from './gauntlet-phase';
import { LoopPhase } from './loop-phase';
import { GameComplete } from './game-complete';

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
          <p className="text-[var(--muted)] font-mono text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
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
