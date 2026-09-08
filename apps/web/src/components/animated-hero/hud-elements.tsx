'use client';

import { forwardRef, useRef, useCallback } from 'react';
import { gsap } from './use-gsap-scroll';

// Corner bracket decoration for HUD panels
function CornerBrackets({ className = '' }: { className?: string }) {
  return (
    <>
      {/* Top-left */}
      <svg
        className={`absolute -top-px -left-px h-4 w-4 text-[var(--accent)] ${className}`}
        viewBox="0 0 16 16"
      >
        <path d="M0 8 L0 0 L8 0" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {/* Top-right */}
      <svg
        className={`absolute -top-px -right-px h-4 w-4 text-[var(--accent)] ${className}`}
        viewBox="0 0 16 16"
      >
        <path d="M8 0 L16 0 L16 8" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {/* Bottom-left */}
      <svg
        className={`absolute -bottom-px -left-px h-4 w-4 text-[var(--accent)] ${className}`}
        viewBox="0 0 16 16"
      >
        <path d="M0 8 L0 16 L8 16" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {/* Bottom-right */}
      <svg
        className={`absolute -right-px -bottom-px h-4 w-4 text-[var(--accent)] ${className}`}
        viewBox="0 0 16 16"
      >
        <path d="M8 16 L16 16 L16 8" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </>
  );
}

// Glowing border effect (static, no animation to avoid flicker)
function GlowBorder() {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100">
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-[var(--accent)]/0 via-[var(--accent)]/10 to-[var(--accent)]/0" />
    </div>
  );
}

// Terminal-style container with enhanced styling
export const Terminal = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string; title?: string }
>(({ children, className = '', title }, ref) => (
  <div
    ref={ref}
    className={`group relative overflow-hidden rounded-lg border border-[#30363d] bg-[#0d1117] font-mono text-sm transition-all duration-300 hover:border-[var(--accent)]/50 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)] ${className}`}
  >
    <CornerBrackets className="opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    <GlowBorder />
    <div className="flex items-center gap-2 border-b border-[#30363d] bg-[#161b22] px-4 py-2">
      <div className="flex gap-2">
        <span className="h-3 w-3 rounded-full bg-[#ff5f56] transition-transform hover:scale-110" />
        <span className="h-3 w-3 rounded-full bg-[#ffbd2e] transition-transform hover:scale-110" />
        <span className="h-3 w-3 rounded-full bg-[#27c93f] transition-transform hover:scale-110" />
      </div>
      {title && <span className="ml-auto font-mono text-xs text-[var(--muted)]">{title}</span>}
    </div>
    <div className="relative p-4">{children}</div>
  </div>
));
Terminal.displayName = 'Terminal';

// HUD Panel with corner brackets and glow
export const HudPanel = forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
    title?: React.ReactNode;
    glow?: boolean;
  }
>(({ children, className = '', title, glow = false }, ref) => (
  <div
    ref={ref}
    className={`group relative rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/10 ${
      glow ? 'shadow-[0_0_30px_rgba(139,92,246,0.15)]' : ''
    } ${className}`}
  >
    <CornerBrackets />
    <GlowBorder />
    {title && (
      <div className="flex items-center justify-between border-b border-[var(--accent)]/30 px-4 py-2">
        <span className="font-mono text-xs tracking-wider text-[var(--accent)] uppercase">
          {title}
        </span>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="font-mono text-[10px] text-[var(--accent)]/60">ACTIVE</span>
        </div>
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
));
HudPanel.displayName = 'HudPanel';

// Progress Bar with animated fill and glow
export function ProgressBar({
  progress,
  label,
  className = '',
  variant = 'default',
}: {
  progress: number;
  label?: string;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const colors = {
    default: 'bg-[var(--accent)]',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  return (
    <div className={`group flex items-center gap-3 ${className}`}>
      {label && (
        <span className="w-24 shrink-0 font-mono text-xs text-[var(--muted)] transition-colors group-hover:text-[var(--foreground)]">
          {label}
        </span>
      )}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        {/* Track glow */}
        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.2) ${progress}%, transparent ${progress}%)`,
          }}
        />
        <div
          className={`relative h-full overflow-hidden rounded-full transition-all duration-500 ease-out ${colors[variant]}`}
          style={{ width: `${progress}%` }}
        >
          {/* Static shine effect - no animation to avoid flicker */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      </div>
      <span className="w-12 text-right font-mono text-xs text-[var(--muted)] tabular-nums">
        {progress}%
      </span>
    </div>
  );
}

// Stat Display with glitch hover effect on value
export function StatDisplay({
  label,
  value,
  className = '',
  highlight = false,
}: {
  label: string;
  value: string | number;
  className?: string;
  highlight?: boolean;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!valueRef.current) return;

    // Quick glitch effect
    gsap
      .timeline()
      .to(valueRef.current, { x: -2, duration: 0.05 })
      .to(valueRef.current, { x: 2, duration: 0.05 })
      .to(valueRef.current, { x: -1, duration: 0.05 })
      .to(valueRef.current, { x: 0, duration: 0.05 })
      .to(valueRef.current, { scale: 1.1, duration: 0.1 })
      .to(valueRef.current, {
        scale: 1,
        duration: 0.2,
        ease: 'elastic.out(1, 0.3)',
      });
  }, []);

  return (
    <div
      className={`group -mx-2 flex cursor-pointer items-center justify-between rounded p-2 transition-colors hover:bg-[var(--accent)]/5 ${className}`}
      onMouseEnter={handleMouseEnter}
    >
      <span className="font-mono text-xs tracking-wider text-[var(--muted)] uppercase transition-colors group-hover:text-[var(--foreground)]">
        {label}
      </span>
      <span
        ref={valueRef}
        className={`inline-block font-mono transition-all ${
          highlight ? 'animate-pulse font-bold text-[var(--accent)]' : 'text-[var(--accent)]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// Notification Toast with animation-ready design
export const NotificationToast = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; type?: 'success' | 'warning' | 'info' | 'error' }
>(({ children, type = 'info' }, ref) => {
  const colors = {
    success: 'border-green-500/50 bg-green-500/10 text-green-400',
    warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
    info: 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]',
    error: 'border-red-500/50 bg-red-500/10 text-red-400',
  };

  const glowColors = {
    success: 'shadow-[0_0_20px_rgba(34,197,94,0.2)]',
    warning: 'shadow-[0_0_20px_rgba(234,179,8,0.2)]',
    info: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]',
    error: 'shadow-[0_0_20px_rgba(239,68,68,0.2)]',
  };

  return (
    <div
      ref={ref}
      className={`relative rounded-lg border px-4 py-3 font-mono text-sm ${colors[type]} ${glowColors[type]} overflow-hidden`}
    >
      <div className="relative">{children}</div>
    </div>
  );
});
NotificationToast.displayName = 'NotificationToast';

// Quest Log Checkbox with check animation
export function QuestItem({
  completed,
  children,
}: {
  completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-2 font-mono text-sm">
      <span
        className={`transition-all duration-300 ${
          completed
            ? 'scale-110 text-green-400'
            : 'text-[var(--muted)] group-hover:text-[var(--accent)]'
        }`}
      >
        {completed ? '✓' : '○'}
      </span>
      <span
        className={`transition-all duration-300 ${
          completed
            ? 'text-[var(--foreground)] line-through decoration-green-400/50'
            : 'text-[var(--muted)] group-hover:text-[var(--foreground)]'
        }`}
      >
        {children}
      </span>
    </div>
  );
}

// Typing Cursor with more realistic blink
export function TypingCursor({ color = 'accent' }: { color?: 'accent' | 'white' | 'green' }) {
  const colors = {
    accent: 'bg-[var(--accent)]',
    white: 'bg-white',
    green: 'bg-green-400',
  };

  return (
    <span
      className={`animate-blink ml-0.5 inline-block h-5 w-2 ${colors[color]}`}
      style={{ animationTimingFunction: 'steps(1)' }}
    />
  );
}

// Code Line with hover highlight
export function CodeLine({
  lineNumber,
  children,
  className = '',
  highlighted = false,
}: {
  lineNumber?: number;
  children: React.ReactNode;
  className?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`group flex transition-colors ${
        highlighted ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--accent)]/5'
      } -mx-4 px-4 ${className}`}
    >
      {lineNumber !== undefined && (
        <span className="w-8 shrink-0 pr-4 text-right text-[var(--muted)]/50 transition-colors select-none group-hover:text-[var(--muted)]">
          {lineNumber}
        </span>
      )}
      <span className="flex-1">{children}</span>
    </div>
  );
}

// Pipeline Stage with animated progress
export function PipelineStage({
  name,
  status,
  progress = 100,
}: {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  progress?: number;
}) {
  const statusColors = {
    pending: 'text-[var(--muted)]',
    running: 'text-yellow-400',
    passed: 'text-green-400',
    failed: 'text-red-400',
  };

  const statusIcons = {
    pending: '○',
    running: '◐',
    passed: '●',
    failed: '✗',
  };

  const progressColors = {
    pending: 'bg-[var(--muted)]/50',
    running: 'bg-yellow-500',
    passed: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="group flex items-center gap-4 font-mono text-sm">
      <span className="w-28 shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--foreground)]">
        {name}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${progressColors[status]}`}
          style={{ width: `${progress}%` }}
        >
          {status === 'running' && (
            <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          )}
        </div>
      </div>
      <span className={`w-8 text-center ${statusColors[status]}`}>
        <span className={status === 'running' ? 'inline-block animate-spin' : ''}>
          {statusIcons[status]}
        </span>
      </span>
    </div>
  );
}

// Activity Log Entry with status icon
export function ActivityEntry({
  status,
  children,
  timestamp,
}: {
  status: 'success' | 'pending' | 'error';
  children: React.ReactNode;
  timestamp?: string;
}) {
  const icons = {
    success: '✓',
    pending: '◐',
    error: '✗',
  };
  const colors = {
    success: 'text-green-400',
    pending: 'text-yellow-400 animate-spin',
    error: 'text-red-400',
  };

  return (
    <div className="group -mx-2 flex items-start gap-2 rounded px-2 py-1 font-mono text-sm transition-colors hover:bg-[var(--accent)]/5">
      <span className={`${colors[status]} shrink-0`}>{icons[status]}</span>
      <span className="flex-1 text-[var(--foreground)]">{children}</span>
      {timestamp && <span className="shrink-0 text-xs text-[var(--muted)]">{timestamp}</span>}
    </div>
  );
}

// Data stream effect for background
// Uses deterministic pattern to avoid hydration mismatch
export function DataStream({ className = '' }: { className?: string }) {
  // Generate deterministic binary-like pattern using simple hash
  const generateLine = (seed: number): string => {
    let result = '';
    for (let i = 0; i < 80; i++) {
      // Simple deterministic pattern based on position
      result += (seed * (i + 1) * 7) % 13 > 6 ? '1' : '0';
    }
    return result;
  };

  const lines = Array.from({ length: 50 }, (_, i) => generateLine(i + 1)).join('\n');

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden opacity-10 ${className}`}>
      <div className="animate-scroll-up absolute inset-0 font-mono text-[8px] leading-tight whitespace-pre text-[var(--accent)]">
        {lines}
      </div>
    </div>
  );
}

// Hexagon badge for achievements
export function HexBadge({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="h-16 w-16 text-[var(--accent)]">
        <polygon
          points="50 3, 93 25, 93 75, 50 97, 7 75, 7 25"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-50"
        />
        <polygon
          points="50 10, 85 28, 85 72, 50 90, 15 72, 15 28"
          fill="currentColor"
          className="opacity-10"
        />
      </svg>
      <span className="absolute text-lg">{children}</span>
    </div>
  );
}
