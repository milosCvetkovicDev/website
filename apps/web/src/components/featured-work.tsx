import Link from 'next/link';

const featuredProjects = [
  {
    slug: 'self-healing-agent',
    title: 'Self-Healing Agent',
    description:
      'AI-powered system that monitors production errors and autonomously proposes fixes via pull requests.',
    tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
    metric: { value: '73%', label: 'faster resolution' },
    status: 'LIVE',
    category: 'AI AGENT',
  },
  {
    slug: 'enterprise-b2b-platform',
    title: 'Enterprise B2B Platform',
    description:
      'Full-stack modernization of a legacy platform using Clean Architecture and DDD principles.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'Terraform'],
    metric: { value: '40%', label: 'less complexity' },
    status: 'PRODUCTION',
    category: 'PLATFORM',
  },
  {
    slug: 'nx-remote-cache',
    title: 'Nx Remote Cache Server',
    description: 'High-performance build cache server dramatically reducing CI/CD build times.',
    tags: ['Bun', 'Elysia', 'Azure Blob Storage'],
    metric: { value: '5x', label: 'faster builds' },
    status: 'PRODUCTION',
    category: 'DEVOPS',
  },
];

// Corner brackets for HUD aesthetic
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

// Project card with HUD styling
function ProjectCard({ project, index }: { project: (typeof featuredProjects)[0]; index: number }) {
  return (
    <Link
      href={`/work/${project.slug}`}
      className="group relative block rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]"
    >
      <CornerBrackets />

      {/* Top row: Number, Category, Status */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-bold text-[var(--accent)]/30 transition-colors group-hover:text-[var(--accent)]/60">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] tracking-wider text-[var(--muted)] transition-colors group-hover:border-[var(--accent)]/30 group-hover:text-[var(--accent)]">
            {project.category}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          <span className="font-mono text-[10px] text-green-500/80">{project.status}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Title & Description */}
        <div className="min-w-0 flex-1">
          <h3 className="mb-2 flex items-center gap-2 text-xl font-semibold transition-colors group-hover:text-[var(--accent)]">
            {project.title}
            <svg
              className="h-4 w-4 -translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
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
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">{project.description}</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent)]/80 transition-colors group-hover:bg-[var(--accent)]/20"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Metric highlight */}
        <div className="shrink-0 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 text-center transition-colors group-hover:border-[var(--accent)]/40 group-hover:bg-[var(--accent)]/10 lg:w-36">
          <div className="mb-1 font-mono text-3xl font-bold text-[var(--accent)]">
            {project.metric.value}
          </div>
          <div className="font-mono text-[10px] tracking-wider text-[var(--muted)] uppercase">
            {project.metric.label}
          </div>
        </div>
      </div>

      {/* Scan line effect on hover */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg opacity-0 transition-opacity group-hover:opacity-100">
        <div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent"
          style={{
            animation: 'scan-down 2s linear infinite',
            top: '0%',
          }}
        />
      </div>
    </Link>
  );
}

export function FeaturedWork() {
  return (
    <section className="relative overflow-hidden py-20">
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
        {/* Section header */}
        <div className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              <h2 className="font-mono text-xs tracking-widest text-[var(--accent)] uppercase">
                Featured Work
              </h2>
            </div>
            <div className="h-px w-16 bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
          </div>
          <Link
            href="/work"
            className="group flex items-center gap-2 font-mono text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
          >
            <span>VIEW ARCHIVE</span>
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
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
          </Link>
        </div>

        {/* Projects grid */}
        <div className="grid gap-6">
          {featuredProjects.map((project, index) => (
            <ProjectCard key={project.slug} project={project} index={index} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="mb-4 font-mono text-sm text-[var(--muted)]">
            Want to see the full breakdown?
          </p>
          <Link
            href="/work"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/50 px-6 py-3 font-mono text-sm text-[var(--accent)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
          >
            <span>Explore All Projects</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
