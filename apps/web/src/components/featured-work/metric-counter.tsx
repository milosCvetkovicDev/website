'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

interface MetricCounterProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  active: boolean;
}

const DURATION_MS = 900;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts up to `value` when it becomes active. Mount it with a `key` that changes with
 * `active` so the count restarts from zero on every activation.
 */
export function MetricCounter({
  value,
  label,
  prefix = '',
  suffix = '',
  decimals = 0,
  active,
}: MetricCounterProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const animate = active && !prefersReducedMotion;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setProgress(easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const shown = animate ? value * progress : value;

  return (
    <div
      className={`shrink-0 rounded border border-[var(--tmux-border)]/50 bg-[var(--background)]/70 p-4 text-center backdrop-blur-md transition-all duration-300 lg:w-40 ${
        active ? 'border-[var(--accent)] shadow-[0_0_15px_rgba(139,92,246,0.15)]' : ''
      }`}
    >
      <div
        className={`mb-1 font-mono text-2xl font-bold tracking-tight tabular-nums transition-colors duration-300 lg:text-3xl ${
          active ? 'text-[var(--tmux-status-ok)]' : 'text-[var(--tmux-bar-text-bright)]'
        }`}
      >
        {prefix}
        {shown.toFixed(decimals)}
        {suffix}
      </div>
      <div className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-wider text-[var(--tmux-bar-text)] uppercase">
        {active && (
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--tmux-status-ok)]"
            aria-hidden="true"
          />
        )}
        {label}
      </div>
    </div>
  );
}
