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
      'Leading platform modernization with Clean Architecture, pioneering AI-assisted development with Claude Code.',
  },
  {
    year: '2021 - 2025',
    role: 'JavaScript Tech Lead',
    description:
      'Led cross-functional teams building scalable web applications. Drove technical strategy for enterprise projects.',
  },
  {
    year: '2016 - 2021',
    role: 'JavaScript Tech Lead',
    description:
      'Developed microservices architecture, spearheaded cloud-native solutions on AWS and Azure.',
  },
  {
    year: '2013 - 2016',
    role: 'Frontend Developer',
    description:
      'Started career building web applications, growing from junior to senior roles.',
  },
];

const values = [
  {
    title: 'Clean Code & DX',
    description:
      'I believe exceptional developer experience leads to better products. Code should be readable, maintainable, and a joy to work with.',
  },
  {
    title: 'Automation First',
    description:
      'If a task is done more than twice, it should be automated. From CI/CD to AI-assisted development, I embrace tools that multiply impact.',
  },
  {
    title: 'Continuous Learning',
    description:
      'Technology evolves rapidly. Staying curious and embracing new paradigms like AI-native development keeps me effective.',
  },
];

export default function AboutPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {/* Header */}
        <h1 className="text-4xl md:text-5xl font-bold mb-6">About Me</h1>
        <p className="text-xl text-[var(--muted)] mb-12">
          Senior Full-Stack Engineer turning complexity into simplicity.
        </p>

        {/* Bio */}
        <section className="mb-16">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-4">
            The Short Version
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg leading-relaxed mb-4">
              I&apos;m a results-driven JavaScript Tech Lead with over 10 years
              of experience transforming legacy codebases into modern,
              cloud-native solutions.
            </p>
            <p className="text-lg leading-relaxed mb-4">
              Currently, I&apos;m pioneering AI-assisted development workflows
              using Claude Code and have built a self-healing agent using the
              Claude Agent SDK that autonomously monitors production errors and
              proposes fixes.
            </p>
            <p className="text-lg leading-relaxed">
              I&apos;m passionate about clean code, automation, and creating
              exceptional developer experiences. My expertise spans TypeScript,
              React, Node.js, PostgreSQL, Azure, Kubernetes, and modern DevOps
              practices.
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
