'use client';

import { forwardRef, useEffect, useRef, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { runWithGsap } from './load-gsap';

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
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="font-mono text-[10px] text-[var(--accent-text)]">ACTIVE</span>
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
    success: 'bg-[var(--status-ok)]',
    warning: 'bg-[var(--status-warn)]',
    error: 'bg-[var(--status-err)]',
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

// Stat Display with glitch hover effect on value.
// `highlight` marks a live value with a glow that pulses around it. The value itself never pulses:
// Tailwind's pulse takes opacity down to 0.5, which left --accent-text at 2.60:1 on the Terminal
// for half of every cycle, and ADR 0011 never dims accent text. Nothing is painted under the value
// either. A tint there would stack with the HudPanel's and this row's own hover tints: at the
// centre of a hovered light HudPanel, where its GlowBorder peaks, even /10 takes the value from
// 4.81:1 to 4.25:1. A box-shadow is painted only outside the box it belongs to, so a highlighted
// value keeps the contrast of a plain one on every surface. The glow does reach 16px out (a 6px
// inset and a 10px blur) and paints over the label, which is not positioned, so the row keeps a
// gap-4 between them: a long label in a narrow row would otherwise sit under the glow. Forced
// colours drop box-shadows, so there the glow is an outline, which they keep.
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
  const rowRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Quick glitch on hover. Reduced motion skips it; the row still answers the hover with its tint
  // and the label's colour. One paused timeline is restarted on every hover, so re-entering
  // mid-shake starts it again from rest rather than stacking a second timeline on the value, and
  // the context reverts it, inline transform included, on unmount or when reduced motion turns on.
  // GSAP arrives on the first intent (load-gsap.ts): a hover before then finds no timeline and does
  // nothing rather than playing late, and the cleanup cancels a build that has not run yet.
  useEffect(() => {
    const row = rowRef.current;
    const valueEl = valueRef.current;
    if (prefersReducedMotion || !row || !valueEl) return;

    let glitch: gsap.core.Timeline | undefined;
    let ctx: gsap.Context | undefined;
    const cancelBuild = runWithGsap(({ gsap }) => {
      ctx = gsap.context(() => {
        glitch = gsap
          .timeline({ paused: true })
          .to(valueEl, { x: -2, duration: 0.05 })
          .to(valueEl, { x: 2, duration: 0.05 })
          .to(valueEl, { x: -1, duration: 0.05 })
          .to(valueEl, { x: 0, duration: 0.05 })
          .to(valueEl, { scale: 1.1, duration: 0.1 })
          .to(valueEl, { scale: 1, duration: 0.2, ease: 'elastic.out(1, 0.3)' });
      });
    });
    const onMouseEnter = () => glitch?.restart();
    row.addEventListener('mouseenter', onMouseEnter);
    return () => {
      row.removeEventListener('mouseenter', onMouseEnter);
      cancelBuild();
      ctx?.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={rowRef}
      className={`group -mx-2 flex cursor-pointer items-center justify-between gap-4 rounded p-2 transition-colors hover:bg-[var(--accent)]/5 ${className}`}
    >
      <span className="font-mono text-xs tracking-wider text-[var(--muted)] uppercase transition-colors group-hover:text-[var(--foreground)]">
        {label}
      </span>
      {/* No CSS transition on this span: GSAP writes its transform on every frame of the glitch,
          and a transition would ease each write and smear the shake. */}
      <span
        ref={valueRef}
        className={`relative inline-block font-mono text-[var(--accent-text)] ${highlight ? 'font-bold' : ''}`}
      >
        {/* A highlighted empty value gets no glow: it would pulse around nothing. */}
        {highlight && String(value).trim() !== '' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 animate-pulse rounded shadow-[0_0_10px_color-mix(in_oklab,var(--accent)_60%,transparent)] forced-colors:outline"
          />
        )}
        {/* Positioned, and after the glow, so that it paints above it. */}
        <span className="relative">{value}</span>
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

// Code Line with hover highlight.
// The gutter paints `--muted` at full opacity: `--muted/50` composited to 2.74:1 on the
// Terminal's #0d1117, and ADR 0011 forbids dimming text with an alpha modifier, where the
// token itself is 7.50:1. On row hover it brightens to `--foreground`, the same idiom as the
// labels in ProgressBar, StatDisplay, QuestItem and PipelineStage. That hover is also the only
// one a `highlighted` row has, because the branch below swaps `hover:bg` for a resting `bg`
// rather than adding to it.
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
        <span className="w-8 shrink-0 pr-4 text-right text-[var(--muted)] transition-colors select-none group-hover:text-[var(--foreground)]">
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
        {/* Colours only: GauntletPhase writes the width on every frame of a stage, and a width
            transition would restart on each write and trail the progress. */}
        <div
          className={`h-full rounded-full transition-colors duration-500 ${progressColors[status]}`}
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

// Data stream effect for background.
// The texture is the pattern this component used to render as 50 lines of 80 characters: the digit
// on line r (1-50) in column c (1-80) is a 1 when r * c * 7 mod 13 is above 6. That depends only
// on r and c mod 13, so the old block was one 13x13 tile repeated, and a mask cut from that tile
// reproduces it exactly while filling a container of any size. It is built once, at module load,
// and is the same string on the server and the client, so hydration never mismatches.
//
// Drawn rather than typed, because text is what made it an accessibility defect: ~4,000 digits sat
// in the accessibility tree, and under the wrapper's opacity axe measured them at 1.12:1 (dark) and
// 1.17:1 (light): a violation where nothing covers the stream, and undecidable (bgOverlap) where
// text does, which the gate's zero incomplete budget fails on most routes. The digits are cut out
// of a solid --accent fill with a CSS mask rather than drawn as an <svg>, a canvas or a
// background-image, because axe treats any of those as an image behind the text laid over the
// stream and reports that text as undecidable too. A solid fill under a mask stays measurable.
// As a decorative graphic it takes --accent, not the text token (ADR 0011). --accent is darker
// than the old digits against the dark page, so the wrapper doubles its opacity there: 1.14:1
// against the page, where the digits were 1.12:1 (light keeps 10%: 1.15:1 against 1.17:1). Text
// laid over the stream still measures 6.82:1 for --muted in dark and 4.97:1 in light, with axe
// counting the fill as a full layer.
const STREAM_CELL_W = 4.8; // one Geist Mono advance (0.6em) at the old 8px
const STREAM_CELL_H = 10; // one 8px line at leading-tight
const STREAM_PERIOD = 13;
const STREAM_TILE_W = STREAM_PERIOD * STREAM_CELL_W;
const STREAM_TILE_H = STREAM_PERIOD * STREAM_CELL_H;

const svgNumber = (n: number) => String(Math.round(n * 100) / 100);

function dataStreamTile(): string {
  let ones = '';
  let zeros = '';
  for (let row = 0; row < STREAM_PERIOD; row++) {
    for (let col = 0; col < STREAM_PERIOD; col++) {
      const x = col * STREAM_CELL_W;
      const y = row * STREAM_CELL_H;
      if (((row + 1) * (col + 1) * 7) % 13 > 6) {
        // A 1: flag, stem and foot.
        ones += `M${svgNumber(x + 1.2)} ${svgNumber(y + 3.2)}l1.2-1v5.6m-1.2 0h2.4`;
      } else {
        // A 0, then Geist Mono's centre dot.
        zeros += `M${svgNumber(x + 0.9)} ${svgNumber(y + 5)}a1.5 2.8 0 1 0 3 0a1.5 2.8 0 1 0-3 0m1.5-.4v.8`;
      }
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${svgNumber(STREAM_TILE_W)}' height='${STREAM_TILE_H}' ` +
    `fill='none' stroke='#000' stroke-width='.8' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path id='ones' d='${ones}'/><path id='zeros' d='${zeros}'/></svg>`;
  // Only what a data URI in a quoted CSS url() cannot carry raw is escaped, as Bootstrap does for
  // its SVG icons; encodeURIComponent would also turn every space into %20.
  return `url("data:image/svg+xml,${svg.replace(/[#%<>]/g, encodeURIComponent)}")`;
}

function dataStreamStyle() {
  const tileSize = `${svgNumber(STREAM_TILE_W)}px ${STREAM_TILE_H}px`;
  return {
    // Carried once in a custom property, so the tile is not serialised twice. It is a data: URI,
    // which the production Content-Security-Policy refuses (img-src 'self', ADR 0023): no route
    // renders DataStream today, and one that did would need img-src data: first.
    '--data-stream-tile': dataStreamTile(),
    maskImage: 'var(--data-stream-tile)',
    WebkitMaskImage: 'var(--data-stream-tile)',
    maskSize: tileSize,
    WebkitMaskSize: tileSize,
    // One tile taller than the container and scrolled up by exactly one tile per loop, so the loop
    // restarts on a frame identical to the one it ends on.
    height: `calc(100% + ${STREAM_TILE_H}px)`,
    '--scroll-up-by': `${STREAM_TILE_H}px`,
  } satisfies CSSProperties & Record<`--${string}`, string>;
}

// Pure, so a bundle that imports this module for its other components can drop the tile.
const DATA_STREAM_STYLE = /* @__PURE__ */ dataStreamStyle();

export function DataStream({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden opacity-10 dark:opacity-20 ${className}`}
    >
      <div
        className="animate-scroll-up absolute inset-x-0 top-0 bg-[var(--accent)]"
        style={DATA_STREAM_STYLE}
      />
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
