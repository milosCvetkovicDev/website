/**
 * The copy `/contact` renders, and the page record its Markdown twin reads (#59). The page keeps
 * the layout, the classes, its `h1` and each profile's icon, which it keys by the link's `name`,
 * and maps over what is here, so a page and its twin cannot disagree. Every string is text the
 * page already showed.
 */
import { social } from '@/data/social';
import type { PageRecord, PageSection } from './types';

export interface SocialLink {
  /** The profile's name, the card's heading, and the key of its icon on the page. */
  readonly name: string;
  readonly href: string;
  readonly description: string;
  /** The button label beside the card. */
  readonly cta: string;
  /** The one profile whose button is filled rather than outlined. */
  readonly primary: boolean;
}

export const socialLinks = [
  {
    name: social.linkedin.name,
    href: social.linkedin.href,
    description: 'Engineering insights, career updates, and professional connections.',
    cta: 'Connect on LinkedIn',
    primary: true,
  },
  {
    name: social.github.name,
    href: social.github.href,
    description: 'Open-source projects, code contributions, and technical explorations.',
    cta: 'Follow on GitHub',
    primary: false,
  },
  {
    // The page's own copy, kept until the owner answers pages-23 (#49); it names `social.x.name`,
    // which `data/__tests__/social.test.ts` checks of every labelled profile link.
    name: 'X / Twitter',
    href: social.x.href,
    description: 'Quick takes on engineering, AI, and tech trends.',
    cta: 'Follow on X',
    primary: false,
  },
] as const satisfies readonly SocialLink[];

/** The names the page keys its icons by, so a profile added here without an icon fails typecheck. */
export type SocialLinkName = (typeof socialLinks)[number]['name'];

/** The rest of what `/contact` renders in its main element, in page order, less the `h1` (#58's). */
export const contactCopy = {
  socialTitle: 'Contact Milos Cvetkovic',
  eyebrow: 'Contact · Milos Cvetkovic, Senior Full-Stack Engineer',
  intro:
    "I share what I'm building, lessons from production, and engineering insights. Pick your preferred platform and say hi.",
  closing: {
    lead: "Want to see what I've been working on?",
    text: 'Check out my latest projects, case studies, and the engineering behind them.',
    link: { text: 'View My Work', href: '/work' },
  },
} as const;

const sections: readonly PageSection[] = [
  { kind: 'prose', heading: contactCopy.eyebrow, paragraphs: [contactCopy.intro] },
  ...socialLinks.map(({ name, href, description, cta }): PageSection => ({
    kind: 'prose',
    heading: name,
    paragraphs: [description, [{ text: cta, href }]],
  })),
  {
    kind: 'prose',
    heading: contactCopy.closing.lead,
    paragraphs: [contactCopy.closing.text, [contactCopy.closing.link]],
  },
];

export const contactRecord: PageRecord = {
  path: '/contact',
  title: 'Contact',
  summary:
    'Connect with Milos Cvetkovic on LinkedIn, GitHub, and X. Follow along for engineering insights and project updates.',
  sections,
};
