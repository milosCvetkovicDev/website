import { DataTable } from 'web';

// The site's own tables, copied from apps/web/src/data/pages: QuickFacts and CareerTimeline whole
// (facts and timeline in about.ts), and the six rows of skillCategories (skills.ts) split between
// Toolkit (four) and DarkTheme (the other two). Each story carries its table inline rather than
// sharing a module constant, because the stories become the usage examples in the .prompt.md, which
// is what the design agent copies, and an example naming a constant it never sees is no example. A
// row is its header, then its cells; a cell is text, a list (drawn as chips), or text with a lead
// or an icon. A table of more than two columns is wide, and stacks into one block per row below
// 640px.

export const QuickFacts = () => (
  <div className="p-6">
    <DataTable
      caption="Quick facts"
      columns={['Fact', 'Figure']}
      rows={[
        ['Years shipping code', '13'],
        ['Production systems rescued', '12'],
        ['Teams led', '4'],
        ['Morning coffee required', '2 cups'],
      ]}
    />
  </div>
);

export const CareerTimeline = () => (
  <div className="p-6">
    <DataTable
      caption="Career timeline"
      columns={['Year', 'Role', 'Company', 'What changed']}
      rows={[
        [
          '2025',
          'AI-Native Engineer',
          'Independent',
          {
            lead: 'Built an AI agent that fixed production bugs while I slept',
            text: 'Combining a decade of battle scars with cutting-edge AI. My self-healing agent diagnosed production errors and opened pull requests with the fixes, which I reviewed and merged: 73% errors resolved autonomously, no 3am pages.',
          },
        ],
        [
          '2021',
          'JavaScript Tech Lead',
          'Enterprise SaaS',
          {
            lead: 'Fewer bug reports after architecture overhaul',
            text: 'Inherited a codebase where "temporary fixes" had calcified into permanent nightmares. Introduced Clean Architecture. Watched bug reports drop. Trained the next generation of leads.',
          },
        ],
        [
          '2016',
          'Full-Stack Developer → Tech Lead',
          'Various',
          {
            lead: 'First microservices migration, first cloud deployment, first gray hairs',
            text: 'The years that taught me everything breaks eventually—and how to build systems that break gracefully. Migrated monoliths to microservices. Learned why "it works on my machine" is a confession, not an excuse.',
          },
        ],
        [
          '2013',
          'Frontend Developer',
          'Startup',
          {
            lead: 'Survived jQuery spaghetti and the AngularJS-to-Angular migration',
            text: "Where the obsession began. Discovered that my favorite problems are the ones everyone says can't be solved. Still true.",
          },
        ],
      ]}
    />
  </div>
);

export const Toolkit = () => (
  <div className="p-6">
    <DataTable
      caption="Skills by category"
      columns={['Category', 'What it covers', 'Skills']}
      rows={[
        [
          'AI & Agents',
          { icon: '🤖', text: 'Building AI that actually works in production' },
          [
            'Claude Code',
            'Claude Agent SDK',
            'LLM Orchestration',
            'Prompt Engineering',
            'AI Guardrails',
          ],
        ],
        [
          'Frontend',
          { icon: '🎨', text: 'Modern interfaces that users love' },
          ['React', 'Next.js', 'Angular', 'Tailwind CSS', 'Framer Motion', 'Accessibility'],
        ],
        [
          'Cloud & DevOps',
          { icon: '☁️', text: "Infrastructure that doesn't page you at 3am" },
          ['Azure', 'AWS', 'Terraform', 'Docker', 'Kubernetes', 'GitHub Actions'],
        ],
        [
          'Testing & Quality',
          { icon: '✅', text: 'Confidence to deploy on Friday' },
          ['Jest', 'Playwright', 'Testing Library', 'TDD', 'E2E Automation'],
        ],
      ]}
    />
  </div>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <DataTable
      caption="Skills by category"
      columns={['Category', 'What it covers', 'Skills']}
      rows={[
        [
          'Backend',
          { icon: '⚙️', text: 'APIs and services that scale' },
          ['Node.js', 'NestJS', 'Express', 'Bun', 'Elysia', 'PostgreSQL', 'Redis'],
        ],
        [
          'Architecture',
          { icon: '🏗️', text: 'Patterns that survive contact with reality' },
          ['Clean Architecture', 'Domain-Driven Design', 'Microservices', 'Event-Driven', 'CQRS'],
        ],
      ]}
    />
  </div>
);
