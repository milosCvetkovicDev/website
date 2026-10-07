import type { PageRecord, Paragraph, ProseSection } from './types';

/**
 * /privacy: the notice `app/privacy/page.tsx` renders, and the record its Markdown twin reads (#59).
 * The page renders its `h1` from the record's `heading` (#58); the "Last updated" line, which
 * reads `STATIC_ROUTE_UPDATED`, stays in the page.
 */

// Each claim here is sourced: the analytics ones from Vercel's "Privacy and Compliance" page for
// Web Analytics (https://vercel.com/docs/analytics/privacy-policy, read 2026-09-27), the rest from
// this repository: ADR 0026 for the tracker, ADR 0023 for the CSP that refuses every other origin,
// and `components/theme-provider.tsx` for the one thing stored in the browser. The tracker writes
// local storage only when a site calls its identify API with a user or group ID, which this one
// never does (read from the served script on 2026-09-27). Change the copy with its sources, and bump
// STATIC_ROUTE_UPDATED['/privacy'] in the same commit.

/** What each page view sends Vercel: Vercel's table has ten fields, folded into these lines. */
export const COLLECTED = [
  'the page you viewed, the route it belongs to, and query parameters in its address',
  'the site that linked you here, if your browser sends one',
  'your approximate location: country, region and city',
  'your operating system and browser, with their versions, and your device type',
  'the time of the visit',
  'the version of the analytics script',
] as const;

/** The first section: a lead-in, the `COLLECTED` list, then how Vercel keeps visits anonymous. */
const statistics = {
  heading: 'Page-view statistics',
  lead: 'The site uses Vercel Web Analytics to count visits. For each page view it sends Vercel:',
  closing: [
    'Vercel tells visitors apart with a hash of the request instead of a cookie, and discards the session after 24 hours. Vercel says it does not tie the page views to you or your IP address, and the site sees only aggregated numbers. Vercel describes this in its ',
    {
      text: 'Web Analytics privacy documentation',
      href: 'https://vercel.com/docs/analytics/privacy-policy',
    },
    '. A content or ad blocker that stops the script means your visit is not counted, and the site works exactly the same.',
  ],
} as const satisfies { heading: string; lead: string; closing: Paragraph };

/** The sections after it, each a heading and its paragraphs, rendered by the page as they are. */
const notes = [
  {
    kind: 'prose',
    heading: 'Hosting',
    paragraphs: [
      'Vercel hosts the site. Like any web server, it receives your IP address and browser details with each request in order to deliver the page. Everything the site loads, fonts included, comes from this domain: the site’s security policy tells your browser to refuse anything from another one, so your browser contacts no other site when you visit.',
    ],
  },
  {
    kind: 'prose',
    heading: 'Your browser',
    paragraphs: [
      'If you use the light and dark switch, your browser remembers the choice in its local storage. It never leaves your device, and clearing the site’s data removes it.',
    ],
  },
  {
    kind: 'prose',
    heading: 'Questions',
    paragraphs: [
      [
        'This site is run by Milos Cvetkovic. Ask me about any of this through the ',
        { text: 'contact page', href: '/contact' },
        '.',
      ],
    ],
  },
] as const satisfies readonly ProseSection[];

/** The copy the page renders around its `h1`, in page order. */
export const privacyCopy = {
  intro:
    'This site sets no cookies, has no accounts, forms or ads, and does not follow you to other sites. Beyond what any web host receives, it counts page views, and that is all.',
  statistics,
  notes,
} satisfies {
  intro: string;
  statistics: { heading: string; lead: string; closing: Paragraph };
  notes: readonly ProseSection[];
};

export const privacyRecord: PageRecord = {
  path: '/privacy',
  title: 'Privacy',
  heading: 'Privacy',
  summary:
    'What this site collects: page-view statistics through Vercel Web Analytics, with no cookies, accounts, forms, ads or cross-site tracking.',
  sections: [
    {
      kind: 'prose',
      heading: statistics.heading,
      // A prose section has no list, so the twin reads the lead-in and the collected items as one
      // sentence: the items in the page's order, separated by semicolons because several hold
      // commas of their own. A standalone paragraph per item would read as broken prose.
      paragraphs: [`${statistics.lead} ${COLLECTED.join('; ')}.`, statistics.closing],
    },
    ...notes,
  ],
};
