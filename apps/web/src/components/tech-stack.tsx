import Link from 'next/link';

const techCategories = [
  {
    name: 'AI & Automation',
    techs: ['Claude Code', 'Claude Agent SDK', 'AI-Native Dev'],
  },
  {
    name: 'Frontend',
    techs: ['React', 'Next.js', 'TypeScript', 'Tailwind'],
  },
  {
    name: 'Backend',
    techs: ['Node.js', 'NestJS', 'Bun', 'Elysia', 'PostgreSQL'],
  },
  {
    name: 'Cloud & DevOps',
    techs: ['Azure', 'AWS', 'Terraform', 'Docker', 'GitHub Actions'],
  },
];

export function TechStack() {
  return (
    <section className="py-16 border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider">
            Tech Stack
          </h2>
          <Link
            href="/skills"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all skills →
          </Link>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {techCategories.map((category) => (
            <div key={category.name}>
              <h3 className="text-sm font-medium mb-3">{category.name}</h3>
              <div className="flex flex-wrap gap-2">
                {category.techs.map((tech) => (
                  <span
                    key={tech}
                    className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors cursor-default"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
