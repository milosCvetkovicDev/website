import {
  aboutCopy,
  aboutRecord,
  beliefs,
  credentials,
  facts,
  timeline,
  type StoryParagraph,
} from '@/data/pages/about';
import { buildMetadata } from '@/lib/metadata';

export const metadata = buildMetadata({
  title: aboutRecord.title,
  socialTitle: aboutCopy.socialTitle,
  description: aboutRecord.summary,
  path: aboutRecord.path,
});

/** A story paragraph's runs, with the emphasis the record marks. */
function StoryText({ paragraph }: { paragraph: StoryParagraph }) {
  if (typeof paragraph === 'string') return paragraph;
  return paragraph.map((run) => {
    if (typeof run === 'string') return run;
    return run.emphasis === 'strong' ? (
      <strong key={run.text}>{run.text}</strong>
    ) : (
      <em key={run.text}>{run.text}</em>
    );
  });
}

export default function AboutPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {/* Hook */}
        <div className="mb-16">
          <p className="mb-4 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {aboutCopy.eyebrow}
          </p>
          <h1 className="mb-6 text-3xl leading-tight font-bold md:text-4xl lg:text-5xl">
            I fix the systems everyone else gave up on.
          </h1>
          <p className="text-xl leading-relaxed text-[var(--muted)]">{aboutCopy.lede}</p>
        </div>

        {/* The story */}
        <section className="mb-20">
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
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

        {/* Quick facts */}
        <section className="mb-20">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-center"
              >
                <div className="mb-1 text-2xl font-bold text-[var(--accent-text)]">
                  {fact.value}
                </div>
                <div className="text-xs tracking-wider text-[var(--muted)] uppercase">
                  {fact.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Timeline with story */}
        <section className="mb-20">
          <h2 className="mb-8 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {aboutCopy.timelineHeading}
          </h2>
          <div className="space-y-12">
            {timeline.map((item) => (
              <div key={item.year} className="relative">
                {/* Year badge */}
                <div className="mb-3 flex items-center gap-4">
                  <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 font-mono text-sm font-bold text-[var(--accent-text)]">
                    {item.year}
                  </span>
                  <span className="text-sm text-[var(--muted)]">{item.company}</span>
                </div>

                {/* Content */}
                <div className="border-l-0 border-[var(--border)] pl-0 md:border-l-2 md:pl-4">
                  <h3 className="mb-2 text-xl font-semibold">{item.role}</h3>
                  <p className="mb-3 text-sm font-medium text-[var(--accent-text)] italic">
                    &quot;{item.highlight}&quot;
                  </p>
                  <p className="leading-relaxed text-[var(--muted)]">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
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
                  <span className="text-2xl">{belief.icon}</span>
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
                <span className="text-sm">{`${credential.icon} ${credential.text}`}</span>
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
      </div>
    </div>
  );
}
