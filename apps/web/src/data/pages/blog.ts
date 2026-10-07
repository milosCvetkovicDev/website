import type { PageRecord, ProseSection } from './types';

/**
 * /blog while it is a Coming Soon placeholder: the copy `app/blog/page.tsx` renders, and the record
 * its Markdown twin reads (#59), `h1` included: the page renders the record's `heading` (#58). When
 * the first post ships, #61's post model replaces the placeholder section here.
 */

/** The placeholder card: its heading and its one paragraph, rendered by the page as they are. */
const comingSoon = {
  kind: 'prose',
  heading: 'Coming Soon',
  paragraphs: [
    "I'm writing about building AI agents that actually ship, rescuing legacy codebases without losing your mind, and the patterns that make complex systems manageable. Stay tuned.",
  ],
} as const satisfies ProseSection;

/** The copy the page renders around its `h1`. */
export const blogCopy = {
  intro: 'Hard-won lessons from the trenches. No fluff, no hype—just what actually works.',
  comingSoon,
} satisfies { intro: string; comingSoon: ProseSection };

export const blogRecord: PageRecord = {
  path: '/blog',
  title: 'Writing',
  heading: 'Writing',
  summary:
    'Hard-won lessons on AI agents, legacy rescue, and building systems that scale. No fluff, no hype—just what actually works.',
  sections: [comingSoon],
};
