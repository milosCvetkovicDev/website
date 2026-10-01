/**
 * The copy `/about` renders, and the page record its Markdown twin reads (#59). The page keeps the
 * layout, the classes and its `h1`, and maps over what is here, so a page and its twin cannot
 * disagree. Every string is text the page shows, with two exceptions: the `Quick facts` heading,
 * which the page gives screen readers only (#58), and the timeline's column names, which only the
 * twin reads. Every record section needs a heading and a table needs columns, and the page shows
 * those parts without either.
 */
import { formatMetric, getCaseStudy } from '@/data/case-studies';
import { experienceFact, yearsOfExperience } from '@/data/profile';
import { social } from '@/data/social';
import type { PageRecord, PageSection, Paragraph } from './types';

// The timeline quotes the agent's metric, so it reads it from the study rather than restating it.
const agentStudy = getCaseStudy('self-healing-agent');
if (!agentStudy) throw new Error('The About page quotes the "self-healing-agent" case study');
const agentMetric = agentStudy.highlight.metric;

/**
 * What the agent's case study lists first under `category` in its tech stack. The About answer
 * about the agent names its stack from there, so the two cannot drift apart (#58).
 */
function agentStack(category: string): string {
  const item = agentStudy?.techStack.find((entry) => entry.category === category)?.items[0];
  if (!item) throw new Error(`The About page names the agent's ${category} from its case study`);
  return item;
}

/** The name the questions ask about: each one names its subject, so it stands alone when lifted. */
const FULL_NAME = 'Milos Cvetkovic';

export interface TimelineEntry {
  readonly year: string;
  readonly role: string;
  readonly company: string;
  readonly highlight: string;
  readonly description: string;
}

export interface Belief {
  readonly title: string;
  readonly description: string;
  /**
   * An emoji drawn beside the title as decoration. The page hides it from screen readers and the
   * twin leaves it out, so it stays a field of its own and never goes inside the text.
   */
  readonly icon: string;
}

export interface Fact {
  readonly label: string;
  readonly value: string;
}

export interface Credential {
  /**
   * An emoji drawn beside the text as decoration. The page hides it from screen readers and the
   * twin leaves it out, so it stays a field of its own and never goes inside the text.
   */
  readonly icon: string;
  readonly text: string;
}

/** A question a visitor asks, as a heading, and its answer in one self-contained paragraph. */
export interface Question {
  readonly question: string;
  readonly answer: string;
}

/** A profile the closing call to action links to; the primary one is the filled button. */
export interface ProfileLink {
  readonly name: string;
  readonly href: string;
  readonly primary: boolean;
}

/** A run of story text: plain, or set in bold or italics where the page emphasises it. */
export type StoryRun = string | { readonly text: string; readonly emphasis: 'strong' | 'em' };

/** A story paragraph: plain text, or its runs in reading order, joined as they are. */
export type StoryParagraph = string | readonly StoryRun[];

export const timeline: readonly TimelineEntry[] = [
  {
    year: '2025',
    role: 'AI-Native Engineer',
    company: 'Independent',
    highlight: 'Built an AI agent that fixed production bugs while I slept',
    description: `Combining a decade of battle scars with cutting-edge AI. My self-healing agent diagnosed production errors and opened pull requests with the fixes, which I reviewed and merged: ${formatMetric(agentMetric)} ${agentMetric.label}, no 3am pages.`,
  },
  {
    year: '2021',
    role: 'JavaScript Tech Lead',
    company: 'Enterprise SaaS',
    // No figure until the owner sources one (#49, pages-3): the percentage this line used to state
    // is established by no study, and the enterprise study's figure counts complexity, not bug
    // reports. A figure here would be read from a study through formatMetric(), as 2025's is.
    highlight: 'Fewer bug reports after architecture overhaul',
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

export const beliefs: readonly Belief[] = [
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

// The first fact is the years of experience, whole from the profile: its figure is derived there,
// and its label names the figure, so neither is spelled out in this module (R34).
export const facts: readonly Fact[] = [
  experienceFact(),
  { label: 'Production systems rescued', value: '12' },
  { label: 'Teams led', value: '4' },
  { label: 'Morning coffee required', value: '2 cups' },
];

export const credentials: readonly Credential[] = [
  { icon: '🎓', text: 'Angular Certified Architect' },
  { icon: '📍', text: 'Belgrade, Serbia' },
  { icon: '🌍', text: 'Remote-first since 2020' },
];

const story: readonly StoryParagraph[] = [
  'You know that codebase? The one with the "temporary" workaround from 2017 that somehow became load-bearing? The one where three developers quit rather than touch the payment module? The one everyone says needs a "complete rewrite" but nobody has two years to spare?',
  [{ text: "That's my favorite kind of project.", emphasis: 'strong' }],
  "I've spent a decade inside systems like that. Not just surviving them—transforming them. Untangling dependencies. Introducing tests where there were none. Building architecture that makes the next change possible instead of terrifying.",
  [
    "But here's what changed: I got tired of being the only one who could fix things. So I started building AI that works the way I do. My self-healing agent monitored production 24/7, diagnosed errors, and opened PRs with fixes—",
    { text: 'without waking anyone up', emphasis: 'em' },
    '.',
  ],
];

/**
 * Three questions a visitor asks, answered after the story (#58). A question-shaped heading with a
 * short answer under it is the unit a text extractor can lift whole, so each question names its
 * subject and each answer stands on its own in 40 to 80 words. An answer restates no case-study
 * metric (a study's headline figure, in any numeric spelling), names the agent's safeguards without
 * their figures, and reads the agent's stack from its study: the study is the one source for all
 * three. `src/test/answer-copy.ts` measures both rules, for the unit test on this list and for
 * `e2e/seo-surface.spec.ts` on the served HTML. The pattern is the visible text alone, with no
 * structured data for it: ADR 0017 refuses that markup, and `scripts/ai-refusals.test.mjs` fails
 * on its type name anywhere under `src`, comments included. The self-healing agent is retired, so
 * it is in the past tense.
 */
export const questions: readonly Question[] = [
  {
    question: `What does ${FULL_NAME} build?`,
    answer:
      'Two kinds of system. The first is the legacy platform nobody wants to touch: I introduce boundaries one module at a time, so every pull request ships value while the architecture improves underneath it. The second is AI that repairs what breaks — a self-healing agent, since retired, that watched production, diagnosed errors and opened pull requests a person reviewed and merged.',
  },
  {
    question: `What stack does ${FULL_NAME} work in?`,
    answer:
      'TypeScript end to end. React and Next.js on the front, NestJS, Node and Bun with Elysia behind it, PostgreSQL for state. Infrastructure is Azure — Container Apps, Blob Storage, Log Analytics — described in Terraform and shipped through GitHub Actions with Nx. The AI work runs on the Claude Agent SDK. Clean Architecture and domain-driven design are the habits underneath all of it.',
  },
  {
    question: `What was ${FULL_NAME}'s self-healing agent, exactly?`,
    answer: `A service on Azure that watched production logs, read the codebase, and when something broke, diagnosed the error and opened a pull request with a fix. It ran on ${agentStack('Runtime')} and ${agentStack('Framework')} with the ${agentStack('AI')}, and it shipped with limits: a daily cap, a budget cap, confidence thresholds, capped CI retries and a kill switch. A person reviewed and merged every fix.`,
  },
];

const connectLinks: readonly ProfileLink[] = [
  { name: social.linkedin.name, href: social.linkedin.href, primary: true },
  { name: social.github.name, href: social.github.href, primary: false },
  // The page's own copy, as on /contact, kept by the owner's pages-23 decision (2026-09-29, #49).
  { name: 'X / Twitter', href: social.x.href, primary: false },
];

/** The rest of what `/about` renders in its main element, in page order, less the `h1` (#58's). */
export const aboutCopy = {
  socialTitle: `About ${FULL_NAME}`,
  eyebrow: 'The short version',
  lede: 'Then I make them better than they were before the problems started.',
  story,
  /** The story's last line, which the page sets apart in the foreground colour. */
  storyClose: "It's not about replacing engineers. It's about giving them superpowers.",
  factsHeading: 'Quick facts',
  timelineHeading: 'The longer version',
  beliefsHeading: 'What I believe',
  credentialsHeading: 'Credentials',
  connect: {
    heading: "Let's connect",
    text: 'I share engineering insights, open-source work, and lessons learned from the trenches. Follow along or drop me a message.',
    links: connectLinks,
  },
} as const;

/** A story paragraph as the text it reads as: the twin has no emphasis to carry. */
function plainText(paragraph: StoryParagraph): string {
  if (typeof paragraph === 'string') return paragraph;
  return paragraph.map((run) => (typeof run === 'string' ? run : run.text)).join('');
}

const sections: readonly PageSection[] = [
  {
    kind: 'prose',
    heading: aboutCopy.eyebrow,
    paragraphs: [aboutCopy.lede, ...story.map(plainText), aboutCopy.storyClose],
  },
  ...questions.map(({ question, answer }): PageSection => ({
    kind: 'prose',
    heading: question,
    paragraphs: [answer],
  })),
  {
    kind: 'list',
    heading: aboutCopy.factsHeading,
    items: facts.map(({ label, value }) => ({ term: label, description: value })),
  },
  {
    kind: 'table',
    heading: aboutCopy.timelineHeading,
    columns: ['Year', 'Role', 'Company', 'Highlight', 'Description'],
    rows: timeline.map(({ year, role, company, highlight, description }) => [
      year,
      role,
      company,
      highlight,
      description,
    ]),
  },
  {
    kind: 'list',
    heading: aboutCopy.beliefsHeading,
    items: beliefs.map(({ title, description }) => ({ term: title, description })),
  },
  {
    kind: 'prose',
    heading: aboutCopy.credentialsHeading,
    paragraphs: credentials.map(({ text }) => text),
  },
  {
    kind: 'prose',
    heading: aboutCopy.connect.heading,
    paragraphs: [
      aboutCopy.connect.text,
      ...connectLinks.map(({ name, href }): Paragraph => [{ text: name, href }]),
    ],
  },
];

export const aboutRecord: PageRecord = {
  path: '/about',
  title: 'About — Senior Full-Stack Engineer',
  summary: `I fix the systems everyone else gave up on: ${yearsOfExperience()} years rescuing legacy codebases, now building AI agents that fix their own bugs. Based in Belgrade.`,
  sections,
};
