'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { formatMetric, type CaseStudyMetric } from '@/data/case-studies';

interface MetricCounterProps extends CaseStudyMetric {
  active: boolean;
}

const DURATION_MS = 900;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Shows a metric, counting up to its real value while the card is active. The value is never
 * invented: `progress` only scales the number on its way to `value`, and reduced motion or a
 * finished count render the final value directly.
 */
export function MetricCounter({ active, ...metric }: MetricCounterProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [progress, setProgress] = useState(active && !prefersReducedMotion ? 0 : 1);
  const doneRef = useRef(!active || prefersReducedMotion);

  useEffect(() => {
    if (!active || prefersReducedMotion) {
      // Deactivated, or the user asked for no motion: show the final value and arm the next run.
      doneRef.current = !active;
      setProgress(1);
      return;
    }
    // A count that already finished must not restart while the card stays active.
    if (doneRef.current) return;

    let cancelled = false;
    let start: number | undefined;
    let frame = requestAnimationFrame(function step(now) {
      if (cancelled) return;
      // Some rAF polyfills pass no timestamp; take the origin from the first frame either way.
      const timestamp = Number.isFinite(now) ? now : 0;
      start ??= timestamp;
      const elapsed = timestamp - start;
      const t = Math.min(1, Math.max(0, elapsed / DURATION_MS));
      setProgress(easeOutCubic(t));
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        doneRef.current = true;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active, prefersReducedMotion]);

  const shown = formatMetric({ ...metric, value: metric.value * progress });

  return (
    <div
      className={`shrink-0 rounded border border-[var(--tmux-border)]/50 bg-[var(--background)]/80 p-4 text-center transition-all duration-300 lg:w-40 ${
        active ? 'border-[var(--accent)] shadow-[0_0_15px_rgba(139,92,246,0.15)]' : ''
      }`}
    >
      <div
        className={`mb-1 font-mono text-2xl font-bold tracking-tight tabular-nums transition-colors duration-300 lg:text-3xl ${
          active ? 'text-[var(--tmux-status-ok)]' : 'text-[var(--tmux-bar-text-bright)]'
        }`}
      >
        {shown}
      </div>
      <div className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-wider text-[var(--tmux-bar-text)] uppercase">
        {active && (
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--tmux-status-ok)]"
            aria-hidden="true"
          />
        )}
        {metric.label}
      </div>
    </div>
  );
}
