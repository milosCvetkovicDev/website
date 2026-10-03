/**
 * The five routes whose `h1` was a hook until #58 (58a), each with the line its `h1` says now and
 * the hook, which is the paragraph right under it and still the largest line on the page.
 *
 * The headings are the owner's lines of 2026-10-02, word for word: each names the person or the
 * route's subject, because the hook alone told a reader, or a machine reading the outline, neither
 * who the site is about nor what the page covers. The pages hold the same strings as literals in
 * their JSX (the page records leave the `h1` to the page), so this list is the specs' one copy of
 * them: `seo-surface.spec.ts` reads the served HTML against it, `page-headings.spec.ts` the drawn
 * page, and `hero.spec.ts` and `client-navigation.spec.ts` find `/` and `/work` by it.
 *
 * `/blog` ("Writing") and `/work/<slug>` (the study's title) named their subject already and are
 * not here; `/blog`'s heading is #61's.
 */
export const PAGE_HEADINGS = {
  '/': {
    heading:
      'Milos Cvetkovic — senior full-stack engineer and architect building AI-native systems',
    hook: 'This happened at 3am. Nobody woke up.',
  },
  '/about': {
    heading: 'About Milos Cvetkovic: legacy rescue, clean architecture, and AI-native systems',
    hook: 'I fix the systems everyone else gave up on.',
  },
  '/work': {
    heading: 'Case studies: AI agents, legacy modernization, and build infrastructure',
    hook: 'Problems solved. Systems shipped.',
  },
  '/skills': {
    heading: 'Skills: full-stack TypeScript, Azure infrastructure, and production AI agents',
    hook: 'Tools are just tools.',
  },
  '/contact': {
    heading: 'Contact Milos Cvetkovic on LinkedIn, GitHub or X',
    hook: "Let's connect.",
  },
} as const satisfies Record<string, { heading: string; hook: string }>;
