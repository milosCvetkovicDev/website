'use client';

import { useEffect, useRef, useState, lazy, Suspense, memo, type ReactNode } from 'react';
import { HeroSection } from './hero-section';
import { SectionProgress } from './section-progress';
import { useIsHydrated } from '@/hooks/use-is-hydrated';

// Memoize hero section to prevent re-renders
const MemoizedHeroSection = memo(HeroSection);

// The story sections live in their own chunks. Each is mounted by DeferredSection when its
// placeholder approaches the viewport, so none of their render or GSAP work lands at page load; the
// loaders are also called once during idle time so the chunks are cached before the first scroll.
const loadDiscoveryPhase = () => import('./discovery-phase');
const loadStrategyPhase = () => import('./strategy-phase');
const loadExecutionPhase = () => import('./execution-phase');
const loadGauntletPhase = () => import('./gauntlet-phase');
const loadLoopPhase = () => import('./loop-phase');
const loadGameComplete = () => import('./game-complete');
const phaseLoaders = [
  loadDiscoveryPhase,
  loadStrategyPhase,
  loadExecutionPhase,
  loadGauntletPhase,
  loadLoopPhase,
  loadGameComplete,
];

const DiscoveryPhase = lazy(() =>
  loadDiscoveryPhase().then((m) => ({ default: m.DiscoveryPhase })),
);
const StrategyPhase = lazy(() => loadStrategyPhase().then((m) => ({ default: m.StrategyPhase })));
const ExecutionPhase = lazy(() =>
  loadExecutionPhase().then((m) => ({ default: m.ExecutionPhase })),
);
const GauntletPhase = lazy(() => loadGauntletPhase().then((m) => ({ default: m.GauntletPhase })));
const LoopPhase = lazy(() => loadLoopPhase().then((m) => ({ default: m.LoopPhase })));
const GameComplete = lazy(() => loadGameComplete().then((m) => ({ default: m.GameComplete })));

const MemoizedSectionProgress = memo(SectionProgress);

// Minimal loading placeholder for lazy sections
function SectionPlaceholder() {
  return <div className="min-h-screen" />;
}

/**
 * Renders the placeholder until it is about to scroll into view, then the real section. The first
 * section starts one navigation-bar height below the fold, so a zero root margin is what keeps
 * every section out of the page-load work; the sections' own scroll-triggered entrances still
 * begin half a viewport later. Browsers without IntersectionObserver mount everything once hydrated.
 */
function DeferredSection({ children }: { children: ReactNode }) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const [approached, setApproached] = useState(false);
  const hydrated = useIsHydrated();

  useEffect(() => {
    const placeholder = placeholderRef.current;
    if (!placeholder || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setApproached(true);
    });
    observer.observe(placeholder);
    return () => observer.disconnect();
  }, []);

  const mount = approached || (hydrated && typeof IntersectionObserver === 'undefined');
  if (!mount) return <div ref={placeholderRef} className="min-h-screen" />;
  return <Suspense fallback={<SectionPlaceholder />}>{children}</Suspense>;
}

// Warm the section chunks without mounting anything, but not during the first seconds: the shared
// GSAP chunk takes about 30 ms to evaluate on a laptop and four times that on the phones Lighthouse
// models, and nothing below the hero can be seen before the visitor scrolls. The prefetch waits for
// the first sign of intent (pointer, touch, key or scroll) or for a few idle seconds.
const PREFETCH_DELAY_MS = 3000;
const INTENT_EVENTS = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel', 'scroll'];

function usePrefetchPhases() {
  useEffect(() => {
    let done = false;
    let idleHandle: number | undefined;
    const removeListeners = () =>
      INTENT_EVENTS.forEach((type) => window.removeEventListener(type, prefetch));
    function prefetch() {
      if (done) return;
      done = true;
      removeListeners();
      for (const load of phaseLoaders) load().catch(() => {});
    }
    INTENT_EVENTS.forEach((type) => window.addEventListener(type, prefetch, { passive: true }));
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleHandle = requestIdleCallback(prefetch, { timeout: 2000 });
      } else {
        prefetch();
      }
    }, PREFETCH_DELAY_MS);
    return () => {
      done = true;
      removeListeners();
      clearTimeout(timer);
      if (idleHandle !== undefined) cancelIdleCallback(idleHandle);
    };
  }, []);
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
            <span className="font-mono text-xs tracking-wider text-[var(--accent)] uppercase">
              System Boot
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              <span className="font-mono text-[10px] text-[var(--accent)]/60">ACTIVE</span>
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
                <span className={i <= currentMessage ? 'text-green-400' : 'text-[var(--muted)]'}>
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
          <div className="scan-line" />
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
  usePrefetchPhases();

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

        {/* Story sections, each mounted when it approaches the viewport */}
        <DeferredSection>
          <DiscoveryPhase />
        </DeferredSection>

        <DeferredSection>
          <StrategyPhase />
        </DeferredSection>

        <DeferredSection>
          <ExecutionPhase />
        </DeferredSection>

        <DeferredSection>
          <GauntletPhase />
        </DeferredSection>

        <DeferredSection>
          <LoopPhase />
        </DeferredSection>

        <DeferredSection>
          <GameComplete />
        </DeferredSection>
      </div>
    </div>
  );
}

// Re-export only the hero section (used above the fold)
// Other phases are lazy-loaded internally
export { HeroSection } from './hero-section';
