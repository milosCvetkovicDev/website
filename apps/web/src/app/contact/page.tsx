import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Ready to fix that legacy system or build something new? Get in touch. I typically respond within 24 hours.',
  openGraph: {
    title: 'Start a Conversation | Milos Cvetkovic',
    description: 'Legacy rescue, AI agents, or greenfield builds. Let\'s talk about your project.',
  },
};

const projectTypes = [
  {
    type: 'Legacy Rescue',
    description: 'Have a codebase everyone\'s afraid to touch? I specialize in untangling the untangle-able.',
    icon: '🔧',
    ideal: 'Systems that "work" but nobody understands why',
  },
  {
    type: 'AI Integration',
    description: 'Want AI that actually works in production? Not demos—real systems with real guardrails.',
    icon: '🤖',
    ideal: 'Teams ready to ship AI-powered features',
  },
  {
    type: 'Greenfield Build',
    description: 'Starting fresh? I\'ll help you build it right the first time so you don\'t need me to rescue it later.',
    icon: '🏗️',
    ideal: 'New products that need solid foundations',
  },
  {
    type: 'Technical Leadership',
    description: 'Need senior firepower on your team? Fractional CTO, tech lead, or architecture consulting.',
    icon: '🎯',
    ideal: 'Growing teams that need direction',
  },
];

const faqs = [
  {
    q: 'What\'s your typical response time?',
    a: 'I respond to all serious inquiries within 24 hours. Usually much faster.',
  },
  {
    q: 'Do you sign NDAs?',
    a: 'Absolutely. I\'m happy to sign your NDA before we discuss specifics. Confidentiality is standard.',
  },
  {
    q: 'What if I\'m not sure I can afford you?',
    a: 'Let\'s talk anyway. I work with budgets of all sizes and can often find a structure that works. The conversation is free.',
  },
  {
    q: 'Are you available for full-time roles?',
    a: 'Selectively, yes. For the right problem and the right team, I\'m open to full-time or long-term engagements.',
  },
];

export default function ContactPage() {
  const email = 'hello@miloscvetkovic.dev';

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {/* Availability banner - urgency */}
        <div className="mb-8 p-4 rounded-lg border border-green-500/30 bg-green-500/10 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-sm">
            <span className="font-semibold text-green-400">Available for new projects</span>
            <span className="text-[var(--muted)]"> · Taking on 1-2 engagements this quarter</span>
          </p>
        </div>

        {/* Header */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
          Let&apos;s build something that works.
        </h1>
        <p className="text-xl text-[var(--muted)] mb-12">
          Whether it&apos;s rescuing a legacy system, integrating AI, or building from scratch—I&apos;m
          here for the hard problems.
        </p>

        {/* Primary CTA - Email */}
        <section className="mb-16">
          <div className="p-8 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 text-center">
            <h2 className="text-lg font-semibold mb-2">The fastest way to reach me</h2>
            <p className="text-[var(--muted)] mb-6">
              Tell me about your project. I read every email personally.
            </p>
            <a
              href={`mailto:${email}?subject=Project%20Inquiry&body=Hi%20Milos%2C%0A%0AI%27m%20reaching%20out%20about...`}
              className="inline-flex items-center gap-3 px-8 py-4 bg-[var(--accent)] text-white font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-colors text-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>{email}</span>
            </a>
            <p className="text-sm text-[var(--muted)] mt-4">
              ⚡ Average response time: under 24 hours
            </p>
          </div>
        </section>

        {/* What I can help with - qualification */}
        <section className="mb-16">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            What I can help with
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {projectTypes.map((project) => (
              <div
                key={project.type}
                className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{project.icon}</span>
                  <h3 className="font-semibold">{project.type}</h3>
                </div>
                <p className="text-sm text-[var(--muted)] mb-3">{project.description}</p>
                <p className="text-xs text-[var(--accent)]">
                  Ideal for: {project.ideal}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Process - set expectations */}
        <section className="mb-16">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            What happens next
          </h2>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-sm font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">You reach out</h3>
                <p className="text-sm text-[var(--muted)]">
                  Send me a quick email about your project. Doesn&apos;t need to be formal—just tell me what&apos;s on your mind.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">We have a conversation</h3>
                <p className="text-sm text-[var(--muted)]">
                  A 30-minute call to understand your situation, challenges, and goals. No pitch—just listening.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">I send you a proposal</h3>
                <p className="text-sm text-[var(--muted)]">
                  If there&apos;s a fit, you&apos;ll get a clear proposal with scope, timeline, and pricing. No surprises.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ - objection handling */}
        <section className="mb-16">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            Common questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
                <h3 className="font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-[var(--muted)]">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Alternative contact - social proof */}
        <section className="mb-16">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            Or connect on social
          </h2>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://www.linkedin.com/in/milos-cvetkovic-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <span className="text-sm font-medium">LinkedIn</span>
            </a>
            <a
              href="https://github.com/milosCvetkovicDev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="text-sm font-medium">GitHub</span>
            </a>
            <a
              href="https://x.com/milos_dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm font-medium">Twitter / X</span>
            </a>
          </div>
        </section>

        {/* Final CTA - repeat */}
        <section className="text-center p-8 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <p className="text-lg mb-4">
            Still not sure? That&apos;s okay.
          </p>
          <p className="text-[var(--muted)] mb-6">
            Even if you&apos;re just exploring options, I&apos;m happy to have a quick chat.
            No sales pitch, no pressure—just an honest conversation about what you&apos;re building.
          </p>
          <a
            href={`mailto:${email}?subject=Quick%20Question`}
            className="inline-flex items-center gap-2 px-6 py-3 border border-[var(--accent)] text-[var(--accent)] font-semibold rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
          >
            <span>Send a Quick Message</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </section>
      </div>
    </div>
  );
}
