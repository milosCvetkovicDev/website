import type { InlineLink, PageRecord } from './types';

/**
 * /skills: the copy `app/skills/page.tsx` renders, and the record its Markdown twin reads (#59).
 * The `h1` stays in the page.
 */

/** A primary skill with its depth: the badge's years, the bar's level, and a line of context. */
export interface CoreSkill {
  name: string;
  years: string;
  /** The bar's fill, out of 100. */
  level: number;
  context: string;
}

/** A category of the full toolkit: its icon, a one-line description, and the skills under it. */
export interface ToolkitCategory {
  name: string;
  icon: string;
  description: string;
  skills: readonly string[];
}

/** One thing that sets the skillset apart, with what it means. */
export interface Differentiator {
  title: string;
  description: string;
}

/** Words the page sets apart: `em` in italics, `strong` in bold. The twin reads them as plain text. */
export interface Emphasis {
  text: string;
  tag: 'em' | 'strong';
}

/**
 * A paragraph with emphasis in it: plain text, or its pieces in reading order, each piece carrying
 * its own spaces, as `Paragraph` in `types.ts` does for links.
 */
export type RichParagraph = string | readonly (string | Emphasis)[];

/** The text of a paragraph without its emphasis: what the twin reads. */
function plainText(paragraph: RichParagraph): string {
  return typeof paragraph === 'string'
    ? paragraph
    : paragraph.map((piece) => (typeof piece === 'string' ? piece : piece.text)).join('');
}

// Primary skills with depth indicators
export const coreSkills: readonly CoreSkill[] = [
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
export const skillCategories: readonly ToolkitCategory[] = [
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
export const differentiators: readonly Differentiator[] = [
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

/** The copy the page renders around its `h1` and its three lists, in page order. */
export const skillsCopy = {
  eyebrow: 'Technical toolkit · Milos Cvetkovic, Senior Full-Stack Engineer',
  intro: [
    'What matters is knowing ',
    { text: 'when', tag: 'em' },
    ' to use them and ',
    { text: 'why', tag: 'em' },
    ". Here's what I reach for—and the experience behind each choice.",
  ],
  headings: {
    coreSkills: 'Primary weapons',
    differentiators: 'What makes the difference',
    toolkit: 'The full toolkit',
  },
  staySharp: {
    heading: 'How I stay sharp',
    paragraphs: [
      [
        'I don\'t believe in "knowing everything." I believe in ',
        { text: 'learning fast', tag: 'strong' },
        ' and ',
        { text: 'building constantly', tag: 'strong' },
        '.',
      ],
      "Every week, I ship something—even if it's small. This portfolio? Built with Next.js 15 features I learned while building it. My self-healing agent? Started as a weekend experiment.",
      "The best engineers I know aren't the ones who memorized every API. They're the ones who can pick up any tool and be productive by lunch.",
    ],
  },
  cta: {
    prompt: 'Want to see these skills in action?',
    work: { text: 'View My Work', href: '/work' },
    linkedIn: {
      text: 'Follow on LinkedIn',
      href: 'https://www.linkedin.com/in/milos-cvetkovic-dev',
    },
  },
} satisfies {
  eyebrow: string;
  intro: RichParagraph;
  headings: Record<'coreSkills' | 'differentiators' | 'toolkit', string>;
  staySharp: { heading: string; paragraphs: readonly RichParagraph[] };
  cta: { prompt: string; work: InlineLink; linkedIn: InlineLink };
};

export const skillsRecord: PageRecord = {
  path: '/skills',
  title: 'Skills — TypeScript, React, NestJS, Azure',
  summary:
    'Full-stack TypeScript, AI agents, legacy rescue, cloud infrastructure. The tools I use to ship production systems.',
  sections: [
    {
      kind: 'list',
      heading: skillsCopy.headings.coreSkills,
      // The badge's years and the level the bar's accessible name reads out, then the context.
      items: coreSkills.map(({ name, years, level, context }) => ({
        term: name,
        description: `${years} years. Proficiency: ${level}%. ${context}`,
      })),
    },
    {
      kind: 'list',
      heading: skillsCopy.headings.differentiators,
      items: differentiators.map(({ title, description }) => ({ term: title, description })),
    },
    {
      kind: 'list',
      heading: skillsCopy.headings.toolkit,
      // The icon is decoration, so the twin leaves it out.
      items: skillCategories.map(({ name, description, skills }) => ({
        term: name,
        description: `${description}: ${skills.join(', ')}`,
      })),
    },
    {
      kind: 'prose',
      heading: skillsCopy.staySharp.heading,
      paragraphs: skillsCopy.staySharp.paragraphs.map(plainText),
    },
  ],
};
