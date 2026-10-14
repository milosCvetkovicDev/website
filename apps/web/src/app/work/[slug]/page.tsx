import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BreadcrumbListJsonLd, TechArticleJsonLd, WebPageJsonLd } from '@/components/json-ld';
import { DataTable } from '@/components/data-table';
import {
  adjacentCaseStudies,
  caseStudies,
  caseStudyMetricScope,
  caseStudyPageTitle,
  formatMetric,
  getCaseStudy,
  techStackTable,
} from '@/data/case-studies';
import { social } from '@/data/social';
import { formatContentDates } from '@/lib/content-date';
import { buildMetadata } from '@/lib/metadata';
import { cardAlt } from '@/lib/og-image';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// `case-studies.ts` enumerates every slug, so generateStaticParams below is exhaustive and an
// unknown slug can only be a bad URL. Refusing dynamic params turns that into a routing-level 404,
// the same one `/no-such-page` gets, instead of a render-time notFound(). That matters beyond
// tidiness: notFound() throws, React error boundaries do not run during SSR, so the throw unwinds
// past the root layout and Next serves its bare `<html id="__next_error__">` recovery shell. The
// layout's <head> — the theme init script included — never reaches the HTML, leaving the client to
// re-create it. See docs/adr/0015-static-case-study-params.md.
export const dynamicParams = false;

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

  return buildMetadata({
    title: caseStudyPageTitle(caseStudy),
    description: caseStudy.description,
    path: `/work/${caseStudy.slug}`,
    type: 'article',
    image: {
      url: `/work/${caseStudy.slug}/og-image.png`,
      alt: cardAlt(`Case study: ${caseStudy.title}`),
    },
  });
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const caseStudy = getCaseStudy(slug);

  if (!caseStudy) {
    notFound();
  }

  // The two fields the TechArticle's datePublished and dateModified read (and the sitemap's lastmod,
  // updatedAt), so the visible dates and the marked-up ones cannot disagree. A date that does not
  // format, or a pair updated before it was published, throws here and fails the prerender: the
  // page never ships the markup's dates without the visible ones.
  const { published, updated } = formatContentDates(
    `/work/${caseStudy.slug}`,
    caseStudy.publishedAt,
    caseStudy.updatedAt,
  );
  const { metric } = caseStudy.highlight;
  // What the figure counted, then, once the owner has defined it, when and how it was measured:
  // one sentence from one producer, which the twin's Basis line writes too (#58). A study with no
  // basis to state throws here, as its twin does, and fails the prerender.
  const scope = caseStudyMetricScope(caseStudy);

  return (
    <div className="py-16 md:py-24">
      <WebPageJsonLd
        path={`/work/${caseStudy.slug}`}
        name={caseStudyPageTitle(caseStudy)}
        breadcrumb
      />
      <TechArticleJsonLd caseStudy={caseStudy} />
      <BreadcrumbListJsonLd caseStudy={caseStudy} />
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
          <dl className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-[var(--muted)]">Published</dt>
              <dd>
                <time dateTime={caseStudy.publishedAt}>{published}</time>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--muted)]">Updated</dt>
              <dd>
                <time dateTime={caseStudy.updatedAt}>{updated}</time>
              </dd>
            </div>
          </dl>
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

        {/* The headline figure the study's cards on / and /work advertise, printed as they print it,
            with its scope: the basis that says what it counted (#49), and the window and method
            once the owner has defined them (#58). A named region rather than a heading:
            landmark navigation reaches it, and markdown-twins.spec.ts, which requires every h2 and
            h3 in main to be a section of the twin, is not asked to find one. */}
        <section
          aria-label="Headline result"
          className="mb-12 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-6"
        >
          <p>
            <span className="block font-mono text-4xl font-bold text-[var(--accent-text)]">
              {formatMetric(metric)}
            </span>{' '}
            <span className="mt-1 block font-mono text-xs tracking-wider text-[var(--muted)] uppercase">
              {metric.label}
            </span>
          </p>
          <p className="mt-4 leading-relaxed text-[var(--muted)]">{scope}</p>
        </section>

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

        {caseStudy.howItWorks ? (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
              How It Works
            </h2>
            <ol className="list-decimal space-y-3 pl-6 text-lg marker:font-mono marker:text-[var(--accent-text)]">
              {caseStudy.howItWorks.map((step) => (
                <li key={step} className="pl-1">
                  {step}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

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

        {caseStudy.lessons ? (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
              Lessons
            </h2>
            <ul className="space-y-3">
              {caseStudy.lessons.map((lesson) => (
                <li key={lesson} className="border-l-2 border-[var(--accent)] pl-4 text-lg">
                  {lesson}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Tech Stack, as a table (#58) */}
        <section className="mb-12">
          <h2 className="mb-6 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
            Tech Stack
          </h2>
          <DataTable {...techStackTable(caseStudy)} />
          <p className="mt-6 text-sm">
            <Link href="/skills" className="text-[var(--accent-text)] hover:underline">
              All my skills, and the experience behind each one
            </Link>
          </p>
        </section>

        {/* More work: the studies either side of this one, so each page links on to the others */}
        <nav aria-labelledby="more-work" className="mb-12">
          <h2
            id="more-work"
            className="mb-6 text-sm font-medium tracking-wider text-[var(--muted)] uppercase"
          >
            More work
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {adjacentCaseStudies(caseStudy.slug).map(({ direction, study }) => (
              <li
                key={study.slug}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
              >
                <p className="mb-2 font-mono text-xs tracking-wider text-[var(--muted)] uppercase">
                  {direction === 'previous' ? 'Previous case study' : 'Next case study'}
                </p>
                <Link
                  href={`/work/${study.slug}`}
                  className="text-lg font-semibold transition-colors hover:text-[var(--accent-text)] hover:underline"
                >
                  {study.title}
                </Link>
                <p className="mt-2 text-sm text-[var(--muted)]">{study.description}</p>
              </li>
            ))}
          </ul>
        </nav>

        {/* CTA */}
        <section className="border-t border-[var(--border)] pt-8">
          <p className="mb-4 text-[var(--muted)]">
            Want to see more projects like this? Connect with me on social media.
          </p>
          <a
            href={social.linkedin.href}
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
