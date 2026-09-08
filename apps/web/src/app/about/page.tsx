import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'I fix the systems everyone else gave up on. 10+ years rescuing legacy codebases, now building AI agents that fix their own bugs. Based in Belgrade, working globally.',
  openGraph: {
    title: 'About Milos Cvetkovic',
    description: 'I fix the systems everyone else gave up on.',
  },
};

const timeline = [
  {
    year: '2025',
    role: 'AI-Native Engineer',
    company: 'Independent',
    highlight: 'Built an AI agent that fixes production bugs while I sleep',
    description:
      'Combining a decade of battle scars with cutting-edge AI. My self-healing agent has resolved 73% of production errors autonomously—no human intervention, no 3am pages.',
  },
  {
    year: '2021',
    role: 'JavaScript Tech Lead',
    company: 'Enterprise SaaS',
    highlight: '40% reduction in bug reports after architecture overhaul',
    description:
      'Inherited a codebase where "temporary fixes" had calcified into permanent nightmares. Introduced Clean Architecture. Watched bug reports drop. Trained the next generation of leads.',
  },
  {
    year: '2016',
    role: 'Full-Stack Developer → Tech Lead',
    company: 'Various',
    highlight: 'First microservices migration, first cloud deployment, first gray hairs',
    description:
      'The years that taught me everything breaks eventually—and how to build systems that break gracefully. Migrated monoliths to microservices. Learned why "it works on my machine" is a confession, not an excuse.',
  },
  {
    year: '2013',
    role: 'Frontend Developer',
    company: 'Startup',
    highlight: 'Survived jQuery spaghetti and the AngularJS-to-Angular migration',
    description:
      "Where the obsession began. Discovered that my favorite problems are the ones everyone says can't be solved. Still true.",
  },
];

const beliefs = [
  {
    title: 'Shipping beats perfection',
    description:
      'A working feature today beats a perfect feature next quarter. I\'ve seen too many "almost done" projects die in committee. Ship it, measure it, improve it.',
    icon: '🚀',
  },
  {
    title: 'Automation is self-respect',
    description:
      "If I'm doing the same task twice, I'm building a tool. Life is too short for manual deployments and copy-paste workflows. Robots should do robot work.",
    icon: '🤖',
  },
  {
    title: 'Clarity over cleverness',
    description:
      "The cleverest code I've ever written was also the most expensive to maintain. Now I write code for the tired developer at 2am who just needs to understand what's happening.",
    icon: '💡',
  },
];

const facts = [
  { label: 'Years shipping code', value: '10+' },
  { label: 'Production systems rescued', value: '12' },
  { label: 'Teams led', value: '4' },
  { label: 'Morning coffee required', value: '2 cups' },
];

export default function AboutPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {/* Hook */}
        <div className="mb-16">
          <p className="mb-4 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            The short version
          </p>
          <h1 className="mb-6 text-3xl leading-tight font-bold md:text-4xl lg:text-5xl">
            I fix the systems everyone else gave up on.
          </h1>
          <p className="text-xl leading-relaxed text-[var(--muted)]">
            Then I make them better than they were before the problems started.
          </p>
        </div>

        {/* The story */}
        <section className="mb-20">
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
            <p className="text-lg leading-relaxed">
              You know that codebase? The one with the &quot;temporary&quot; workaround from 2017
              that somehow became load-bearing? The one where three developers quit rather than
              touch the payment module? The one everyone says needs a &quot;complete rewrite&quot;
              but nobody has two years to spare?
            </p>
            <p className="text-lg leading-relaxed">
              <strong>That&apos;s my favorite kind of project.</strong>
            </p>
            <p className="text-lg leading-relaxed">
              I&apos;ve spent a decade inside systems like that. Not just surviving
              them—transforming them. Untangling dependencies. Introducing tests where there were
              none. Building architecture that makes the next change possible instead of terrifying.
            </p>
            <p className="text-lg leading-relaxed">
              But here&apos;s what changed: I got tired of being the only one who could fix things.
              So I started building AI that works the way I do. My self-healing agent monitors
              production 24/7, diagnoses errors, and opens PRs with fixes—
              <em>without waking anyone up</em>.
            </p>
            <p className="text-lg leading-relaxed text-[var(--foreground)]">
              It&apos;s not about replacing engineers. It&apos;s about giving them superpowers.
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
                <div className="mb-1 text-2xl font-bold text-[var(--accent)]">{fact.value}</div>
                <div className="text-xs tracking-wider text-[var(--muted)] uppercase">
                  {fact.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Timeline with story */}
        <section className="mb-20">
          <h2 className="mb-8 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            The longer version
          </h2>
          <div className="space-y-12">
            {timeline.map((item) => (
              <div key={item.year} className="relative">
                {/* Year badge */}
                <div className="mb-3 flex items-center gap-4">
                  <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 font-mono text-sm font-bold text-[var(--accent)]">
                    {item.year}
                  </span>
                  <span className="text-sm text-[var(--muted)]">{item.company}</span>
                </div>

                {/* Content */}
                <div className="border-l-0 border-[var(--border)] pl-0 md:border-l-2 md:pl-4">
                  <h3 className="mb-2 text-xl font-semibold">{item.role}</h3>
                  <p className="mb-3 text-sm font-medium text-[var(--accent)] italic">
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
          <h2 className="mb-8 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            What I believe
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
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            Credentials
          </h2>
          <div className="flex flex-wrap gap-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2">
              <span className="text-sm">🎓 Angular Certified Architect</span>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2">
              <span className="text-sm">📍 Belgrade, Serbia</span>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2">
              <span className="text-sm">🌍 Remote-first since 2020</span>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-6 py-12 text-center">
          <h2 className="mb-4 text-2xl font-bold">Let&apos;s connect</h2>
          <p className="mx-auto mb-6 max-w-lg text-[var(--muted)]">
            I share engineering insights, open-source work, and lessons learned from the trenches.
            Follow along or drop me a message.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://www.linkedin.com/in/milos-cvetkovic-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <span>LinkedIn</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </a>
            <a
              href="https://github.com/milosCvetkovicDev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
            >
              <span>GitHub</span>
            </a>
            <a
              href="https://x.com/milos_dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
            >
              <span>X / Twitter</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
