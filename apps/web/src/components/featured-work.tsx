import Link from 'next/link';

const featuredProjects = [
  {
    slug: 'self-healing-agent',
    title: 'Self-Healing Agent',
    description:
      'AI-powered system that monitors production errors and autonomously proposes fixes via pull requests.',
    tags: ['Claude Agent SDK', 'Bun', 'Elysia', 'Azure'],
  },
  {
    slug: 'enterprise-b2b-platform',
    title: 'Enterprise B2B Platform',
    description:
      'Full-stack modernization of a legacy platform using Clean Architecture and DDD principles.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'Terraform'],
  },
  {
    slug: 'nx-remote-cache',
    title: 'Nx Remote Cache Server',
    description:
      'High-performance build cache server dramatically reducing CI/CD build times.',
    tags: ['Bun', 'Elysia', 'Azure Blob Storage'],
  },
];

export function FeaturedWork() {
  return (
    <section className="py-16 border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider">
            Featured Work
          </h2>
          <Link
            href="/work"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="grid gap-6">
          {featuredProjects.map((project) => (
            <Link
              key={project.slug}
              href={`/work/${project.slug}`}
              className="group block p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--card-hover)] hover:border-[var(--accent)]/50 transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-[var(--accent)] transition-colors">
                    {project.title}
                  </h3>
                  <p className="text-[var(--muted)] mb-4 md:mb-0">
                    {project.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs font-medium rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
