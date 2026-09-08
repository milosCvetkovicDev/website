'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import {
  NODES,
  VIEW_BOX,
  getActiveConnections,
  type ArchitectureNode,
  type NodeKind,
} from '@/data/architecture-graph';

interface ArchitectureBackgroundProps {
  activeNodes?: readonly ArchitectureNode[];
}

const ACTIVE_BORDER: Record<NodeKind, string> = {
  user: 'var(--tmux-status-ok)',
  compute: 'var(--accent)',
  data: 'var(--tmux-status-wrn)',
  ai: 'var(--tmux-status-alerts)',
};

function NodeShape({ kind, active }: { kind: NodeKind; active: boolean }) {
  const common = {
    fill: active ? 'var(--tmux-active-tab)' : 'var(--tmux-bg)',
    stroke: active ? ACTIVE_BORDER[kind] : 'var(--tmux-border)',
    strokeWidth: active ? 2 : 1,
  };
  if (kind === 'data') {
    return <path d="M-20,-10 C-20,-16 20,-16 20,-10 L20,10 C20,16 -20,16 -20,10 Z" {...common} />;
  }
  if (kind === 'ai') {
    return <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" {...common} />;
  }
  return <rect x={-24} y={-16} width={48} height={32} rx={6} {...common} />;
}

/**
 * Decorative system diagram behind the featured work cards. Purely visual: hidden from assistive
 * technology, hidden on small screens (it would be magnified behind the stacked cards), and its
 * packet animations only run while the section is on screen and motion is allowed.
 */
export function ArchitectureBackground({ activeNodes = [] }: ArchitectureBackgroundProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const glowId = `architecture-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    const element = containerRef.current;
    // Without an observer the packets simply never start. That is the safe direction: the diagram
    // is decorative, and animating it unconditionally would run SMIL loops off-screen forever.
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Entries can be batched; only the most recent one describes the current state.
        const latest = entries[entries.length - 1];
        if (latest) setIsVisible(latest.isIntersecting);
      },
      { rootMargin: '100px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const connections = useMemo(() => getActiveConnections(activeNodes), [activeNodes]);
  const hasActive = activeNodes.length > 0;
  const animatePackets = isVisible && !prefersReducedMotion;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden opacity-40 transition-opacity duration-700 md:block dark:opacity-60"
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full select-none"
      >
        <defs>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g>
          {connections.map((connection) => {
            const dimmed = hasActive && !connection.active;
            return (
              <g key={`${connection.source}-${connection.target}`}>
                <path
                  d={connection.path}
                  fill="none"
                  stroke={connection.active ? 'var(--accent)' : 'var(--tmux-border)'}
                  strokeWidth={connection.active ? 1.5 : 1}
                  opacity={dimmed ? 0.1 : connection.active ? 0.6 : 0.3}
                  data-active={connection.active}
                  className="transition-all duration-700 ease-in-out"
                />
                {connection.active && (
                  <path
                    d={connection.path}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={4}
                    opacity={0.3}
                    filter={`url(#${glowId})`}
                  />
                )}
                {animatePackets && (!hasActive || connection.active) && (
                  <circle
                    key={connection.active ? 'active' : 'idle'}
                    r={2}
                    fill={connection.active ? 'var(--tmux-status-ok)' : 'var(--tmux-bar-text)'}
                    opacity={connection.active ? 1 : 0.4}
                  >
                    <animateMotion
                      dur={connection.active ? '2s' : '4s'}
                      repeatCount="indefinite"
                      path={connection.path}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </g>

        <g>
          {NODES.map((node) => {
            const active = activeNodes.includes(node.id);
            const dimmed = hasActive && !active;
            return (
              <g
                key={node.id}
                transform={`translate(${node.pos.x}, ${node.pos.y})`}
                opacity={dimmed ? 0.3 : 1}
                data-active={active}
                className="transition-all duration-700 ease-in-out"
              >
                {active && (
                  <circle r={24} fill={ACTIVE_BORDER[node.kind]} opacity={0.2}>
                    {!prefersReducedMotion && (
                      <animate
                        attributeName="r"
                        values="24;30;24"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </circle>
                )}
                <NodeShape kind={node.kind} active={active} />
                <rect
                  x={-40}
                  y={24}
                  width={80}
                  height={20}
                  rx={2}
                  fill="var(--tmux-pane-title)"
                  opacity={0.8}
                />
                <text
                  y={38}
                  textAnchor="middle"
                  fontSize={10}
                  className="font-mono"
                  fill={active ? 'var(--tmux-bar-text-bright)' : 'var(--tmux-bar-text)'}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
