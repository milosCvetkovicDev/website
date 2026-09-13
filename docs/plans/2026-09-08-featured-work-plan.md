# Featured Work Architecture Diagram Implementation Plan (PR B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Featured Work redesign started on 2026-03-29: project cards on the home page light up the parts of a system-architecture diagram each project touched, with honest metrics, keyboard support, reduced-motion support and tests.

**Architecture:** The diagram's nodes, connections and the "which connections are active" rule are plain data and a pure function in `src/data/architecture-graph.ts`. Featured projects are derived from `src/data/case-studies.ts` (single source of truth for title, description, tags) plus presentation extras in `src/data/featured-projects.ts`. Three client components under `src/components/featured-work/`: `ArchitectureBackground` (decorative SVG, `aria-hidden`), `MetricCounter` (deterministic count-up to the real value; static under reduced motion) and the cards in `featured-work.tsx`, which own the single piece of state (the active project) and drive it from hover _and_ keyboard focus.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Vitest + Testing Library, Playwright.

**Design:** `docs/plans/2026-09-08-repo-hardening-and-launch-design.md` (D9). **Branch:** `feat/featured-work-architecture-diagram`, based on `chore/tooling-and-quality-gates` (PR #3) until that merges; the March work in progress is preserved on `feat/featured-work-wip-2026-03` (`b0b23f8`) and its two files are carried over unstaged as the starting point.

**Decision recorded here:** the March draft jittered the metrics randomly to look "live" and changed the Enterprise platform metric to an invented "99.98 % uptime". This plan restores the metrics the site already claimed (73 % faster resolution, 40 % less complexity, 5× faster builds) and animates a count-up _to_ those values. If Milos prefers different figures, only `src/data/featured-projects.ts` changes.

**Stop condition for the PR:**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
pnpm --filter web test:e2e                                                     # all passed, incl. featured-work.spec.ts
# ui-reviewer agent + adversarial review triaged in the PR; screenshots light/dark/mobile attached
```

---

### Task B0: Commit this plan

- [x] `git add docs/plans/2026-09-08-featured-work-plan.md && git commit -m "docs(plans): add featured work implementation plan"`

---

### Task B1: Architecture graph data and active-connection rule (TDD)

**Files:**

- Create: `apps/web/src/data/architecture-graph.ts`
- Test: `apps/web/src/data/__tests__/architecture-graph.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { CONNECTIONS, NODES, getActiveConnections } from '../architecture-graph';

describe('architecture graph', () => {
  it('only connects nodes that exist', () => {
    const ids = new Set(NODES.map((node) => node.id));
    for (const connection of CONNECTIONS) {
      expect(ids.has(connection.source)).toBe(true);
      expect(ids.has(connection.target)).toBe(true);
    }
  });

  it('marks nothing active when no node is active', () => {
    expect(getActiveConnections([]).every((connection) => !connection.active)).toBe(true);
  });

  it('activates a connection only when both of its ends are active', () => {
    const active = getActiveConnections(['client', 'gateway', 'backend', 'db']).filter(
      (connection) => connection.active,
    );
    const pairs = active.map((connection) => `${connection.source}->${connection.target}`);
    expect(pairs).toEqual(['client->gateway', 'gateway->backend', 'backend->db']);
  });

  it('ignores a lone active node', () => {
    expect(getActiveConnections(['ai']).some((connection) => connection.active)).toBe(false);
  });
});
```

Run: `pnpm --filter web exec vitest run src/data` → fails (`Failed to resolve import "../architecture-graph"`).

- [x] **Step 2: Implementation**

```ts
export type ArchitectureNode =
  'client' | 'gateway' | 'auth' | 'backend' | 'worker' | 'db' | 'cache' | 'ai' | 'storage';

export type NodeKind = 'user' | 'compute' | 'data' | 'ai';

export interface Position {
  x: number;
  y: number;
}

export interface NodeDefinition {
  id: ArchitectureNode;
  label: string;
  pos: Position;
  kind: NodeKind;
}

export interface Connection {
  source: ArchitectureNode;
  target: ArchitectureNode;
  /** SVG path `d` attribute in VIEW_BOX coordinates. */
  path: string;
}

export const VIEW_BOX = { width: 1100, height: 600 } as const;

export const NODES: readonly NodeDefinition[] = [
  { id: 'client', label: 'Client / CLI', pos: { x: 100, y: 300 }, kind: 'user' },
  { id: 'gateway', label: 'API Gateway', pos: { x: 300, y: 300 }, kind: 'compute' },
  { id: 'auth', label: 'Auth Service', pos: { x: 500, y: 150 }, kind: 'compute' },
  { id: 'backend', label: 'Core Backend', pos: { x: 500, y: 300 }, kind: 'compute' },
  { id: 'worker', label: 'Job Worker', pos: { x: 500, y: 450 }, kind: 'compute' },
  { id: 'cache', label: 'Redis Cache', pos: { x: 750, y: 150 }, kind: 'data' },
  { id: 'db', label: 'PostgreSQL', pos: { x: 750, y: 300 }, kind: 'data' },
  { id: 'storage', label: 'Blob Storage', pos: { x: 750, y: 450 }, kind: 'data' },
  { id: 'ai', label: 'Claude AI', pos: { x: 950, y: 300 }, kind: 'ai' },
];

function position(id: ArchitectureNode): Position {
  const node = NODES.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown architecture node: ${id}`);
  return node.pos;
}

/** Cubic curve between two points, bending horizontally or vertically. */
function curve(from: Position, to: Position, orientation: 'horizontal' | 'vertical'): string {
  if (orientation === 'horizontal') {
    const cpX = from.x + (to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${cpX} ${from.y}, ${cpX} ${to.y}, ${to.x} ${to.y}`;
  }
  const cpY = from.y + (to.y - from.y) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x} ${cpY}, ${to.x} ${cpY}, ${to.x} ${to.y}`;
}

function connect(
  source: ArchitectureNode,
  target: ArchitectureNode,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  targetOverride?: Position,
): Connection {
  return {
    source,
    target,
    path: curve(position(source), targetOverride ?? position(target), orientation),
  };
}

export const CONNECTIONS: readonly Connection[] = [
  connect('client', 'gateway'),
  connect('gateway', 'auth'),
  connect('gateway', 'backend'),
  connect('gateway', 'worker'),
  connect('backend', 'cache'),
  connect('backend', 'db'),
  connect('worker', 'db'),
  connect('worker', 'storage'),
  // Slightly offset so it does not overlap backend -> db at the database node.
  connect('auth', 'db', 'horizontal', { x: 750, y: 280 }),
  connect('backend', 'worker', 'vertical'),
  connect('worker', 'ai'),
  connect('backend', 'ai'),
];

export interface ConnectionState extends Connection {
  active: boolean;
}

/** A connection lights up only when both of its ends belong to the active project. */
export function getActiveConnections(active: readonly ArchitectureNode[]): ConnectionState[] {
  const activeSet = new Set(active);
  return CONNECTIONS.map((connection) => ({
    ...connection,
    active: activeSet.has(connection.source) && activeSet.has(connection.target),
  }));
}
```

- [x] **Step 3:** `pnpm --filter web exec vitest run src/data` → 4 passed. Commit: `git add apps/web/src/data && git commit -m "feat(web): add architecture graph data with active-connection rule"`

---

### Task B2: Featured projects derived from case studies (TDD)

**Files:**

- Create: `apps/web/src/data/featured-projects.ts`
- Test: `apps/web/src/data/__tests__/featured-projects.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { caseStudies } from '../case-studies';
import { featuredProjects } from '../featured-projects';

describe('featuredProjects', () => {
  it('lists three projects that all exist as case studies', () => {
    expect(featuredProjects).toHaveLength(3);
    const slugs = new Set(caseStudies.map((study) => study.slug));
    for (const project of featuredProjects) {
      expect(slugs.has(project.slug)).toBe(true);
    }
  });

  it('takes title, description and tags from the case study', () => {
    for (const project of featuredProjects) {
      const study = caseStudies.find((candidate) => candidate.slug === project.slug);
      expect(project.title).toBe(study?.title);
      expect(project.description).toBe(study?.description);
      expect(project.tags).toEqual(study?.tags);
    }
  });

  it('gives every project at least two architecture nodes and a positive metric', () => {
    for (const project of featuredProjects) {
      expect(project.activeNodes.length).toBeGreaterThanOrEqual(2);
      expect(project.metric.value).toBeGreaterThan(0);
    }
  });
});
```

- [x] **Step 2: Implementation**

```ts
import type { ArchitectureNode } from './architecture-graph';
import { caseStudies } from './case-studies';

export interface FeaturedMetric {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export interface FeaturedProject {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  status: 'LIVE' | 'PRODUCTION';
  activeNodes: ArchitectureNode[];
  metric: FeaturedMetric;
}

type Highlight = Pick<FeaturedProject, 'category' | 'status' | 'activeNodes' | 'metric'>;

// Presentation extras only; copy comes from the case study so the two never drift apart.
const highlights: Record<string, Highlight> = {
  'self-healing-agent': {
    category: 'AI AGENT',
    status: 'LIVE',
    activeNodes: ['client', 'worker', 'ai'],
    metric: { value: 73, suffix: '%', label: 'faster resolution' },
  },
  'enterprise-b2b-platform': {
    category: 'PLATFORM',
    status: 'PRODUCTION',
    activeNodes: ['client', 'gateway', 'backend', 'db'],
    metric: { value: 40, suffix: '%', label: 'less complexity' },
  },
  'nx-remote-cache': {
    category: 'DEVOPS',
    status: 'PRODUCTION',
    activeNodes: ['client', 'worker', 'cache', 'storage'],
    metric: { value: 5, suffix: '×', label: 'faster builds' },
  },
};

export const featuredProjects: FeaturedProject[] = Object.entries(highlights).map(
  ([slug, highlight]) => {
    const study = caseStudies.find((candidate) => candidate.slug === slug);
    if (!study) throw new Error(`Featured project "${slug}" has no case study`);
    return {
      slug,
      title: study.title,
      description: study.description,
      tags: study.tags,
      ...highlight,
    };
  },
);
```

- [x] **Step 3:** tests green → `git commit -m "feat(web): add featured projects data derived from case studies"`

---

### Task B3: MetricCounter (TDD)

**Files:**

- Create: `apps/web/src/components/featured-work/metric-counter.tsx`
- Test: `apps/web/src/components/featured-work/__tests__/metric-counter.test.tsx`

- [x] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricCounter } from '../metric-counter';

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  });
}

describe('MetricCounter', () => {
  beforeEach(() => {
    // Run the whole animation in one frame so the test is deterministic.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now() + 10_000);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('shows the final value when idle', () => {
    stubMatchMedia(false);
    render(<MetricCounter value={73} suffix="%" label="faster resolution" active={false} />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('counts up to the real value when active', () => {
    stubMatchMedia(false);
    render(<MetricCounter value={73} suffix="%" label="faster resolution" active />);
    expect(screen.getByText('73%')).toBeInTheDocument();
  });

  it('never animates under reduced motion', () => {
    stubMatchMedia(true);
    const raf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    render(<MetricCounter value={5} suffix="×" label="faster builds" active />);
    expect(screen.getByText('5×')).toBeInTheDocument();
    expect(raf).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Implementation**

```tsx
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
      className={`shrink-0 rounded border border-[var(--tmux-border)]/50 bg-black/40 p-4 text-center backdrop-blur-md transition-all duration-300 lg:w-40 ${
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
```

`setProgress` runs inside the animation-frame callback, not synchronously in the effect body, so react-hooks/set-state-in-effect is satisfied.

- [x] **Step 3:** tests green → `git commit -m "feat(web): add deterministic metric counter"`

---

### Task B4: ArchitectureBackground

**Files:**

- Rewrite: `apps/web/src/components/featured-work/architecture-background.tsx` (starting from the March draft)

- [x] **Step 1: Replace the file**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Decorative system diagram behind the featured work cards. Purely visual: hidden from AT. */
export function ArchitectureBackground({ activeNodes = [] }: ArchitectureBackgroundProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only run the SMIL packet animations while the section is on screen.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      rootMargin: '100px',
    });
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
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-40 transition-opacity duration-700 dark:opacity-60"
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        data-testid="architecture-diagram"
      >
        <defs>
          <filter id="architecture-glow" x="-20%" y="-20%" width="140%" height="140%">
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
                    filter="url(#architecture-glow)"
                  />
                )}
                {animatePackets && (!hasActive || connection.active) && (
                  <circle
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
                  fontFamily="monospace"
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
```

- [x] **Step 2:** `pnpm --filter web exec eslint --max-warnings 0 src/components/featured-work` → clean. Commit: `git add apps/web/src/components/featured-work/architecture-background.tsx && git commit -m "feat(web): decorative architecture diagram driven by graph data"`

---

### Task B5: Featured Work cards (TDD)

**Files:**

- Rewrite: `apps/web/src/components/featured-work.tsx`
- Test: `apps/web/src/components/__tests__/featured-work.test.tsx`

- [x] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeaturedWork } from '../featured-work';
import { featuredProjects } from '@/data/featured-projects';

describe('FeaturedWork', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
  });

  it('renders one link per featured project with its case-study title', () => {
    render(<FeaturedWork />);
    for (const project of featuredProjects) {
      expect(screen.getByRole('link', { name: new RegExp(project.title) })).toHaveAttribute(
        'href',
        `/work/${project.slug}`,
      );
    }
  });

  it('activates a project and its architecture nodes on keyboard focus', () => {
    const { container } = render(<FeaturedWork />);
    const [first, second] = featuredProjects;
    const secondCard = screen.getByRole('link', { name: new RegExp(second.title) });

    fireEvent.focus(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'true');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(3);

    fireEvent.blur(secondCard);
    expect(secondCard).toHaveAttribute('data-active', 'false');
    expect(container.querySelectorAll('path[data-active="true"]')).toHaveLength(0);

    fireEvent.mouseEnter(screen.getByRole('link', { name: new RegExp(first.title) }));
    expect(container.querySelectorAll('g[data-active="true"]')).toHaveLength(
      first.activeNodes.length,
    );
  });

  it('is labelled as a landmark region', () => {
    render(<FeaturedWork />);
    expect(screen.getByRole('region', { name: /featured work/i })).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Implementation**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { featuredProjects, type FeaturedProject } from '@/data/featured-projects';
import { ArchitectureBackground } from './featured-work/architecture-background';
import { MetricCounter } from './featured-work/metric-counter';

const ARROW = 'M17 8l4 4m0 0l-4 4m4-4H3';

function CornerBrackets() {
  const corners = [
    { className: '-top-px -left-px', d: 'M0 6 L0 0 L6 0' },
    { className: '-top-px -right-px', d: 'M6 0 L12 0 L12 6' },
    { className: '-bottom-px -left-px', d: 'M0 6 L0 12 L6 12' },
    { className: '-bottom-px -right-px', d: 'M6 12 L12 12 L12 6' },
  ];
  return (
    <>
      {corners.map((corner) => (
        <svg
          key={corner.d}
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`absolute h-3 w-3 text-[var(--tmux-border)] opacity-50 transition-colors duration-300 group-hover:text-[var(--accent)] group-hover:opacity-100 group-focus-visible:text-[var(--accent)] ${corner.className}`}
        >
          <path d={corner.d} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      ))}
    </>
  );
}

interface ProjectCardProps {
  project: FeaturedProject;
  index: number;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

function ProjectCard({ project, index, isActive, onActivate, onDeactivate }: ProjectCardProps) {
  return (
    <Link
      href={`/work/${project.slug}`}
      data-active={isActive}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      className={`group relative block rounded border bg-black/40 p-6 backdrop-blur-md transition-all duration-500 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none ${
        isActive
          ? 'border-[var(--accent)]/50 shadow-[0_0_30px_rgba(139,92,246,0.1)]'
          : 'border-[var(--tmux-border)]/30 hover:bg-[var(--accent)]/5'
      }`}
    >
      <CornerBrackets />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`font-mono text-2xl font-bold transition-colors duration-300 ${
              isActive ? 'text-[var(--accent)]/80' : 'text-[var(--tmux-bar-text)]/40'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider transition-colors duration-300 ${
              isActive
                ? 'border-[var(--accent)]/50 text-[var(--accent)]'
                : 'border-[var(--tmux-border)] text-[var(--tmux-bar-text)]'
            }`}
          >
            {project.category}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--tmux-status-ok)]"
          />
          <span className="font-mono text-[10px] text-[var(--tmux-status-ok)] opacity-80">
            {project.status}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <h3
            className={`mb-2 flex items-center gap-2 text-xl font-semibold transition-colors duration-300 ${
              isActive ? 'text-[var(--tmux-pane-title-text)]' : 'text-[var(--tmux-bar-text-bright)]'
            }`}
          >
            {project.title}
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-all duration-300 ${
                isActive ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ARROW} />
            </svg>
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-[var(--tmux-bar-text)]">
            {project.description}
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Technologies">
            {project.tags.map((tag) => (
              <li
                key={tag}
                className={`rounded px-2 py-1 font-mono text-xs transition-colors duration-300 ${
                  isActive
                    ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'bg-[var(--tmux-pane-title)]/40 text-[var(--tmux-bar-text)]'
                }`}
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <MetricCounter key={isActive ? 'counting' : 'idle'} {...project.metric} active={isActive} />
      </div>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden rounded transition-opacity duration-500 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent"
          style={{ animation: 'scan-down 2.5s linear infinite', top: '0%' }}
        />
      </div>
    </Link>
  );
}

export function FeaturedWork() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const activeNodes =
    featuredProjects.find((project) => project.slug === activeSlug)?.activeNodes ?? [];

  return (
    <section
      aria-labelledby="featured-work-heading"
      className="relative overflow-hidden bg-[var(--background)] py-24"
    >
      <ArchitectureBackground activeNodes={activeNodes} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-[var(--background)] to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-[var(--background)] to-transparent"
      />

      <div className="relative z-20 mx-auto max-w-5xl px-6">
        <div className="mb-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 animate-pulse rounded-full bg-[var(--tmux-pane-title-text)]"
              />
              <h2
                id="featured-work-heading"
                className="font-mono text-xs tracking-widest text-[var(--tmux-pane-title-text)] uppercase"
              >
                Featured Work
              </h2>
            </div>
            <div
              aria-hidden="true"
              className="h-px w-24 bg-gradient-to-r from-[var(--tmux-border)]/50 to-transparent"
            />
          </div>
          <Link
            href="/work"
            className="group flex items-center gap-2 font-mono text-xs text-[var(--tmux-bar-text)] transition-colors hover:text-[var(--tmux-bar-text-bright)]"
          >
            <span>VIEW ARCHIVE</span>
            <svg
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ARROW} />
            </svg>
          </Link>
        </div>

        <div className="grid gap-6">
          {featuredProjects.map((project, index) => (
            <ProjectCard
              key={project.slug}
              project={project}
              index={index}
              isActive={activeSlug === project.slug}
              onActivate={() => setActiveSlug(project.slug)}
              onDeactivate={() => setActiveSlug(null)}
            />
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="mb-6 font-mono text-sm text-[var(--tmux-bar-text)]">
            Want to see the full architecture breakdown?
          </p>
          <Link
            href="/work"
            className="inline-flex items-center gap-2 rounded border border-[var(--tmux-border)] bg-black/40 px-8 py-4 font-mono text-sm text-[var(--tmux-bar-text-bright)] backdrop-blur-md transition-all duration-300 hover:border-[var(--accent)] hover:text-[var(--tmux-pane-title-text)] hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
          >
            <span>Explore All Projects</span>
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [x] **Step 3:** `pnpm --filter web test` → all green; `pnpm --filter web exec eslint --max-warnings 0 src/components` → clean. Commit: `git add apps/web/src/components/featured-work.tsx apps/web/src/components/__tests__/featured-work.test.tsx && git commit -m "feat(web): featured work cards drive the architecture diagram on hover and focus"`

---

### Task B6: End-to-end smoke test

**Files:**

- Create: `apps/web/e2e/featured-work.spec.ts`

- [x] **Step 1:**

```ts
import { expect, test } from '@playwright/test';

test.describe('Featured Work', () => {
  test('cards light up the architecture diagram on hover and keyboard focus', async ({ page }) => {
    await page.goto('/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();

    const cards = section.getByRole('link', {
      name: /Self-Healing Agent|Enterprise B2B Platform|Nx Remote Cache/,
    });
    await expect(cards).toHaveCount(3);
    await expect(section.locator('path[data-active="true"]')).toHaveCount(0);

    await cards.first().hover();
    await expect(section.locator('path[data-active="true"]').first()).toBeAttached();

    await page.mouse.move(0, 0);
    await cards.nth(1).focus();
    await expect(cards.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(3);
  });
});
```

- [x] **Step 2:** `pnpm --filter web test:e2e` → all passed (10). Commit: `git commit -m "test(web): e2e smoke test for featured work interactions"`

---

### Task B7: Visual and independent review

- [x] **Step 1:** `pnpm --filter web build && pnpm --filter web start &` then `pnpm --filter web exec playwright screenshot --viewport-size=1280,900 --full-page http://localhost:3000 <scratch>/home-light.png`, the same with `--color-scheme dark`, and `--device "iPhone 13"`; inspect the Featured Work section in each; stop the server.
- [x] **Step 2:** Run the `ui-reviewer` agent on `apps/web/src/components/featured-work.tsx` and `apps/web/src/components/featured-work/*`; fix or record each finding.
- [x] **Step 3:** Run the adversarial review (diff only) and the edge-case trace; triage in the PR.

---

### Task B8: Gate, push, PR

- [x] **Step 1:** Full gate (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then `pnpm --filter web test:e2e`).
- [x] **Step 2:** Tick this plan, `git push -u origin feat/featured-work-architecture-diagram`, `gh pr create --base chore/tooling-and-quality-gates` (retarget to `main` after PR #3 merges).
- [x] **Step 3:** Watch CI; hand off with screenshots.
