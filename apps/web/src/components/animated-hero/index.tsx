'use client';

import { useEffect, useRef, memo, type ReactNode } from 'react';
import { preloadGsap } from './load-gsap';
import { HeroSection } from './hero-section';
import { SectionProgress } from './section-progress';
import { DiscoveryPhase } from './discovery-phase';
import { StrategyPhase } from './strategy-phase';
import { ExecutionPhase } from './execution-phase';
import { GauntletPhase } from './gauntlet-phase';
import { LoopPhase } from './loop-phase';
import { GameComplete } from './game-complete';

// Memoize hero section to prevent re-renders
const MemoizedHeroSection = memo(HeroSection);

// The story sections are imported directly, not through React.lazy. Two attempts at deferring them
// both cost more than they saved. Holding their Suspense boundary suspended during hydration made
// React discard the server markup, so the sections left the DOM until the visitor scrolled. Leaving
// them lazy without that gate puts a placeholder on screen until each chunk arrives, and the swap
// from a 100vh placeholder to the real section is a layout shift: it took CLS from 0.034 to 0.092.
// Rendering them outright costs blocking time at load and pays it back in stability. See ADR 0009.

const MemoizedSectionProgress = memo(SectionProgress);

export function AnimatedHero({ children }: { children?: ReactNode }) {
  // The seven progress dots describe this wrapper, not the document: `/` carries on with Featured
  // Work and Tech Stack below it. The indicator itself is fixed, so the only thing in flow here is
  // the story, and the wrapper's box is the story's box.
  const storyRef = useRef<HTMLDivElement>(null);

  // GSAP is not in this route's initial chunk: it is fetched once the browser is idle after
  // hydration (load-gsap.ts), and the phases build their timelines when it arrives. Started here as
  // well as by the phases because under reduced motion a phase mounted on the client, after a soft
  // navigation to `/`, returns before asking for it (on a hard load the hydration pass still asks,
  // with the reduced-motion hook's server snapshot, false), and the hover effects in
  // animated-text.tsx still use it under `reduce`.
  useEffect(() => {
    preloadGsap();
  }, []);

  return (
    <div className="relative" ref={storyRef}>
      {/* Section Progress Indicator */}
      <MemoizedSectionProgress storyRef={storyRef} />

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Section 1: Hero - server-rendered children passed through */}
        <MemoizedHeroSection>{children}</MemoizedHeroSection>

        {/* Story sections: server-rendered, imported directly — no code splitting, no Suspense */}
        <DiscoveryPhase />

        <StrategyPhase />

        <ExecutionPhase />

        <GauntletPhase />

        <LoopPhase />

        <GameComplete />
      </div>
    </div>
  );
}

// Re-export only the hero section (used above the fold). The other phases are not re-exported here
// because AnimatedHero renders them itself; anything that needs one directly, such as a unit test,
// imports its own module.
export { HeroSection } from './hero-section';
