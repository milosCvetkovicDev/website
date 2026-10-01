'use client';

import { forwardRef } from 'react';

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

// Terminal-style container with enhanced styling.
// The window is always dark (#0d1117), so it carries the `dark` class to scope the dark theme
// tokens to its subtree: in the light theme the page's --foreground and --muted are dark greys
// that would be invisible on it. Inside it, `dark:` variants and the `.dark` scrollbar rules apply
// in both page themes, so children style themselves with the tokens rather than `dark:` overrides.
// It also sets `color` explicitly. Scoping the tokens is not enough on its own: `color` inherits as
// an already-resolved value, so a descendant with no colour class of its own keeps the dark grey
// the light theme resolved on <body> and renders invisible here.
export const Terminal = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string; title?: string }
>(({ children, className = '', title }, ref) => (
  <div
    ref={ref}
    className={`dark group relative overflow-hidden rounded-lg border border-[#30363d] bg-[#0d1117] font-mono text-sm text-[var(--foreground)] transition-all duration-300 hover:border-[var(--accent)]/50 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)] ${className}`}
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
        <span className="font-mono text-xs tracking-wider text-[var(--accent-text)] uppercase">
          {title}
        </span>
        {/* Decoration, hidden from assistive technology: every titled panel shows it, so a screen
            reader would announce "ACTIVE" after each title. */}
        <div className="flex items-center gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="font-mono text-[10px] text-[var(--accent-text)]">ACTIVE</span>
        </div>
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
));
HudPanel.displayName = 'HudPanel';

// Notification Toast with animation-ready design
export const NotificationToast = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; type?: 'success' | 'warning' | 'info' | 'error' }
>(({ children, type = 'info' }, ref) => {
  const colors = {
    success: 'border-[var(--status-ok)]/50 bg-[var(--status-ok)]/10 text-[var(--status-ok)]',
    warning: 'border-[var(--status-warn)]/50 bg-[var(--status-warn)]/10 text-[var(--status-warn)]',
    info: 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent-text)]',
    error: 'border-[var(--status-err)]/50 bg-[var(--status-err)]/10 text-[var(--status-err)]',
  };

  const glowColors = {
    success: 'shadow-[0_0_20px_color-mix(in_oklab,var(--status-ok)_20%,transparent)]',
    warning: 'shadow-[0_0_20px_color-mix(in_oklab,var(--status-warn)_20%,transparent)]',
    info: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]',
    error: 'shadow-[0_0_20px_color-mix(in_oklab,var(--status-err)_20%,transparent)]',
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
            ? 'scale-110 text-[var(--status-ok)]'
            : 'text-[var(--muted)] group-hover:text-[var(--accent-text)]'
        }`}
      >
        {completed ? '✓' : '○'}
      </span>
      <span
        className={`transition-all duration-300 ${
          completed
            ? 'text-[var(--foreground)] line-through decoration-[var(--status-ok)]/50'
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
    green: 'bg-[var(--status-ok)]',
  };

  return (
    <span
      className={`animate-blink ml-0.5 inline-block h-5 w-2 ${colors[color]}`}
      style={{ animationTimingFunction: 'steps(1)' }}
    />
  );
}

/**
 * The transform that draws a progress fill `fraction` of the way across its track, from the left
 * edge. The fraction is clamped to 0-1, so a negative value cannot mirror the fill out of its track
 * and a value past 1 cannot overrun it, and a non-finite one draws nothing rather than an invalid
 * transform the browser drops, which would leave the fill full. PipelineStage renders it, and
 * GauntletPhase writes it through a stage's `fillRef`, so the two always agree.
 */
export function progressFillTransform(fraction: number): string {
  const drawn = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return `scaleX(${drawn})`;
}

// Pipeline Stage with animated progress.
// The fill is a full-width bar scaled from its left edge, never a width, so a frame of progress
// costs no layout (ADR 0009 rule 2). React draws it from `progress`; GauntletPhase draws a running
// stage frame by frame through `fillRef`, writing the same transform without re-rendering.
export function PipelineStage({
  name,
  status,
  progress = 100,
  fillRef,
}: {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  progress?: number;
  fillRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const statusColors = {
    pending: 'text-[var(--muted)]',
    running: 'text-[var(--status-warn)]',
    passed: 'text-[var(--status-ok)]',
    failed: 'text-[var(--status-err)]',
  };

  const statusIcons = {
    pending: '○',
    running: '◐',
    passed: '●',
    failed: '✗',
  };

  const progressColors = {
    pending: 'bg-[var(--muted)]/50',
    running: 'bg-[var(--status-warn)]',
    passed: 'bg-[var(--status-ok)]',
    failed: 'bg-[var(--status-err)]',
  };

  return (
    <div className="group flex items-center gap-4 font-mono text-sm">
      <span className="w-28 shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--foreground)]">
        {name}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        {/* Colours only: GauntletPhase writes the transform on every frame of a stage, and a
            transform transition would restart on each write and trail the progress. No radius of
            its own, which the scale would squash to a sliver at low progress: the track's rounded
            clip rounds the left end, and the right end once the stage is full; a partial fill ends
            square. */}
        <div
          ref={fillRef}
          className={`h-full origin-left transition-colors duration-500 ${progressColors[status]}`}
          style={{ transform: progressFillTransform(progress / 100) }}
        />
        {/* A sibling of the fill, not a child: a transformed element contains its absolutely
            positioned descendants, so inside the fill the shimmer would shrink with the scale
            instead of sweeping the whole track. */}
        {status === 'running' && (
          <div className="animate-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        )}
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
    success: 'text-[var(--status-ok)]',
    pending: 'text-[var(--status-warn)] animate-spin',
    error: 'text-[var(--status-err)]',
  };

  return (
    <div className="group -mx-2 flex items-start gap-2 rounded px-2 py-1 font-mono text-sm transition-colors hover:bg-[var(--accent)]/5">
      <span className={`${colors[status]} shrink-0`}>{icons[status]}</span>
      <span className="flex-1 text-[var(--foreground)]">{children}</span>
      {timestamp && <span className="shrink-0 text-xs text-[var(--muted)]">{timestamp}</span>}
    </div>
  );
}
