import type { PageRecord, ProseSection } from './types';

/**
 * The home page's record: its title and description, and the lines the story is built around.
 *
 * The story's client components import this module to render their closing lines, so everything in
 * it ships in the home page's client chunk. It imports types only and must stay that way: a runtime
 * import here would put that module in the chunk too.
 */

/**
 * A story section's closing pair: the headline the section ends on and the line under it. The one
 * paragraph is plain text, because `AnimatedText` animates a string.
 */
export interface StoryClosing extends ProseSection {
  paragraphs: readonly [string];
}

/** Each story section's closing pair, keyed by its section, in the order the story tells them. */
export const storyClosings = {
  discovery: {
    kind: 'prose',
    heading: 'Most bugs live in the gap between what you asked for and what you meant.',
    paragraphs: ['I close that gap before writing a single line of code.'],
  },
  strategy: {
    kind: 'prose',
    heading: "Hype fades. The right tool for the job doesn't.",
    paragraphs: ['I pick technologies that solve the problem, not pad my resume.'],
  },
  execution: {
    kind: 'prose',
    heading: 'The bottleneck was never my typing speed.',
    paragraphs: ['AI writes the syntax. I make the decisions that matter.'],
  },
  gauntlet: {
    kind: 'prose',
    heading: '"It worked on my machine" doesn\'t fly here.',
    paragraphs: ['Six gates. Zero shortcuts. Every commit proves itself or dies trying.'],
  },
  loop: {
    kind: 'prose',
    heading: 'This happened at 3:14am. Nobody got paged.',
    paragraphs: [
      "The system diagnosed itself, wrote a fix, and waited for a human to approve. That's the future I build.",
    ],
  },
  complete: {
    kind: 'prose',
    heading: 'This is how I work. Every time.',
    paragraphs: ['Follow along for more engineering deep dives.'],
  },
} as const satisfies Record<string, StoryClosing>;

export const homePage: PageRecord = {
  path: '/',
  // The root template applies to child segments only, so this is the whole title; `absolute` says so.
  title: { absolute: 'Milos Cvetkovic | Senior Full-Stack Engineer' },
  summary:
    'Senior Full Stack Engineer building AI-native systems: self-healing agents, legacy rescue and cloud architecture in TypeScript, React and NestJS.',
  sections: [
    storyClosings.discovery,
    storyClosings.strategy,
    storyClosings.execution,
    storyClosings.gauntlet,
    storyClosings.loop,
    storyClosings.complete,
  ],
};
