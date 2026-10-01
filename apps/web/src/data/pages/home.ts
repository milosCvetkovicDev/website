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
 * paragraph is plain text, because `AnimatedText` animates a string. Exactly one: each phase renders
 * `paragraphs[0]`, so a second line would reach the twin and not the page. Widening this tuple means
 * rendering every paragraph in the phases first.
 */
export interface StoryClosing extends ProseSection {
  paragraphs: readonly [string];
}

/**
 * The title each story section shows at its top, keyed like `storyClosings` and in the same order:
 * the phase badge and title of each header row, and the closing section's `SESSION COMPLETE`. Each
 * phase renders it as the heading its section is named by, and the section progress dots take their
 * names from the same strings, so a dot and the section it goes to cannot drift apart (#47, hero-10).
 */
export const storyTitles = {
  discovery: { phase: 'PHASE 1', title: 'DISCOVERY' },
  strategy: { phase: 'PHASE 2', title: 'STRATEGY' },
  execution: { phase: 'PHASE 3', title: 'EXECUTION' },
  gauntlet: { phase: 'PHASE 4', title: 'THE GAUNTLET' },
  loop: { phase: 'PHASE 5', title: 'THE LOOP' },
  complete: { title: 'SESSION COMPLETE' },
} as const satisfies Record<keyof typeof storyClosings, { phase?: string; title: string }>;

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

/**
 * `satisfies` rather than a `PageRecord` annotation, so the title keeps its `{ absolute }` type: a
 * plain string would go through the root template and read `… | Milos Cvetkovic` twice.
 */
export const homePage = {
  path: '/',
  // The root template applies to child segments only, so this is the whole title; `absolute` says so.
  title: { absolute: 'Milos Cvetkovic | Senior Full-Stack Engineer' },
  summary:
    'Senior Full Stack Engineer building AI-native systems: self-healing agents, legacy rescue and cloud architecture in TypeScript, React and NestJS.',
  // Every closing pair, in the order `storyClosings` lists them, which is the story's order: a pair
  // added there reaches the twin without a second list to remember.
  sections: Object.values(storyClosings),
} as const satisfies PageRecord;
