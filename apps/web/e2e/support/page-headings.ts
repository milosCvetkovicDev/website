/**
 * The five routes whose `h1` was a hook until #58 (58a), each with the line its `h1` says now and
 * the hook, which is the paragraph right under it and still the largest line on the page.
 *
 * The headings are the owner's lines of 2026-10-02, word for word: each names the person or the
 * route's subject, because the hook alone told a reader, or a machine reading the outline, neither
 * who the site is about nor what the page covers. The pages render the same strings from their
 * records' `heading` (`src/data/pages`), and this list is the e2e specs' one copy of them, kept as
 * literals on purpose: an oracle that imported the records' strings would agree with any edit.
 * `seo-surface.spec.ts` reads the served HTML against it, `page-headings.spec.ts` the drawn page,
 * `hero-contrast.spec.ts` and `no-js-text.spec.ts` the hero's lines, and `hero.spec.ts` and
 * `client-navigation.spec.ts` find `/` and `/work` by it. The unit test of `HeroContent`
 * (`hero-content.test.tsx`) keeps a literal of the `/` line of its own, so the jsdom and browser
 * layers do not share one copy that a single wrong edit would make both agree with.
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
