/**
 * The copy `/contact` renders, and the page record its Markdown twin reads (#59). The page keeps
 * the layout, the classes, its `h1` and each profile's icon, which it keys by the link's `name`,
 * and maps over what is here, so a page and its twin cannot disagree. Every string is text the
 * page shows, with two exceptions in the "Connect an agent" section. The page renders the connector
 * snippets from `data/mcp-server.ts` and tells the reader to paste one; the twin has no code block
 * to carry them, so it names the endpoint and points at the page instead (`agents.twinPointer`).
 * Importing this module evaluates `MCP_SERVER_URL`, so a malformed `NEXT_PUBLIC_SITE_URL` throws
 * here, naming the variable, as it does for every absolute URL the build writes.
 */
import { MCP_SERVER_URL } from '@/data/mcp-server';
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
    // The page's own copy, kept by the owner's pages-23 decision (2026-09-29, #49); it names
    // `social.x.name`, which `data/__tests__/social.test.ts` checks of every labelled profile link.
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
  // How to attach an MCP client to the site (#62). The copy is a draft for the owner to rewrite in
  // their own voice. The endpoint ends its sentence with no punctuation after it, so a double-click
  // or an autolinker cannot take a trailing full stop into the URL.
  agents: {
    heading: 'Connect an agent',
    intro:
      'Prefer to ask an AI agent about my work? Point it at my read-only MCP server, which needs no sign-in:',
    endpoint: MCP_SERVER_URL,
    paste:
      'Paste the snippet for your client. If your Cursor or VS Code config file already lists servers, add the entry to its mcpServers or servers object instead of replacing the file.',
    // The twin's stand-in for the snippets and the paste line, which it cannot carry.
    twinPointer: [
      'The copy-paste snippets for Claude Code, Cursor and VS Code are on ',
      { text: 'the contact page', href: '/contact' },
      '.',
    ],
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
  {
    kind: 'prose',
    heading: contactCopy.agents.heading,
    paragraphs: [
      `${contactCopy.agents.intro} ${contactCopy.agents.endpoint}`,
      contactCopy.agents.twinPointer,
    ],
  },
];

export const contactRecord: PageRecord = {
  path: '/contact',
  title: 'Contact',
  summary:
    'Connect with Milos Cvetkovic on LinkedIn, GitHub, and X. Follow along for engineering insights and project updates.',
  sections,
};
