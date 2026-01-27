import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | Milos Cvetkovic',
  description:
    'Senior Full-Stack Engineer with 10+ years of experience turning legacy codebases into cloud-native solutions.',
};

const timeline = [
  {
    year: '2025 - Present',
    role: 'Senior Full-Stack Engineer',
    description:
      'Rescuing a legacy platform while building AI agents that fix production bugs autonomously. Yes, really.',
  },
  {
    year: '2021 - 2025',
    role: 'JavaScript Tech Lead',
    description:
      'Led teams shipping enterprise software. Introduced Clean Architecture that cut bug rates and sped up feature delivery.',
  },
  {
    year: '2016 - 2021',
    role: 'JavaScript Tech Lead',
    description:
      'Built microservices from scratch, migrated systems to the cloud, and learned that "it works on my machine" is never acceptable.',
  },
  {
    year: '2013 - 2016',
    role: 'Frontend Developer',
    description:
      'Where it all started. Wrote a lot of jQuery, survived AngularJS, and discovered I liked breaking complex problems into simple pieces.',
  },
];

const values = [
  {
    title: 'Ship, Then Iterate',
    description:
      'Perfect is the enemy of deployed. I ship working software fast, gather feedback, and improve. Waiting for perfect means waiting forever.',
  },
  {
    title: 'Automate the Boring Stuff',
    description:
      'Every manual task is a bug waiting to happen. I build systems that handle the repetitive work so humans can focus on hard problems.',
  },
  {
    title: 'Make It Understandable',
    description:
      'Clever code is a liability. I write code that the next developer (or future me) can understand, debug, and extend without a decoder ring.',
  },
];

export default function AboutPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {/* Header */}
        <h1 className="text-4xl md:text-5xl font-bold mb-6">About Me</h1>
        <p className="text-xl text-[var(--muted)] mb-12">
          The engineer you call when the codebase is on fire.
        </p>

        {/* Bio */}
        <section className="mb-16">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-4">
            The Short Version
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg leading-relaxed mb-4">
              I&apos;ve spent 10+ years fixing the systems nobody else wants to
              touch. Legacy monoliths, spaghetti code, &quot;temporary&quot; solutions
              from 2015—I&apos;ve seen it all and shipped production fixes for
              all of it.
            </p>
            <p className="text-lg leading-relaxed mb-4">
              Now I&apos;m pushing the boundaries of what&apos;s possible with AI.
              My self-healing agent monitors production errors 24/7 and opens
              PRs with fixes autonomously. It&apos;s not science fiction—it&apos;s
              running in production right now.
            </p>
            <p className="text-lg leading-relaxed">
              I care about code that works, teams that ship, and systems that
              don&apos;t page you at 3am. If that sounds like what you need,
              we should talk.
            </p>
          </div>
        </section>

        {/* Journey */}
        <section className="mb-16">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-8">
            My Journey
          </h2>
          <div className="space-y-8">
            {timeline.map((item, index) => (
              <div key={index} className="flex gap-6">
                <div className="flex-shrink-0 w-32">
                  <span className="text-sm font-medium text-[var(--accent)]">
                    {item.year}
                  </span>
                </div>
                <div className="flex-1 pb-8 border-l border-[var(--border)] pl-6 relative">
                  <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-[var(--accent)]" />
                  <h3 className="font-semibold mb-2">{item.role}</h3>
                  <p className="text-[var(--muted)]">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section className="mb-16">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-8">
            What Drives Me
          </h2>
          <div className="grid gap-6">
            {values.map((value) => (
              <div
                key={value.title}
                className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]"
              >
                <h3 className="font-semibold mb-2">{value.title}</h3>
                <p className="text-[var(--muted)]">{value.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Certifications */}
        <section>
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-8">
            Certifications
          </h2>
          <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="font-semibold mb-2">Angular Certified Architect</h3>
            <p className="text-[var(--muted)]">
              Program from angulararchitects.io, created by Manfred Steyer
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
