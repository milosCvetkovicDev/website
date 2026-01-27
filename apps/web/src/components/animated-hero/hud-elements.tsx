'use client';

import { forwardRef } from 'react';

// Terminal-style container
export const Terminal = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string }
>(({ children, className = '' }, ref) => (
  <div
    ref={ref}
    className={`bg-[#0d1117] border border-[#30363d] rounded-lg font-mono text-sm overflow-hidden ${className}`}
  >
    <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
      <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
      <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
      <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
    </div>
    <div className="p-4">{children}</div>
  </div>
));
Terminal.displayName = 'Terminal';

// HUD Panel
export const HudPanel = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string; title?: string }
>(({ children, className = '', title }, ref) => (
  <div
    ref={ref}
    className={`border border-[var(--accent)]/30 bg-[var(--accent)]/5 rounded-lg backdrop-blur-sm ${className}`}
  >
    {title && (
      <div className="px-4 py-2 border-b border-[var(--accent)]/30 text-xs font-mono text-[var(--accent)] uppercase tracking-wider">
        {title}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
));
HudPanel.displayName = 'HudPanel';

// Progress Bar
export function ProgressBar({
  progress,
  label,
  className = '',
}: {
  progress: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {label && (
        <span className="text-xs font-mono text-[var(--muted)] w-24 shrink-0">
          {label}
        </span>
      )}
      <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs font-mono text-[var(--muted)] w-12 text-right">
        {progress}%
      </span>
    </div>
  );
}

// Stat Display
export function StatDisplay({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={`flex justify-between items-center ${className}`}>
      <span className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-[var(--accent)]">{value}</span>
    </div>
  );
}

// Notification Toast
export const NotificationToast = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; type?: 'success' | 'warning' | 'info' }
>(({ children, type = 'info' }, ref) => {
  const colors = {
    success: 'border-green-500/50 bg-green-500/10 text-green-400',
    warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
    info: 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]',
  };

  return (
    <div
      ref={ref}
      className={`px-4 py-2 rounded-lg border font-mono text-sm ${colors[type]}`}
    >
      {children}
    </div>
  );
});
NotificationToast.displayName = 'NotificationToast';

// Quest Log Checkbox
export function QuestItem({
  completed,
  children,
}: {
  completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span className={completed ? 'text-green-400' : 'text-[var(--muted)]'}>
        {completed ? '☑' : '◻'}
      </span>
      <span className={completed ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}>
        {children}
      </span>
    </div>
  );
}

// Typing Cursor
export function TypingCursor() {
  return (
    <span className="inline-block w-2 h-5 bg-[var(--accent)] animate-pulse ml-1" />
  );
}

// Code Line (for syntax highlighting effect)
export function CodeLine({
  lineNumber,
  children,
  className = '',
}: {
  lineNumber?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex ${className}`}>
      {lineNumber !== undefined && (
        <span className="w-8 shrink-0 text-[var(--muted)]/50 text-right pr-4 select-none">
          {lineNumber}
        </span>
      )}
      <span className="flex-1">{children}</span>
    </div>
  );
}

// Pipeline Stage
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

  const statusText = {
    pending: 'PENDING',
    running: 'RUNNING',
    passed: 'PASSED',
    failed: 'FAILED',
  };

  return (
    <div className="flex items-center gap-4 font-mono text-sm">
      <span className="w-28 shrink-0 text-[var(--muted)]">{name}</span>
      <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status === 'passed'
              ? 'bg-green-500'
              : status === 'failed'
              ? 'bg-red-500'
              : status === 'running'
              ? 'bg-yellow-500'
              : 'bg-[var(--muted)]'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className={`w-20 text-right ${statusColors[status]}`}>
        {statusText[status]}
      </span>
    </div>
  );
}

// Activity Log Entry
export function ActivityEntry({
  status,
  children,
}: {
  status: 'success' | 'pending' | 'error';
  children: React.ReactNode;
}) {
  const icons = {
    success: '✓',
    pending: '⟳',
    error: '✗',
  };
  const colors = {
    success: 'text-green-400',
    pending: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className="flex items-start gap-2 font-mono text-sm">
      <span className={colors[status]}>{icons[status]}</span>
      <span className="text-[var(--foreground)]">{children}</span>
    </div>
  );
}
