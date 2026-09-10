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
    <section className="border-t border-[var(--border)] py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            Tech Stack
          </h2>
          <Link href="/skills" className="text-sm text-[var(--accent-text)] hover:underline">
            View all skills →
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {techCategories.map((category) => (
            <div key={category.name}>
              <h3 className="mb-3 text-sm font-medium">{category.name}</h3>
              <div className="flex flex-wrap gap-2">
                {category.techs.map((tech) => (
                  <span
                    key={tech}
                    className="cursor-default rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--accent)]/50"
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
