import type { Metadata } from 'next';
import Link from 'next/link';
import { caseStudies, type CaseStudy } from '@/data/case-studies';

export const metadata: Metadata = {
  title: 'Work',
  description:
    'Real projects, real constraints, real results. Case studies on AI agents, legacy modernization, and high-performance systems.',
  openGraph: {
    title: 'Work & Case Studies',
    description: 'What happens when you point me at a hard problem.',
  },
};

// Project metadata for enhanced display
const projectMeta: Record<string, { category: string; status: string; metric: { value: string; label: string } }> = {
  'self-healing-agent': {
    category: 'AI AGENT',
    status: 'LIVE',
    metric: { value: '73%', label: 'auto-resolved' },
  },
  'enterprise-b2b-platform': {
    category: 'PLATFORM',
    status: 'PRODUCTION',
    metric: { value: '40%', label: 'fewer bugs' },
  },
  'nx-remote-cache': {
    category: 'DEVOPS',
    status: 'PRODUCTION',
    metric: { value: '5x', label: 'faster builds' },
  },
};

function CornerBrackets() {
  return (
    <>
      <svg className="absolute -top-px -left-px w-3 h-3 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 12 12">
        <path d="M0 6 L0 0 L6 0" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg className="absolute -top-px -right-px w-3 h-3 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 12 12">
        <path d="M6 0 L12 0 L12 6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg className="absolute -bottom-px -left-px w-3 h-3 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 12 12">
        <path d="M0 6 L0 12 L6 12" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <svg className="absolute -bottom-px -right-px w-3 h-3 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" viewBox="0 0 12 12">
        <path d="M6 12 L12 12 L12 6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </>
  );
}

function ProjectCard({ project, index }: { project: CaseStudy; index: number }) {
  const meta = projectMeta[project.slug];
  const isFirst = index === 0;

  return (
    <Link
      href={`/work/${project.slug}`}
      className={`group relative block rounded-lg border border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm hover:bg-[var(--accent)]/5 hover:border-[var(--accent)]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)] ${
        isFirst ? 'p-8' : 'p-6'
      }`}
    >
      <CornerBrackets />

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`font-mono font-bold text-[var(--accent)]/30 group-hover:text-[var(--accent)]/60 transition-colors ${
            isFirst ? 'text-3xl' : 'text-2xl'
          }`}>
            {String(index + 1).padStart(2, '0')}
          </span>
          {meta && (
            <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider text-[var(--muted)] border border-[var(--border)] rounded group-hover:border-[var(--accent)]/30 group-hover:text-[var(--accent)] transition-colors">
              {meta.category}
            </span>
          )}
        </div>
        {meta && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-mono text-green-500/80">{meta.status}</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className={`flex flex-col ${isFirst ? 'lg:flex-row lg:gap-8' : 'gap-4'}`}>
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h2 className={`font-semibold mb-3 group-hover:text-[var(--accent)] transition-colors flex items-center gap-2 ${
            isFirst ? 'text-2xl md:text-3xl' : 'text-xl'
          }`}>
            {project.title}
            <svg
              className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </h2>

          {/* Description */}
          <p className={`text-[var(--muted)] mb-4 ${isFirst ? 'text-lg' : 'text-sm'}`}>
            {project.description}
          </p>

          {/* Challenge teaser - only for first/featured */}
          {isFirst && (
            <div className="mb-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--background)]/50">
              <p className="text-xs font-mono text-[var(--accent)] uppercase tracking-wider mb-2">The Challenge</p>
              <p className="text-sm text-[var(--muted)] line-clamp-2">
                {project.challenge}
              </p>
            </div>
          )}

          {/* Impact preview */}
          {isFirst && (
            <div className="mb-4">
              <p className="text-xs font-mono text-[var(--accent)] uppercase tracking-wider mb-2">Key Outcomes</p>
              <ul className="space-y-1">
                {project.impact.slice(0, 3).map((item, i) => (
                  <li key={i} className="text-sm text-[var(--muted)] flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
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
                className="px-2 py-1 text-xs font-mono rounded bg-[var(--accent)]/10 text-[var(--accent)]/80 group-hover:bg-[var(--accent)]/20 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Metric highlight */}
        {meta && (
          <div className={`shrink-0 p-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 text-center group-hover:border-[var(--accent)]/40 group-hover:bg-[var(--accent)]/10 transition-colors ${
            isFirst ? 'lg:w-40 lg:self-start mt-4 lg:mt-0' : 'w-full mt-4'
          }`}>
            <div className={`font-bold text-[var(--accent)] mb-1 font-mono ${isFirst ? 'text-4xl' : 'text-2xl'}`}>
              {meta.metric.value}
            </div>
            <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-wider">
              {meta.metric.label}
            </div>
          </div>
        )}
      </div>

      {/* Read more indicator */}
      <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between">
        <span className="text-sm text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
          Read full case study
        </span>
        <svg
          className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:translate-x-1 transition-all"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </div>

      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent"
          style={{ animation: 'scan-down 2s linear infinite' }}
        />
      </div>
    </Link>
  );
}

export default function WorkPage() {
  return (
    <div className="py-16 md:py-24 relative overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <p className="text-xs font-mono text-[var(--accent)] uppercase tracking-widest">
                Case Studies
              </p>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            Problems solved. Systems shipped.
          </h1>
          <p className="text-xl text-[var(--muted)] max-w-2xl">
            Real projects with real constraints. Each one pushed boundaries—and delivered results.
          </p>
        </div>

        {/* Stats bar */}
        <div className="mb-12 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 flex flex-wrap justify-center gap-8 md:gap-16">
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent)]">{caseStudies.length}</div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Projects</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent)]">100%</div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">In Production</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent)]">0</div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Left Unfinished</div>
          </div>
        </div>

        {/* Projects */}
        <div className="space-y-6">
          {caseStudies.map((project, index) => (
            <ProjectCard key={project.slug} project={project} index={index} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center p-8 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5">
          <h2 className="text-2xl font-bold mb-4">Got a project that needs this treatment?</h2>
          <p className="text-[var(--muted)] mb-6 max-w-lg mx-auto">
            Whether it&apos;s a legacy rescue, an AI agent, or something entirely new—I&apos;m always interested in hard problems.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent)] text-white font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            <span>Let&apos;s Talk</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
