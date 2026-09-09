import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { caseStudies, getCaseStudy } from '@/data/case-studies';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return caseStudies.map((cs) => ({
    slug: cs.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const caseStudy = getCaseStudy(slug);

  if (!caseStudy) {
    return { title: 'Not Found' };
  }

  return {
    title: caseStudy.title,
    description: caseStudy.description,
    openGraph: {
      title: `${caseStudy.title} | Case Study`,
      description: caseStudy.description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: caseStudy.title,
      description: caseStudy.description,
    },
  };
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const caseStudy = getCaseStudy(slug);

  if (!caseStudy) {
    notFound();
  }

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {/* Back link */}
        <Link
          href="/work"
          className="mb-8 flex w-fit items-center gap-2 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to Work
        </Link>

        {/* Header */}
        <header className="mb-12">
          <p className="mb-4 text-sm font-medium tracking-wider text-[var(--accent-text)] uppercase">
            Case Study
          </p>
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">{caseStudy.title}</h1>
          <p className="mb-6 text-xl text-[var(--muted)]">{caseStudy.description}</p>
          <div className="flex flex-wrap gap-2">
            {caseStudy.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-sm font-medium text-[var(--accent-text)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        {/* The Challenge */}
        <section className="mb-12">
          <h2 className="mb-4 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            The Challenge
          </h2>
          <p className="text-lg leading-relaxed">{caseStudy.challenge}</p>
        </section>

        {/* My Approach */}
        <section className="mb-12">
          <h2 className="mb-4 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            My Approach
          </h2>
          <p className="text-lg leading-relaxed">{caseStudy.approach}</p>
        </section>

        {/* Key Contributions */}
        <section className="mb-12">
          <h2 className="mb-4 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            Key Contributions
          </h2>
          <ul className="space-y-3">
            {caseStudy.contributions.map((contribution, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-1.5 text-[var(--accent-text)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="text-lg">{contribution}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Impact */}
        <section className="mb-12">
          <h2 className="mb-4 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            Impact
          </h2>
          <ul className="space-y-3">
            {caseStudy.impact.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-1.5 text-[var(--status-ok)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </span>
                <span className="text-lg">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Tech Stack */}
        <section className="mb-12">
          <h2 className="mb-6 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            Tech Stack
          </h2>
          <div className="grid gap-4">
            {caseStudy.techStack.map((category) => (
              <div
                key={category.category}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <h3 className="mb-3 text-sm font-medium text-[var(--muted)]">
                  {category.category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {category.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-sm"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[var(--border)] pt-8">
          <p className="mb-4 text-[var(--muted)]">
            Want to see more projects like this? Connect with me on social media.
          </p>
          <a
            href="https://www.linkedin.com/in/milos-cvetkovic-dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Connect on LinkedIn
          </a>
        </section>
      </div>
    </div>
  );
}
