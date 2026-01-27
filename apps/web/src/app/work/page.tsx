import type { Metadata } from 'next';
import Link from 'next/link';
import { caseStudies } from '@/data/case-studies';

export const metadata: Metadata = {
  title: 'Work | Milos Cvetkovic',
  description:
    'Case studies and projects showcasing AI innovation, legacy modernization, and full-stack development.',
};

export default function WorkPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Things I&apos;ve Built</h1>
        <p className="text-xl text-[var(--muted)] mb-12 max-w-2xl">
          Real projects, real constraints, real results. Here&apos;s what happens
          when you point me at a hard problem.
        </p>

        <div className="grid gap-8">
          {caseStudies.map((project) => (
            <Link
              key={project.slug}
              href={`/work/${project.slug}`}
              className="group block p-8 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--card-hover)] hover:border-[var(--accent)]/50 transition-all"
            >
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-2xl font-semibold mb-3 group-hover:text-[var(--accent)] transition-colors">
                    {project.title}
                  </h2>
                  <p className="text-[var(--muted)] text-lg mb-4">
                    {project.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-sm font-medium rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-sm text-[var(--accent)] mt-2 group-hover:underline">
                  View case study →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
