import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { caseStudies, formatMetric, type CaseStudy } from '@/data/case-studies';

export const metadata: Metadata = {
  title: 'Work',
  description:
    'Real projects, real constraints, real results. Case studies on AI agents, legacy modernization, and high-performance systems.',
  openGraph: {
    title: 'Work & Case Studies',
    description: 'What happens when you point me at a hard problem.',
  },
};

function CornerBrackets() {
  return (
    <>
      <svg
        className="absolute -top-px -left-px h-3 w-3 text-[var(--accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        viewBox="0 0 12 12"
      >
        <path d="M0 6 L0 0 L6 0" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg
        className="absolute -top-px -right-px h-3 w-3 text-[var(--accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        viewBox="0 0 12 12"
      >
        <path d="M6 0 L12 0 L12 6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg
        className="absolute -bottom-px -left-px h-3 w-3 text-[var(--accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        viewBox="0 0 12 12"
      >
        <path d="M0 6 L0 12 L6 12" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg
        className="absolute -right-px -bottom-px h-3 w-3 text-[var(--accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        viewBox="0 0 12 12"
      >
        <path d="M6 12 L12 12 L12 6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </>
  );
}

function ProjectCard({ project, index }: { project: CaseStudy; index: number }) {
  const meta = project.highlight;
  const isFirst = index === 0;

  return (
    <Link
      href={`/work/${project.slug}`}
      className={`group relative block rounded-lg border border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)] ${
        isFirst ? 'p-8' : 'p-6'
      }`}
    >
      <CornerBrackets />

      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`font-mono font-bold text-[var(--muted)] transition-colors group-hover:text-[var(--accent-text)] ${
              isFirst ? 'text-3xl' : 'text-2xl'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          {meta && (
            <span className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] tracking-wider text-[var(--muted)] transition-colors group-hover:border-[var(--accent)]/30 group-hover:text-[var(--accent-text)]">
              {meta.category}
            </span>
          )}
        </div>
        {meta && (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--status-ok)]" />
            <span className="font-mono text-[10px] text-[var(--status-ok)]">{meta.status}</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className={`flex flex-col ${isFirst ? 'lg:flex-row lg:gap-8' : 'gap-4'}`}>
        <div className="min-w-0 flex-1">
          {/* Title */}
          <h2
            className={`mb-3 flex items-center gap-2 font-semibold transition-colors group-hover:text-[var(--accent-text)] ${
              isFirst ? 'text-2xl md:text-3xl' : 'text-xl'
            }`}
          >
            {project.title}
            <svg
              className="h-5 w-5 -translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </h2>

          {/* Description */}
          <p className={`mb-4 text-[var(--muted)] ${isFirst ? 'text-lg' : 'text-sm'}`}>
            {project.description}
          </p>

          {/* Challenge teaser - only for first/featured */}
          {isFirst && (
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-4">
              <p className="mb-2 font-mono text-xs tracking-wider text-[var(--accent-text)] uppercase">
                The Challenge
              </p>
              <p className="line-clamp-2 text-sm text-[var(--muted)]">{project.challenge}</p>
            </div>
          )}

          {/* Impact preview */}
          {isFirst && (
            <div className="mb-4">
              <p className="mb-2 font-mono text-xs tracking-wider text-[var(--accent-text)] uppercase">
                Key Outcomes
              </p>
              <ul className="space-y-1">
                {project.impact.slice(0, 3).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--muted)]">
                    <span className="mt-0.5 text-[var(--status-ok)]">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {project.tags.slice(0, isFirst ? 6 : 4).map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent-text)] transition-colors group-hover:bg-[var(--accent)]/20"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Metric highlight */}
        {meta && (
          <div
            className={`shrink-0 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 text-center transition-colors group-hover:border-[var(--accent)]/40 group-hover:bg-[var(--accent)]/10 ${
              isFirst ? 'mt-4 lg:mt-0 lg:w-40 lg:self-start' : 'mt-4 w-full'
            }`}
          >
            <div
              className={`mb-1 font-mono font-bold text-[var(--accent-text)] ${isFirst ? 'text-4xl' : 'text-2xl'}`}
            >
              {formatMetric(meta.metric)}
            </div>
            <div className="font-mono text-[10px] tracking-wider text-[var(--muted)] uppercase">
              {meta.metric.label}
            </div>
          </div>
        )}
      </div>

      {/* Read more indicator */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-sm text-[var(--muted)] transition-colors group-hover:text-[var(--accent-text)]">
          Read full case study
        </span>
        <svg
          className="h-4 w-4 text-[var(--muted)] transition-all group-hover:translate-x-1 group-hover:text-[var(--accent-text)]"
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
      </div>

      {/* Scan line effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg opacity-0 transition-opacity group-hover:opacity-100">
        <div
          className="scan-line [animation-play-state:paused] group-hover:[animation-play-state:running]"
          style={
            {
              '--scan-line-color': 'color-mix(in oklab, var(--accent) 20%, transparent)',
            } as CSSProperties
          }
        />
      </div>
    </Link>
  );
}

export default function WorkPage() {
  return (
    <div className="relative overflow-hidden py-16 md:py-24">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              <p className="font-mono text-xs tracking-widest text-[var(--accent-text)] uppercase">
                Case Studies
              </p>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
          </div>
          <h1 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
            Problems solved. Systems shipped.
          </h1>
          <p className="max-w-2xl text-xl text-[var(--muted)]">
            Real projects with real constraints. Each one pushed boundaries—and delivered results.
          </p>
        </div>

        {/* Stats bar */}
        <div className="mb-12 flex flex-wrap justify-center gap-8 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-4 md:gap-16">
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-text)]">{caseStudies.length}</div>
            <div className="text-xs tracking-wider text-[var(--muted)] uppercase">Projects</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-text)]">100%</div>
            <div className="text-xs tracking-wider text-[var(--muted)] uppercase">
              In Production
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-text)]">0</div>
            <div className="text-xs tracking-wider text-[var(--muted)] uppercase">
              Left Unfinished
            </div>
          </div>
        </div>

        {/* Projects */}
        <div className="space-y-6">
          {caseStudies.map((project, index) => (
            <ProjectCard key={project.slug} project={project} index={index} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold">Like what you see?</h2>
          <p className="mx-auto mb-6 max-w-lg text-[var(--muted)]">
            I share engineering deep dives, project updates, and lessons learned. Connect with me to
            follow along.
          </p>
          <a
            href="https://www.linkedin.com/in/milos-cvetkovic-dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            <span>Connect on LinkedIn</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
