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
    description:
      'High-performance build cache server dramatically reducing CI/CD build times.',
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

// Project card with HUD styling
function ProjectCard({ project, index }: { project: typeof featuredProjects[0]; index: number }) {
  return (
    <Link
      href={`/work/${project.slug}`}
      className="group relative block p-6 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm hover:bg-[var(--accent)]/5 hover:border-[var(--accent)]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]"
    >
      <CornerBrackets />

      {/* Top row: Number, Category, Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-bold text-[var(--accent)]/30 group-hover:text-[var(--accent)]/60 transition-colors">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider text-[var(--muted)] border border-[var(--border)] rounded group-hover:border-[var(--accent)]/30 group-hover:text-[var(--accent)] transition-colors">
            {project.category}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-mono text-green-500/80">{project.status}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        {/* Title & Description */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold mb-2 group-hover:text-[var(--accent)] transition-colors flex items-center gap-2">
            {project.title}
            <svg
              className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </h3>
          <p className="text-[var(--muted)] text-sm leading-relaxed mb-4">
            {project.description}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
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
        <div className="lg:w-36 shrink-0 p-4 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 text-center group-hover:border-[var(--accent)]/40 group-hover:bg-[var(--accent)]/10 transition-colors">
          <div className="text-3xl font-bold text-[var(--accent)] mb-1 font-mono">
            {project.metric.value}
          </div>
          <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-wider">
            {project.metric.label}
          </div>
        </div>
      </div>

      {/* Scan line effect on hover */}
      <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
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
    <section className="py-20 relative overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* Section header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <h2 className="text-xs font-mono text-[var(--accent)] uppercase tracking-widest">
                Featured Work
              </h2>
            </div>
            <div className="h-px w-16 bg-gradient-to-r from-[var(--accent)]/50 to-transparent" />
          </div>
          <Link
            href="/work"
            className="group flex items-center gap-2 text-xs font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
          >
            <span>VIEW ARCHIVE</span>
            <svg
              className="w-4 h-4 group-hover:translate-x-1 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
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
          <p className="text-sm text-[var(--muted)] mb-4 font-mono">
            Want to see the full breakdown?
          </p>
          <Link
            href="/work"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-[var(--accent)]/50 text-[var(--accent)] font-mono text-sm hover:bg-[var(--accent)]/10 hover:border-[var(--accent)] transition-all"
          >
            <span>Explore All Projects</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
