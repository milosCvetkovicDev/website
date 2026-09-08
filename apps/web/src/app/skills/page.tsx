import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Skills',
  description:
    'Full-stack TypeScript, AI agents, legacy rescue, cloud infrastructure. The tools I use to ship production systems.',
};

// Primary skills with depth indicators
const coreSkills = [
  {
    name: 'TypeScript',
    years: '8+',
    level: 95,
    context:
      "My language of choice. Type safety isn't optional when you're building systems that handle real money.",
  },
  {
    name: 'React / Next.js',
    years: '7+',
    level: 90,
    context: "From SPAs to server components. I've shipped React at every scale.",
  },
  {
    name: 'Node.js',
    years: '8+',
    level: 90,
    context: "APIs, microservices, CLI tools. If it runs JavaScript, I've probably built it.",
  },
  {
    name: 'AI/LLM Integration',
    years: '2+',
    level: 85,
    context:
      'Not just prompts—production AI with guardrails, cost controls, and real observability.',
  },
];

// Skill categories for the detailed grid
const skillCategories = [
  {
    name: 'AI & Agents',
    icon: '🤖',
    description: 'Building AI that actually works in production',
    skills: [
      'Claude Code',
      'Claude Agent SDK',
      'LLM Orchestration',
      'Prompt Engineering',
      'AI Guardrails',
    ],
  },
  {
    name: 'Frontend',
    icon: '🎨',
    description: 'Modern interfaces that users love',
    skills: ['React', 'Next.js', 'Angular', 'Tailwind CSS', 'Framer Motion', 'Accessibility'],
  },
  {
    name: 'Backend',
    icon: '⚙️',
    description: 'APIs and services that scale',
    skills: ['Node.js', 'NestJS', 'Express', 'Bun', 'Elysia', 'PostgreSQL', 'Redis'],
  },
  {
    name: 'Cloud & DevOps',
    icon: '☁️',
    description: "Infrastructure that doesn't page you at 3am",
    skills: ['Azure', 'AWS', 'Terraform', 'Docker', 'Kubernetes', 'GitHub Actions'],
  },
  {
    name: 'Architecture',
    icon: '🏗️',
    description: 'Patterns that survive contact with reality',
    skills: ['Clean Architecture', 'Domain-Driven Design', 'Microservices', 'Event-Driven', 'CQRS'],
  },
  {
    name: 'Testing & Quality',
    icon: '✅',
    description: 'Confidence to deploy on Friday',
    skills: ['Jest', 'Playwright', 'Testing Library', 'TDD', 'E2E Automation'],
  },
];

// What makes the skillset unique
const differentiators = [
  {
    title: 'Full-Stack Ownership',
    description:
      "I don't throw code over the wall. From database schema to deploy button—I own the whole thing.",
  },
  {
    title: 'Legacy Fluency',
    description:
      'I can read your 2015 jQuery spaghetti, understand why it works, and migrate it without breaking production.',
  },
  {
    title: 'AI-Native Workflow',
    description:
      'I ship 3-5x faster using AI tools—not as a crutch, but as a force multiplier for experienced judgment.',
  },
];

function SkillBar({
  name,
  years,
  level,
  context,
}: {
  name: string;
  years: string;
  level: number;
  context: string;
}) {
  return (
    <div className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:border-[var(--accent)]/50">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold transition-colors group-hover:text-[var(--accent)]">{name}</h3>
        <span className="rounded bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent)]">
          {years} years
        </span>
      </div>
      <div className="mb-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--border)]"
          role="progressbar"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} proficiency: ${level}%`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70 transition-all duration-500"
            style={{ width: `${level}%` }}
          />
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">{context}</p>
    </div>
  );
}

function SkillCategory({ category }: { category: (typeof skillCategories)[0] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:border-[var(--accent)]/50">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-2xl">{category.icon}</span>
        <div>
          <h3 className="font-semibold">{category.name}</h3>
          <p className="text-xs text-[var(--muted)]">{category.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {category.skills.map((skill) => (
          <span
            key={skill}
            className="rounded bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent)]/80"
          >
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-4xl px-6">
        {/* Header */}
        <div className="mb-16">
          <p className="mb-4 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            Technical toolkit
          </p>
          <h1 className="mb-6 text-3xl font-bold md:text-4xl lg:text-5xl">Tools are just tools.</h1>
          <p className="max-w-2xl text-xl text-[var(--muted)]">
            What matters is knowing <em>when</em> to use them and <em>why</em>. Here&apos;s what I
            reach for—and the experience behind each choice.
          </p>
        </div>

        {/* Core skills with depth */}
        <section className="mb-20">
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            Primary weapons
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {coreSkills.map((skill) => (
              <SkillBar key={skill.name} {...skill} />
            ))}
          </div>
        </section>

        {/* What makes it different */}
        <section className="mb-20">
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            What makes the difference
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {differentiators.map((diff) => (
              <div
                key={diff.title}
                className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5"
              >
                <h3 className="mb-2 font-semibold">{diff.title}</h3>
                <p className="text-sm text-[var(--muted)]">{diff.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Full skill grid */}
        <section className="mb-20">
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent)] uppercase">
            The full toolkit
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {skillCategories.map((category) => (
              <SkillCategory key={category.name} category={category} />
            ))}
          </div>
        </section>

        {/* Learning philosophy */}
        <section className="mb-20">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
            <h2 className="mb-4 text-xl font-semibold">How I stay sharp</h2>
            <div className="space-y-4 text-[var(--muted)]">
              <p>
                I don&apos;t believe in &quot;knowing everything.&quot; I believe in{' '}
                <strong className="text-[var(--foreground)]">learning fast</strong> and{' '}
                <strong className="text-[var(--foreground)]">building constantly</strong>.
              </p>
              <p>
                Every week, I ship something—even if it&apos;s small. This portfolio? Built with
                Next.js 15 features I learned while building it. My self-healing agent? Started as a
                weekend experiment.
              </p>
              <p>
                The best engineers I know aren&apos;t the ones who memorized every API. They&apos;re
                the ones who can pick up any tool and be productive by lunch.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <p className="mb-6 text-[var(--muted)]">Want to see these skills in action?</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/work"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <span>View My Work</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
            <a
              href="https://www.linkedin.com/in/milos-cvetkovic-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
            >
              <span>Follow on LinkedIn</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
