'use client';

import { useState } from 'react';
import Link from 'next/link';

const skillCategories = [
  {
    name: 'AI & Automation',
    description: 'Pioneering AI-assisted development workflows',
    skills: [
      { name: 'Claude Code', level: 'Expert', projects: ['self-healing-agent', 'enterprise-b2b-platform'] },
      { name: 'Claude Agent SDK', level: 'Expert', projects: ['self-healing-agent'] },
      { name: 'AI-Native Development', level: 'Expert', projects: ['self-healing-agent', 'enterprise-b2b-platform'] },
    ],
  },
  {
    name: 'Languages',
    description: 'Core programming languages',
    skills: [
      { name: 'TypeScript', level: 'Expert', projects: ['self-healing-agent', 'enterprise-b2b-platform', 'nx-remote-cache'] },
      { name: 'JavaScript', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'SQL', level: 'Strong', projects: ['enterprise-b2b-platform'] },
    ],
  },
  {
    name: 'Frontend',
    description: 'Building modern user interfaces',
    skills: [
      { name: 'React', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Next.js', level: 'Expert', projects: [] },
      { name: 'Angular', level: 'Strong', projects: [] },
      { name: 'Tailwind CSS', level: 'Expert', projects: [] },
      { name: 'Material-UI', level: 'Strong', projects: ['enterprise-b2b-platform'] },
    ],
  },
  {
    name: 'Backend',
    description: 'Server-side development',
    skills: [
      { name: 'Node.js', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'NestJS', level: 'Expert', projects: [] },
      { name: 'Express.js', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Bun', level: 'Strong', projects: ['self-healing-agent', 'nx-remote-cache'] },
      { name: 'Elysia', level: 'Strong', projects: ['self-healing-agent', 'nx-remote-cache'] },
      { name: 'PostgreSQL', level: 'Expert', projects: ['enterprise-b2b-platform'] },
    ],
  },
  {
    name: 'Cloud & Infrastructure',
    description: 'Cloud platforms and DevOps',
    skills: [
      { name: 'Azure', level: 'Expert', projects: ['self-healing-agent', 'enterprise-b2b-platform', 'nx-remote-cache'] },
      { name: 'AWS', level: 'Strong', projects: [] },
      { name: 'Terraform', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Docker', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Kubernetes', level: 'Strong', projects: [] },
    ],
  },
  {
    name: 'DevOps & CI/CD',
    description: 'Automation and deployment',
    skills: [
      { name: 'GitHub Actions', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Nx Monorepo', level: 'Expert', projects: ['enterprise-b2b-platform', 'nx-remote-cache'] },
      { name: 'Playwright', level: 'Strong', projects: ['enterprise-b2b-platform'] },
      { name: 'Jest', level: 'Expert', projects: ['enterprise-b2b-platform'] },
    ],
  },
  {
    name: 'Architecture',
    description: 'Design patterns and principles',
    skills: [
      { name: 'Clean Architecture', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Domain-Driven Design', level: 'Expert', projects: ['enterprise-b2b-platform'] },
      { name: 'Microservices', level: 'Strong', projects: [] },
      { name: 'Event-Driven', level: 'Strong', projects: [] },
    ],
  },
];

const projectNames: Record<string, string> = {
  'self-healing-agent': 'Self-Healing Agent',
  'enterprise-b2b-platform': 'Enterprise B2B Platform',
  'nx-remote-cache': 'Nx Remote Cache Server',
};

function SkillCard({ skill, isSelected, onClick }: {
  skill: { name: string; level: string; projects: string[] };
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
          : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{skill.name}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            skill.level === 'Expert'
              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
              : 'bg-[var(--muted)]/20 text-[var(--muted)]'
          }`}
        >
          {skill.level}
        </span>
      </div>
      {skill.projects.length > 0 && (
        <p className="text-xs text-[var(--muted)]">
          Used in {skill.projects.length} project{skill.projects.length > 1 ? 's' : ''}
        </p>
      )}
    </button>
  );
}

export default function SkillsPage() {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const selectedSkillData = selectedSkill
    ? skillCategories
        .flatMap((cat) => cat.skills)
        .find((s) => s.name === selectedSkill)
    : null;

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Skills & Expertise</h1>
        <p className="text-xl text-[var(--muted)] mb-12 max-w-2xl">
          Click on any skill to see related projects. Over 10 years of experience
          across the full stack.
        </p>

        {/* Selected skill details */}
        {selectedSkillData && selectedSkillData.projects.length > 0 && (
          <div className="mb-8 p-6 rounded-xl border border-[var(--accent)] bg-[var(--accent)]/5">
            <h2 className="font-semibold mb-3">
              Projects using {selectedSkillData.name}
            </h2>
            <div className="flex flex-wrap gap-2">
              {selectedSkillData.projects.map((projectSlug) => (
                <Link
                  key={projectSlug}
                  href={`/work/${projectSlug}`}
                  className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  {projectNames[projectSlug]}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Skills grid */}
        <div className="space-y-12">
          {skillCategories.map((category) => (
            <section key={category.name}>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{category.name}</h2>
                <p className="text-sm text-[var(--muted)]">{category.description}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {category.skills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    isSelected={selectedSkill === skill.name}
                    onClick={() =>
                      setSelectedSkill(selectedSkill === skill.name ? null : skill.name)
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
