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

// Boot sequence messages for immersive loading
const bootMessages = [
  { text: 'Initializing system...', delay: 0 },
  { text: 'Loading portfolio modules...', delay: 200 },
  { text: 'Establishing connection...', delay: 400 },
  { text: 'System ready', delay: 600 },
];

// HUD-styled bootstrap loader with progress and boot sequence
function BootstrapLoader({ visible }: { visible: boolean }) {
  const [shouldRender, setShouldRender] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsComplete(true);
      // Remove from DOM after fade-out animation completes
      const timer = setTimeout(() => setShouldRender(false), 600);
      return () => clearTimeout(timer);
    }

    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress(prev => {
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
      setTimeout(() => setCurrentMessage(i), msg.delay)
    );

    return () => {
      clearInterval(progressInterval);
      messageTimers.forEach(clearTimeout);
    };
  }, [visible]);

  // Complete progress when content is ready
  useEffect(() => {
    if (!visible && progress < 100) {
      setProgress(100);
    }
  }, [visible, progress]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-[var(--background)] flex items-center justify-center transition-opacity duration-500 ${
        isComplete ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Main loader container */}
      <div className="relative w-80 max-w-[90vw]">
        {/* Corner brackets */}
        <svg className="absolute -top-2 -left-2 w-4 h-4 text-[var(--accent)]" viewBox="0 0 16 16">
          <path d="M0 8 L0 0 L8 0" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg className="absolute -top-2 -right-2 w-4 h-4 text-[var(--accent)]" viewBox="0 0 16 16">
          <path d="M8 0 L16 0 L16 8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg className="absolute -bottom-2 -left-2 w-4 h-4 text-[var(--accent)]" viewBox="0 0 16 16">
          <path d="M0 8 L0 16 L8 16" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg className="absolute -bottom-2 -right-2 w-4 h-4 text-[var(--accent)]" viewBox="0 0 16 16">
          <path d="M8 16 L16 16 L16 8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>

        {/* Content */}
        <div className="p-6 border border-[var(--accent)]/20 rounded-lg bg-[var(--accent)]/5 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono text-[var(--accent)] uppercase tracking-wider">
              System Boot
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="text-[10px] font-mono text-[var(--accent)]/60">ACTIVE</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70 rounded-full transition-all duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] font-mono text-[var(--muted)] tabular-nums">
                {progress}%
              </span>
              <span className="text-[10px] font-mono text-[var(--muted)]">
                {progress === 100 ? 'COMPLETE' : 'LOADING'}
              </span>
            </div>
          </div>

          {/* Boot messages */}
          <div className="space-y-1 min-h-[60px]">
            {bootMessages.slice(0, currentMessage + 1).map((msg, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-xs font-mono transition-opacity duration-200 ${
                  i === currentMessage ? 'text-[var(--foreground)]' : 'text-[var(--muted)]/50'
                }`}
              >
                <span className={i <= currentMessage ? 'text-green-400' : 'text-[var(--muted)]'}>
                  {i < currentMessage ? '✓' : i === currentMessage ? '›' : '○'}
                </span>
                <span>{msg.text}</span>
                {i === currentMessage && i < bootMessages.length - 1 && (
                  <span className="inline-block w-1.5 h-3 bg-[var(--accent)] animate-pulse ml-0.5" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Decorative scan line */}
        <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
          <div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent animate-scan-down"
            style={{ animation: 'scan-down 2s linear infinite' }}
          />
        </div>
      </div>

      {/* Version tag */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <span className="text-[10px] font-mono text-[var(--muted)]/30">v2.0.26</span>
      </div>
    </div>
  );
}

export function AnimatedHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative">
      {/* Bootstrap loader overlay - fades out when mounted */}
      <BootstrapLoader visible={!mounted} />
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
