'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ArchitectureNode } from '@/data/architecture-graph';
import type { FeaturedProject } from '@/data/featured-projects';
import { ArchitectureBackground } from './featured-work/architecture-background';
import { MetricCounter } from './featured-work/metric-counter';

const ARROW = 'M17 8l4 4m0 0l-4 4m4-4H3';
const NO_ACTIVE_NODES: readonly ArchitectureNode[] = [];
// An outline (not a ring) so the indicator survives Windows High Contrast / forced-colors mode,
// where box-shadow is not painted.
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

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
          className={`absolute h-3 w-3 text-[var(--tmux-border)] opacity-50 transition-colors duration-300 group-hover:text-[var(--accent)] group-hover:opacity-100 group-focus-visible:text-[var(--accent)] group-focus-visible:opacity-100 ${corner.className}`}
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
  onHoverChange: (hovered: boolean) => void;
  onFocusChange: (focused: boolean) => void;
}

function ProjectCard({ project, index, isActive, onHoverChange, onFocusChange }: ProjectCardProps) {
  const titleId = `featured-${project.slug}-title`;
  const descriptionId = `featured-${project.slug}-description`;

  return (
    <Link
      href={`/work/${project.slug}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-active={isActive}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      className={`group relative block rounded border bg-[var(--card)]/75 p-6 backdrop-blur-md transition-all duration-500 ${FOCUS_RING} ${
        isActive
          ? 'border-[var(--accent)]/50 shadow-[0_0_30px_rgba(139,92,246,0.1)]'
          : 'border-[var(--tmux-border)]/30'
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
          <span className="font-mono text-xs text-[var(--tmux-status-ok)]">{project.status}</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <h3
            id={titleId}
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
          <p
            id={descriptionId}
            className="mb-4 text-sm leading-relaxed text-[var(--tmux-bar-text)]"
          >
            {project.description}
          </p>
          <ul role="list" className="flex flex-wrap gap-2" aria-label="Technologies">
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

        <MetricCounter {...project.metric} active={isActive} />
      </div>

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden rounded transition-opacity duration-500 ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="scan-line" />
      </div>
    </Link>
  );
}

interface FeaturedWorkProps {
  projects: readonly FeaturedProject[];
}

export function FeaturedWork({ projects }: FeaturedWorkProps) {
  // Two independent sources of activation. Pointer wins while it is over a card, so moving the
  // mouse away from one card cannot switch off another card that still holds keyboard focus.
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const activeSlug = hoveredSlug ?? focusedSlug;
  const activeNodes =
    projects.find((project) => project.slug === activeSlug)?.activeNodes ?? NO_ACTIVE_NODES;

  const setSlugIf = (setter: typeof setHoveredSlug, slug: string) => (on: boolean) =>
    setter((current) => (on ? slug : current === slug ? null : current));

  if (projects.length === 0) return null;

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
                className="font-mono text-xs tracking-widest whitespace-nowrap text-[var(--accent-hover)] uppercase dark:text-[var(--tmux-pane-title-text)]"
              >
                Featured Work
              </h2>
            </div>
            <div
              aria-hidden="true"
              className="hidden h-px w-24 bg-gradient-to-r from-[var(--tmux-border)]/50 to-transparent sm:block"
            />
          </div>
          <Link
            href="/work"
            className={`group flex items-center gap-2 rounded font-mono text-xs text-[var(--tmux-bar-text)] transition-colors hover:text-[var(--tmux-bar-text-bright)] ${FOCUS_RING}`}
          >
            <span className="whitespace-nowrap">VIEW ARCHIVE</span>
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

        <ul role="list" className="grid list-none gap-6 p-0">
          {projects.map((project, index) => (
            <li key={project.slug}>
              <ProjectCard
                project={project}
                index={index}
                isActive={activeSlug === project.slug}
                onHoverChange={setSlugIf(setHoveredSlug, project.slug)}
                onFocusChange={setSlugIf(setFocusedSlug, project.slug)}
              />
            </li>
          ))}
        </ul>

        <div className="mt-16 text-center">
          <p className="mb-6 font-mono text-sm text-[var(--tmux-bar-text)]">
            Want to see the full architecture breakdown?
          </p>
          <Link
            href="/work"
            className={`inline-flex items-center gap-2 rounded border border-[var(--tmux-border)] bg-[var(--card)]/75 px-8 py-4 font-mono text-sm text-[var(--tmux-bar-text-bright)] backdrop-blur-md transition-all duration-300 hover:border-[var(--accent)] hover:text-[var(--tmux-pane-title-text)] hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] ${FOCUS_RING}`}
          >
            <span>Explore All Projects</span>
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ARROW} />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
