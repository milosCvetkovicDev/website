import {
  aboutCopy,
  aboutRecord,
  beliefs,
  credentials,
  factsTable,
  questions,
  timelineTable,
  type StoryParagraph,
} from '@/data/pages/about';
import { ProfilePageJsonLd } from '@/components/json-ld';
import { DataTable } from '@/components/data-table';
import { buildMetadata } from '@/lib/metadata';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

export const metadata = buildMetadata({
  title: aboutRecord.title,
  socialTitle: aboutCopy.socialTitle,
  description: aboutRecord.summary,
  path: aboutRecord.path,
});

/**
 * A story paragraph's runs, with the emphasis the record marks. A run is keyed by its place: two
 * runs of one paragraph may carry the same text, and the list never reorders.
 */
function StoryText({ paragraph }: { paragraph: StoryParagraph }) {
  if (typeof paragraph === 'string') return paragraph;
  return paragraph.map((run, index) => {
    if (typeof run === 'string') return run;
    switch (run.emphasis) {
      case 'strong':
        return <strong key={index}>{run.text}</strong>;
      case 'em':
        return <em key={index}>{run.text}</em>;
      default:
        throw new Error(`StoryText: unknown emphasis ${String(run.emphasis satisfies never)}`);
    }
  });
}

export default function AboutPage() {
  // One date for the visible line and the ProfilePage's dateModified, which may not assert a date the
  // page does not show; it is also the sitemap's lastmod for /about.
  const updated = STATIC_ROUTE_UPDATED['/about'];
  return (
    <div className="py-16 md:py-24">
      <ProfilePageJsonLd path={aboutRecord.path} dateModified={updated} />
      <div className="mx-auto max-w-3xl px-6">
        {/* Hook */}
        <div className="mb-16">
          <p className="mb-4 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {aboutCopy.eyebrow}
          </p>
          {/* The h1 names the person and the subject; the hook under it stays the largest line
              (#58). */}
          <h1 className="mb-3 text-lg leading-snug font-semibold text-balance md:text-xl">
            {aboutRecord.heading}
          </h1>
          <p className="mb-6 text-3xl leading-tight font-bold md:text-4xl lg:text-5xl">
            I fix the systems everyone else gave up on.
          </p>
          <p className="text-xl leading-relaxed text-[var(--muted)]">{aboutCopy.lede}</p>
        </div>

        {/* The story */}
        <section className="mb-20">
          <div className="space-y-6">
            {aboutCopy.story.map((paragraph, index) => (
              <p key={index} className="text-lg leading-relaxed">
                <StoryText paragraph={paragraph} />
              </p>
            ))}
            <p className="text-lg leading-relaxed text-[var(--foreground)]">
              {aboutCopy.storyClose}
            </p>
          </div>
        </section>

        {/* Questions a visitor asks: each heading's next element is its whole answer (#58) */}
        <section className="mb-20 space-y-12">
          {questions.map(({ question, answer }) => (
            <div key={question}>
              <h2 className="mb-4 text-2xl font-bold">{question}</h2>
              <p className="text-lg leading-relaxed">{answer}</p>
            </div>
          ))}
        </section>

        {/* Quick facts. The heading is for screen readers: without it the table would sit under the
            last question in the heading outline (#58). */}
        <section className="mb-20">
          <h2 className="sr-only">{aboutCopy.factsHeading}</h2>
          <DataTable {...factsTable} />
        </section>

        {/* Timeline with story, as a table (#58): on a phone each entry stacks into a block. */}
        <section className="mb-20">
          <h2 className="mb-8 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {aboutCopy.timelineHeading}
          </h2>
          <DataTable {...timelineTable} />
        </section>

        {/* Beliefs */}
        <section className="mb-20">
          <h2 className="mb-8 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {aboutCopy.beliefsHeading}
          </h2>
          <div className="space-y-6">
            {beliefs.map((belief) => (
              <div
                key={belief.title}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 transition-colors hover:border-[var(--accent)]/50"
              >
                <div className="flex items-start gap-4">
                  {/* Decoration: the title beside it says what it means, so it is not read out. */}
                  <span aria-hidden="true" className="text-2xl">
                    {belief.icon}
                  </span>
                  <div>
                    <h3 className="mb-2 font-semibold">{belief.title}</h3>
                    <p className="leading-relaxed text-[var(--muted)]">{belief.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Credentials (compact) */}
        <section className="mb-20">
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {aboutCopy.credentialsHeading}
          </h2>
          <div className="flex flex-wrap gap-4">
            {credentials.map((credential) => (
              <div
                key={credential.text}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2"
              >
                {/* The icon in a span of its own, hidden from screen readers; the text still reads. */}
                <span className="text-sm">
                  <span aria-hidden="true">{credential.icon}</span> {credential.text}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-6 py-12 text-center">
          <h2 className="mb-4 text-2xl font-bold">{aboutCopy.connect.heading}</h2>
          <p className="mx-auto mb-6 max-w-lg text-[var(--muted)]">{aboutCopy.connect.text}</p>
          <div className="flex flex-wrap justify-center gap-4">
            {aboutCopy.connect.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  link.primary
                    ? 'inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]'
                    : 'inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent)]/10'
                }
              >
                <span>{link.name}</span>
                {link.primary && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                )}
              </a>
            ))}
          </div>
        </section>

        {/* The line stays in the page with its date, as on /privacy. */}
        <p className="mt-12 text-sm text-[var(--muted)]">
          Last updated <time dateTime={updated}>{updated}</time>.
        </p>
      </div>
    </div>
  );
}
