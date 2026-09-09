'use client';

import { useEffect, useState, lazy, Suspense, memo, type ReactNode } from 'react';
import { HeroSection } from './hero-section';
import { SectionProgress } from './section-progress';
import { useIsHydrated } from '@/hooks/use-is-hydrated';

// Memoize hero section to prevent re-renders
const MemoizedHeroSection = memo(HeroSection);

// Lazy load heavy components that are below the fold
const DiscoveryPhase = lazy(() =>
  import('./discovery-phase').then((m) => ({ default: m.DiscoveryPhase })),
);
const StrategyPhase = lazy(() =>
  import('./strategy-phase').then((m) => ({ default: m.StrategyPhase })),
);
const ExecutionPhase = lazy(() =>
  import('./execution-phase').then((m) => ({ default: m.ExecutionPhase })),
);
const GauntletPhase = lazy(() =>
  import('./gauntlet-phase').then((m) => ({ default: m.GauntletPhase })),
);
const LoopPhase = lazy(() => import('./loop-phase').then((m) => ({ default: m.LoopPhase })));
const GameComplete = lazy(() =>
  import('./game-complete').then((m) => ({ default: m.GameComplete })),
);

const MemoizedSectionProgress = memo(SectionProgress);

// Minimal loading placeholder for lazy sections
function SectionPlaceholder() {
  return <div className="min-h-screen" />;
}

// Boot sequence messages for immersive loading
const bootMessages = [
  { text: 'Initializing system...', delay: 0 },
  { text: 'Loading portfolio modules...', delay: 200 },
  { text: 'Establishing connection...', delay: 400 },
  { text: 'System ready', delay: 600 },
];

// HUD-styled bootstrap loader with progress and boot sequence
function BootstrapLoader({ visible }: { visible: boolean }) {
  // Never mount an already-finished loader: a client-side navigation back to / arrives hydrated.
  const [shouldRender, setShouldRender] = useState(() => visible);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(0);
  // Derived, not stored: the loader is complete exactly when the hero is ready.
  const isComplete = !visible;
  const displayProgress = visible ? progress : 100;

  useEffect(() => {
    if (!visible) {
      // Remove from DOM after fade-out animation completes
      const timer = setTimeout(() => setShouldRender(false), 600);
      return () => clearTimeout(timer);
    }

    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        // Ease out - slower as it approaches 100
        const increment = Math.max(1, Math.floor((100 - prev) / 10));
        return Math.min(prev + increment, 95); // Cap at 95 until content loads
      });
    }, 50);

    // Cycle through boot messages
    const messageTimers = bootMessages.map((msg, i) =>
      setTimeout(() => setCurrentMessage(i), msg.delay),
    );

    return () => {
      clearInterval(progressInterval);
      messageTimers.forEach(clearTimeout);
    };
  }, [visible]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[1] flex items-center justify-center bg-[var(--background)] transition-opacity duration-500 ${
        isComplete ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Main loader container */}
      <div className="relative w-80 max-w-[90vw]">
        {/* Corner brackets */}
        <svg className="absolute -top-2 -left-2 h-4 w-4 text-[var(--accent)]" viewBox="0 0 16 16">
          <path d="M0 8 L0 0 L8 0" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg className="absolute -top-2 -right-2 h-4 w-4 text-[var(--accent)]" viewBox="0 0 16 16">
          <path d="M8 0 L16 0 L16 8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg
          className="absolute -bottom-2 -left-2 h-4 w-4 text-[var(--accent)]"
          viewBox="0 0 16 16"
        >
          <path d="M0 8 L0 16 L8 16" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg
          className="absolute -right-2 -bottom-2 h-4 w-4 text-[var(--accent)]"
          viewBox="0 0 16 16"
        >
          <path d="M8 16 L16 16 L16 8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>

        {/* Content */}
        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-6 backdrop-blur-sm">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono text-xs tracking-wider text-[var(--accent-text)] uppercase">
              System Boot
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              <span className="font-mono text-[10px] text-[var(--accent-text)]">ACTIVE</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70 transition-all duration-150 ease-out"
                style={{ width: `${displayProgress}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="font-mono text-[10px] text-[var(--muted)] tabular-nums">
                {displayProgress}%
              </span>
              <span className="font-mono text-[10px] text-[var(--muted)]">
                {displayProgress === 100 ? 'COMPLETE' : 'LOADING'}
              </span>
            </div>
          </div>

          {/* Boot messages */}
          <div className="min-h-[60px] space-y-1">
            {bootMessages.slice(0, currentMessage + 1).map((msg, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 font-mono text-xs transition-opacity duration-200 ${
                  i === currentMessage ? 'text-[var(--foreground)]' : 'text-[var(--muted)]/50'
                }`}
              >
                <span
                  className={
                    i <= currentMessage ? 'text-[var(--status-ok)]' : 'text-[var(--muted)]'
                  }
                >
                  {i < currentMessage ? '✓' : i === currentMessage ? '›' : '○'}
                </span>
                <span>{msg.text}</span>
                {i === currentMessage && i < bootMessages.length - 1 && (
                  <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-[var(--accent)]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Decorative scan line */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
          <div
            className="animate-scan-down absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent"
            style={{ animation: 'scan-down 2s linear infinite' }}
          />
        </div>
      </div>

      {/* Version tag */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <span className="font-mono text-[10px] text-[var(--muted)]/30">v2.0.26</span>
      </div>
    </div>
  );
}

export function AnimatedHero({ children }: { children?: ReactNode }) {
  const mounted = useIsHydrated();

  return (
    <div className="relative">
      {/* Bootstrap loader overlay - fades out when mounted */}
      <BootstrapLoader visible={!mounted} />

      {/* Section Progress Indicator */}
      <MemoizedSectionProgress />

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Section 1: Hero - server-rendered children passed through */}
        <MemoizedHeroSection>{children}</MemoizedHeroSection>

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

// Re-export only the hero section (used above the fold)
// Other phases are lazy-loaded internally
export { HeroSection } from './hero-section';
