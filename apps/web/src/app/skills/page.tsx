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
    context: 'My language of choice. Type safety isn\'t optional when you\'re building systems that handle real money.',
  },
  {
    name: 'React / Next.js',
    years: '7+',
    level: 90,
    context: 'From SPAs to server components. I\'ve shipped React at every scale.',
  },
  {
    name: 'Node.js',
    years: '8+',
    level: 90,
    context: 'APIs, microservices, CLI tools. If it runs JavaScript, I\'ve probably built it.',
  },
  {
    name: 'AI/LLM Integration',
    years: '2+',
    level: 85,
    context: 'Not just prompts—production AI with guardrails, cost controls, and real observability.',
  },
];

// Skill categories for the detailed grid
const skillCategories = [
  {
    name: 'AI & Agents',
    icon: '🤖',
    description: 'Building AI that actually works in production',
    skills: ['Claude Code', 'Claude Agent SDK', 'LLM Orchestration', 'Prompt Engineering', 'AI Guardrails'],
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
    description: 'Infrastructure that doesn\'t page you at 3am',
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
    description: 'I don\'t throw code over the wall. From database schema to deploy button—I own the whole thing.',
  },
  {
    title: 'Legacy Fluency',
    description: 'I can read your 2015 jQuery spaghetti, understand why it works, and migrate it without breaking production.',
  },
  {
    title: 'AI-Native Workflow',
    description: 'I ship 3-5x faster using AI tools—not as a crutch, but as a force multiplier for experienced judgment.',
  },
];

function SkillBar({ name, years, level, context }: {
  name: string;
  years: string;
  level: number;
  context: string;
}) {
  return (
    <div className="group p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-all">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold group-hover:text-[var(--accent)] transition-colors">{name}</h3>
        <span className="text-xs font-mono text-[var(--accent)] px-2 py-1 bg-[var(--accent)]/10 rounded">
          {years} years
        </span>
      </div>
      <div className="mb-3">
        <div
          className="h-2 bg-[var(--border)] rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name} proficiency: ${level}%`}
        >
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70 rounded-full transition-all duration-500"
            style={{ width: `${level}%` }}
          />
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">{context}</p>
    </div>
  );
}

function SkillCategory({ category }: { category: typeof skillCategories[0] }) {
  return (
    <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-all">
      <div className="flex items-center gap-3 mb-3">
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
            className="px-2 py-1 text-xs font-mono rounded bg-[var(--accent)]/10 text-[var(--accent)]/80"
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
          <p className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-4">
            Technical toolkit
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Tools are just tools.
          </h1>
          <p className="text-xl text-[var(--muted)] max-w-2xl">
            What matters is knowing <em>when</em> to use them and <em>why</em>.
            Here&apos;s what I reach for—and the experience behind each choice.
          </p>
        </div>

        {/* Core skills with depth */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            Primary weapons
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {coreSkills.map((skill) => (
              <SkillBar key={skill.name} {...skill} />
            ))}
          </div>
        </section>

        {/* What makes it different */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            What makes the difference
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {differentiators.map((diff) => (
              <div
                key={diff.title}
                className="p-5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5"
              >
                <h3 className="font-semibold mb-2">{diff.title}</h3>
                <p className="text-sm text-[var(--muted)]">{diff.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Full skill grid */}
        <section className="mb-20">
          <h2 className="text-sm font-mono text-[var(--accent)] uppercase tracking-wider mb-6">
            The full toolkit
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {skillCategories.map((category) => (
              <SkillCategory key={category.name} category={category} />
            ))}
          </div>
        </section>

        {/* Learning philosophy */}
        <section className="mb-20">
          <div className="p-8 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <h2 className="text-xl font-semibold mb-4">How I stay sharp</h2>
            <div className="space-y-4 text-[var(--muted)]">
              <p>
                I don&apos;t believe in &quot;knowing everything.&quot; I believe in <strong className="text-[var(--foreground)]">learning fast</strong> and <strong className="text-[var(--foreground)]">building constantly</strong>.
              </p>
              <p>
                Every week, I ship something—even if it&apos;s small. This portfolio? Built with Next.js 15
                features I learned while building it. My self-healing agent? Started as a weekend experiment.
              </p>
              <p>
                The best engineers I know aren&apos;t the ones who memorized every API. They&apos;re the ones who
                can pick up any tool and be productive by lunch.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <p className="text-[var(--muted)] mb-6">
            Want to see these skills in action?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/work"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent)] text-white font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              <span>View My Work</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 border border-[var(--accent)] text-[var(--accent)] font-semibold rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
            >
              <span>Start a Conversation</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
