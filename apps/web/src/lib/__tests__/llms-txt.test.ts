/**
 * @vitest-environment node
 *
 * `/llms.txt` (#60): `siteIndexToLlmsTxt()` in `serialise.ts` and the static handler that serves it.
 *
 * Both compositions are pinned: the served one, which falls back to the home page's description and
 * leaves the facts block out while the owner's words are placeholders, and the draft-complete one
 * (`includeUnfilled: true`), which carries those placeholders and is the string the owner-todo gate
 * walks. Each must be llmstxt.org v2 line by line and fit the byte bound, so leaving an unfilled
 * block out can never produce an invalid or oversized file. The case studies and the pages are read
 * from their modules, so a fourth study or an eighth route cannot be left out silently.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, formatMetric } from '@/data/case-studies';
import { OWNER_TODO, ownerTodo } from '@/data/owner-todo';
import { pages } from '@/data/pages';
import { homePage } from '@/data/pages/home';
import { hasPublishedPosts } from '@/data/posts';
import { SITE_NAME } from '../metadata';
import { markdownTwinPath } from '../pathname';
import {
  EXCLUDED_FROM_LLMS_TXT,
  LLMS_TXT_MAX_BYTES,
  LLMS_TXT_OWNER_COPY,
  siteIndexToLlmsTxt,
  type LlmsTxtOwnerCopy,
} from '../serialise';

const ORIGIN = 'https://miloscvetkovic.dev';
const APP = join(dirname(fileURLToPath(import.meta.url)), '../../app');

/** llmstxt.org's advice, and #60's bound: the whole file fits any context window. */
const MAX_BYTES = 10_240;

/** The `## ` sections #60 fixes, in order. */
const SECTIONS = ['Case studies', 'Site pages', 'Machine-readable representations'];

beforeEach(() => {
  // Empty, as an unset variable is: the URLs fall back to production, as `metadataBase` does.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Copy the owner has not written yet, in the shape the module holds it. */
const UNFILLED: LlmsTxtOwnerCopy = {
  summary: ownerTodo('the summary'),
  facts: [ownerTodo('the facts')],
};

/** Copy the owner has written: fixtures only, describing the fixture and nothing else. */
const FILLED: LlmsTxtOwnerCopy = {
  summary: 'A fixture sentence standing in for the owner’s summary.',
  facts: [
    'A fixture paragraph standing in for the facts.',
    ['A second one, with ', { text: 'a link', href: '/about' }, '.'],
  ],
};

/** An llmstxt.org list line: `- [name](url)`, with an optional `: note`. */
const LINK_LINE = /^- \[((?:[^\]\\]|\\.)+)\]\((\S+)\)(?:: (\S.*))?$/;

interface Link {
  name: string;
  url: string;
  note: string | undefined;
}

/** Every non-blank line, in order. */
const linesOf = (body: string) => body.split('\n').filter((line) => line.trim() !== '');

/** The index of the first `## ` line, which ends the preamble. */
const firstSection = (lines: string[]) => lines.findIndex((line) => line.startsWith('## '));

/** Each `## ` section's heading and its lines, parsed as links (`null` for a line that is not). */
function sectionsOf(body: string): { heading: string; lines: string[]; links: (Link | null)[] }[] {
  const lines = linesOf(body);
  const sections: { heading: string; lines: string[]; links: (Link | null)[] }[] = [];
  for (const line of lines.slice(firstSection(lines))) {
    if (line.startsWith('## ')) {
      sections.push({ heading: line.slice(3), lines: [], links: [] });
      continue;
    }
    const match = LINK_LINE.exec(line);
    sections.at(-1)?.lines.push(line);
    sections.at(-1)?.links.push(match ? { name: match[1], url: match[2], note: match[3] } : null);
  }
  return sections;
}

/** The links of the section headed `heading`. */
function linksIn(body: string, heading: string): Link[] {
  const section = sectionsOf(body).find((candidate) => candidate.heading === heading);
  if (!section) throw new Error(`no "## ${heading}" section`);
  return section.links.filter((link): link is Link => link !== null);
}

const COMPOSITIONS = [
  ['served', () => siteIndexToLlmsTxt()],
  ['draft-complete', () => siteIndexToLlmsTxt({ includeUnfilled: true })],
  ['served, once the owner has written', () => siteIndexToLlmsTxt({ copy: FILLED })],
  [
    'draft-complete, with the owner’s words unfilled',
    () => siteIndexToLlmsTxt({ includeUnfilled: true, copy: UNFILLED }),
  ],
] as const;

describe.each(COMPOSITIONS)('the %s composition', (_name, build) => {
  it('opens with one # H1, the site’s name, and has no other', () => {
    const lines = linesOf(build());
    expect(lines[0]).toMatch(/^# \S/);
    expect(lines[0]).toBe(`# ${SITE_NAME}`);
    expect(lines.filter((line) => /^# /.test(line))).toHaveLength(1);
  });

  it('follows the H1 with one > blockquote line, and no other blockquote', () => {
    const lines = linesOf(build());
    expect(lines[1]).toMatch(/^> \S/);
    expect(lines.filter((line) => line.startsWith('>'))).toHaveLength(1);
  });

  it('puts no heading between the blockquote and the first ## section', () => {
    const lines = linesOf(build());
    const first = firstSection(lines);
    expect(first).toBeGreaterThan(1);
    expect(lines.slice(2, first).filter((line) => /^#/.test(line))).toEqual([]);
  });

  it('introduces every later section with ## and lists only - [name](url): note lines in it', () => {
    const body = build();
    const lines = linesOf(body);
    expect(lines.slice(firstSection(lines)).filter((line) => /^#{1,6}\s/.test(line))).toEqual(
      SECTIONS.map((heading) => `## ${heading}`),
    );
    for (const { heading, lines: sectionLines, links } of sectionsOf(body)) {
      expect(sectionLines.length, `## ${heading} lists something`).toBeGreaterThan(0);
      sectionLines.forEach((line, index) => {
        expect(links[index], `## ${heading}: ${line}`).not.toBeNull();
      });
    }
  });

  it('has no ## Optional section, whose special meaning v2 removed', () => {
    expect(linesOf(build()).filter((line) => /^##\s+optional\s*$/i.test(line))).toEqual([]);
  });

  it('links absolute URLs on the site’s origin, each with a note', () => {
    for (const { heading, links } of sectionsOf(build())) {
      for (const link of links) {
        expect(link?.url.startsWith(`${ORIGIN}/`), `${heading}: ${link?.url}`).toBe(true);
        expect(link?.note, `${heading}: ${link?.url} has a note`).toMatch(/\S/);
      }
    }
  });

  it('links every case study’s twin with its metric, rendered by formatMetric, and its label', () => {
    const links = linksIn(build(), 'Case studies');
    expect(links.map(({ url }) => url)).toEqual(
      caseStudies.map(({ slug }) => `${ORIGIN}${markdownTwinPath(`/work/${slug}`)}`),
    );
    caseStudies.forEach(({ slug, title, highlight: { metric } }, index) => {
      expect(links[index].url).toBe(`${ORIGIN}/work/${slug}/index.md`);
      expect(links[index].name).toBe(title);
      expect(links[index].note, slug).toContain(`${formatMetric(metric)} ${metric.label}`);
    });
  });

  it('links every page route’s twin but the excluded ones, in the pages index’s order', () => {
    const listed = linksIn(build(), 'Site pages').map(({ url }) => url);
    const routes = Object.keys(pages).filter(
      (path) => !(EXCLUDED_FROM_LLMS_TXT as readonly string[]).includes(path),
    );
    expect(listed).toEqual(routes.map((path) => `${ORIGIN}${markdownTwinPath(path)}`));
    for (const path of EXCLUDED_FROM_LLMS_TXT) {
      expect(listed).not.toContain(`${ORIGIN}${markdownTwinPath(path)}`);
    }
  });

  it('links the case studies’ JSON: the array, then each study’s document', () => {
    expect(linksIn(build(), 'Machine-readable representations').map(({ url }) => url)).toEqual([
      `${ORIGIN}/case-studies.json`,
      ...caseStudies.map(({ slug }) => `${ORIGIN}/work/${slug}/index.json`),
    ]);
  });

  it(`stays under ${MAX_BYTES} bytes, so the whole file fits a context window`, () => {
    expect(Buffer.byteLength(build(), 'utf8')).toBeLessThan(MAX_BYTES);
  });

  it('ends in exactly one newline', () => {
    expect(build()).toMatch(/[^\n]\n$/);
  });
});

describe('the served composition', () => {
  it('never carries the owner’s placeholder marker', () => {
    expect(siteIndexToLlmsTxt()).not.toContain(OWNER_TODO);
    expect(siteIndexToLlmsTxt({ copy: UNFILLED })).not.toContain(OWNER_TODO);
  });

  it('falls back to the home page’s description and leaves the facts out while both are unfilled', () => {
    const lines = linesOf(siteIndexToLlmsTxt({ copy: UNFILLED }));
    expect(lines[1]).toBe(`> ${homePage.summary}`);
    // The line after the blockquote is the first section: no facts block.
    expect(lines[2]).toBe(`## ${SECTIONS[0]}`);
  });

  it('serves the owner’s summary and facts once they are written', () => {
    const body = siteIndexToLlmsTxt({ copy: FILLED });
    expect(body.startsWith(`# ${SITE_NAME}\n\n> ${FILLED.summary}\n\n`)).toBe(true);
    expect(body).toContain(`\n\n${FILLED.facts[0] as string}\n\n`);
    // An on-site link in the facts is absolute, since the file is read away from the site.
    expect(body).toContain(`\n\nA second one, with [a link](${ORIGIN}/about).\n\n## `);
  });

  it('fills each block on its own: a written summary is served while the facts stay out', () => {
    const lines = linesOf(siteIndexToLlmsTxt({ copy: { ...UNFILLED, summary: FILLED.summary } }));
    expect(lines[1]).toBe(`> ${FILLED.summary}`);
    expect(lines[2]).toBe(`## ${SECTIONS[0]}`);
  });

  it('serves each written fact while another is still a placeholder', () => {
    const [written, linked] = FILLED.facts;
    const body = siteIndexToLlmsTxt({
      copy: { summary: FILLED.summary, facts: [written, ownerTodo('the third fact'), linked] },
    });
    expect(body).not.toContain(OWNER_TODO);
    expect(linesOf(body).slice(1, 5)).toEqual([
      `> ${FILLED.summary}`,
      written,
      `A second one, with [a link](${ORIGIN}/about).`,
      `## ${SECTIONS[0]}`,
    ]);
  });

  it('fails rather than serve a marker that reached it from any other source', () => {
    const [study, ...rest] = caseStudies;
    const studies = [{ ...study, description: `${study.description} ${ownerTodo('a stray gap')}` }];
    expect(() => siteIndexToLlmsTxt({ studies: [...studies, ...rest] })).toThrow(OWNER_TODO);
    // The draft-complete composition is never served, so it carries whatever the gate must see.
    expect(siteIndexToLlmsTxt({ includeUnfilled: true, studies })).toContain(
      ownerTodo('a stray gap'),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'fails rather than list a case study whose metric value is %s, as its JSON does',
    (value) => {
      const [study] = caseStudies;
      const highlight = { ...study.highlight, metric: { ...study.highlight.metric, value } };
      const studies = [{ ...study, highlight }];
      expect(() => siteIndexToLlmsTxt({ studies })).toThrow(
        `siteIndexToLlmsTxt(${study.slug}): the metric value ${value} is not finite`,
      );
    },
  );

  it(`fails rather than serve ${MAX_BYTES} bytes or more`, () => {
    expect(LLMS_TXT_MAX_BYTES).toBe(MAX_BYTES);
    const [study] = caseStudies;
    const long = { ...study, description: 'A sentence that keeps going. '.repeat(400) };
    expect(() => siteIndexToLlmsTxt({ studies: [long] })).toThrow(
      `not under ${MAX_BYTES}: the whole index has to fit a context window`,
    );
  });
});

describe('the draft-complete composition', () => {
  it('carries each unfilled block as its marker, where the served one falls back or leaves it out', () => {
    const lines = linesOf(siteIndexToLlmsTxt({ includeUnfilled: true, copy: UNFILLED }));
    expect(lines[1]).toBe(`> ${UNFILLED.summary}`);
    expect(lines[2]).toBe(UNFILLED.facts[0]);
    expect(lines[3]).toBe(`## ${SECTIONS[0]}`);
  });

  it('differs from the served one only in those two blocks', () => {
    const served = linesOf(siteIndexToLlmsTxt({ copy: UNFILLED }));
    const draft = linesOf(siteIndexToLlmsTxt({ includeUnfilled: true, copy: UNFILLED }));
    expect(draft.slice(3)).toEqual(served.slice(2));
    expect(draft[0]).toBe(served[0]);
  });

  it('is the served composition once the owner has written both blocks', () => {
    expect(siteIndexToLlmsTxt({ includeUnfilled: true, copy: FILLED })).toBe(
      siteIndexToLlmsTxt({ copy: FILLED }),
    );
  });

  it('is built from the module’s own copy by default', () => {
    expect(siteIndexToLlmsTxt({ includeUnfilled: true })).toBe(
      siteIndexToLlmsTxt({ includeUnfilled: true, copy: LLMS_TXT_OWNER_COPY }),
    );
    expect(siteIndexToLlmsTxt()).toBe(siteIndexToLlmsTxt({ copy: LLMS_TXT_OWNER_COPY }));
  });
});

describe('EXCLUDED_FROM_LLMS_TXT', () => {
  it('leaves /blog out exactly while no post is published (ADR 0028’s one switch, #61)', () => {
    expect([...EXCLUDED_FROM_LLMS_TXT]).toEqual(hasPublishedPosts ? [] : ['/blog']);
  });

  it('lists /blog once a post is published, with no code change', async () => {
    vi.resetModules();
    vi.doMock('@/data/posts', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/data/posts')>()),
      hasPublishedPosts: true,
    }));
    try {
      const fresh = await import('../serialise');
      expect(fresh.EXCLUDED_FROM_LLMS_TXT).toEqual([]);
      expect(linksIn(fresh.siteIndexToLlmsTxt(), 'Site pages').map(({ url }) => url)).toContain(
        `${ORIGIN}/blog/index.md`,
      );
    } finally {
      vi.doUnmock('@/data/posts');
      vi.resetModules();
    }
  });
});

describe('the origin', () => {
  it('comes from NEXT_PUBLIC_SITE_URL, as metadataBase’s does', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.example.dev');
    const body = siteIndexToLlmsTxt({ copy: FILLED });
    const urls = sectionsOf(body).flatMap(({ links }) => links.map((link) => link?.url));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^https:\/\/staging\.example\.dev\//);
    // An on-site link in the facts block follows it too.
    expect(body).toContain('[a link](https://staging.example.dev/about)');
    expect(body).not.toContain(ORIGIN);
  });
});

describe('the /llms.txt handler', () => {
  it('serves the served composition, statically, as UTF-8 plain text', async () => {
    const handler = (await import(join(APP, 'llms.txt', 'route.ts'))) as {
      dynamic?: string;
      GET: () => Response | Promise<Response>;
    };
    expect(handler.dynamic).toBe('force-static');
    const response = await handler.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe(siteIndexToLlmsTxt());
  });
});
