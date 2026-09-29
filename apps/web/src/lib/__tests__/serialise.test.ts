/**
 * @vitest-environment node
 *
 * `serialise.ts`, the one module that turns the content modules into Markdown (#59). Every twin,
 * and later `/llms.txt`, the feed and the MCP payloads, render through it, so this file pins the
 * output rather than trusting each consumer to notice a gap.
 *
 * The case-study check reads the data, not the interface: it walks every key of every study and
 * asserts each value reaches the twin, so a new `CaseStudy` field (#56's metric scope and window)
 * or a fourth study cannot ship without the twin carrying it. Values are compared with the text a
 * Markdown reader sees, backslash escapes removed, so correct escaping never reads as a gap.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, formatMetric, type CaseStudy } from '@/data/case-studies';
import type { PageRecord, PageSection, Paragraph } from '@/data/pages/types';
import { visible } from '@/test/markdown';
import { buildMetadata } from '../metadata';
import { markdownTwinPath } from '../pathname';
import {
  absoluteUrl,
  caseStudyToMarkdown,
  markdownResponse,
  pageToMarkdown,
  renderSections,
} from '../serialise';

const ORIGIN = 'https://miloscvetkovic.dev';

beforeEach(() => {
  // Empty, as an unset variable is: the serialiser falls back to production, as sitemap.ts does.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Four or more single characters in a row, each followed by one space: `M o s t` rather than
 * `Most`, the shape a per-character `<span>` heading takes in extracted text. A table's `|` is not
 * one of them, so a row of one-character cells (`| A | B |`) is not a spaced-out word.
 */
const SPACED_OUT = /(?<!\S)(?:[^\s|] ){3,}[^\s|](?!\S)/u;

/** Metric fields a twin shows only through `formatMetric()`, which the check below renders whole. */
const FORMATTED_METRIC_FIELDS = new Set([
  'highlight.metric.value',
  'highlight.metric.prefix',
  'highlight.metric.suffix',
  'highlight.metric.decimals',
]);

interface Leaf {
  path: string;
  text: string;
}

/** Every primitive in `value`, named by its path: `techStack[2].items[0]`, `highlight.status`. */
function leaves(value: unknown, path = ''): Leaf[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => leaves(entry, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      leaves(entry, path ? `${path}.${key}` : key),
    );
  }
  return value === undefined ? [] : [{ path, text: String(value) }];
}

/** The fields each shown on one fact line of the twin, by the label that line opens with. */
const FACT_LINES: Record<string, string> = {
  tagline: 'Tagline',
  'highlight.category': 'Category',
  'highlight.status': 'Status',
  'highlight.metric': 'Metric',
  tags: 'Tags',
  publishedAt: 'Published',
  updatedAt: 'Updated',
};

/** The fields each shown under one `##` section of the twin, by its heading. */
const SECTIONS: Record<string, string> = {
  challenge: 'The Challenge',
  approach: 'My Approach',
  howItWorks: 'How It Works',
  contributions: 'Key Contributions',
  impact: 'Impact',
  lessons: 'Lessons',
  techStack: 'Tech Stack',
};

/**
 * The part of the twin where the field at `path` belongs: its fact line, its section, the opening
 * line that carries it, or, for a field the renderer does not know, the whole twin. Looking there
 * rather than anywhere keeps a short value (`Bun` in the tech stack) from passing because the same
 * word sits in another field (`Bun` among the tags).
 */
function region(shown: string, path: string): string {
  const owns = (key: string) =>
    path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`);
  const lines = shown.split('\n');
  const line = (prefix: string) => lines.find((candidate) => candidate.startsWith(prefix)) ?? '';
  if (owns('title')) return line('# ');
  if (owns('slug')) return line('Source: ');
  if (owns('description')) return shown.split('\n\n')[1] ?? '';
  const fact = Object.keys(FACT_LINES).find(owns);
  if (fact) return line(`- ${FACT_LINES[fact]}: `);
  const section = Object.keys(SECTIONS).find(owns);
  if (section) {
    const start = shown.indexOf(`\n## ${SECTIONS[section]}\n`);
    if (start === -1) return '';
    const end = shown.indexOf('\n## ', start + 1);
    return shown.slice(start, end === -1 ? undefined : end);
  }
  return shown;
}

/** The fields of `study` whose value its twin does not show where it belongs. Empty when complete. */
function missingFrom(study: CaseStudy, twin: string): string[] {
  const shown = visible(twin);
  const { metric } = study.highlight;
  const expected: Leaf[] = [
    ...leaves(study).filter(({ path }) => !FORMATTED_METRIC_FIELDS.has(path)),
    { path: 'highlight.metric', text: `${formatMetric(metric)} ${metric.label}` },
  ];
  return expected
    .filter(({ path, text }) => !region(shown, path).includes(text))
    .map(({ path }) => path);
}

describe('markdownTwinPath()', () => {
  it('maps a route to its twin, the root included', () => {
    expect(markdownTwinPath('/')).toBe('/index.md');
    expect(markdownTwinPath('/about')).toBe('/about/index.md');
    expect(markdownTwinPath('/work/self-healing-agent')).toBe('/work/self-healing-agent/index.md');
  });

  const REJECTED = [
    '',
    'about',
    '/about/',
    '/about?tab=1',
    '/about#beliefs',
    'https://miloscvetkovic.dev/about',
    '//about',
    '/work//self-healing-agent',
    '/about/index.md',
    '/a b',
  ];

  // The edges of the pathname pattern, where a hand copy would drift first.
  const EDGES = ['/foo.bar', '/Foo', '/foo_bar', '/über', '/a%20b', '/-', '/_', '/work/a-b_c'];

  it.each(REJECTED)('rejects %j, which is not a clean pathname', (path) => {
    expect(() => markdownTwinPath(path)).toThrow(/not a clean pathname/);
  });

  // The twin path is derived from the same pathname the canonical is: a path buildMetadata()
  // refuses must not get a twin, and one it accepts must. Both read `pathname.ts` today; the two are
  // still compared through what each accepts, over a sample that includes the edges, so a caller
  // that grows its own check again cannot drift unnoticed.
  it.each(['/', '/about', '/work/nx-remote-cache', ...REJECTED, ...EDGES])(
    'accepts %j exactly when buildMetadata() does',
    (path) => {
      // Only a refused pathname counts as refusal: any other throw is a bug, not an answer.
      const accepts = (build: () => unknown) => {
        try {
          build();
          return true;
        } catch (error) {
          if (error instanceof Error && /is not a clean pathname/.test(error.message)) return false;
          throw error;
        }
      };
      expect(accepts(() => markdownTwinPath(path))).toBe(
        accepts(() => buildMetadata({ title: 'T', description: 'D', path })),
      );
    },
  );
});

describe('markdownResponse()', () => {
  it('serves the body as UTF-8 Markdown', async () => {
    const response = markdownResponse('# Title — naïve\n');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await response.text()).toBe('# Title — naïve\n');
  });

  // The rule in app-router-and-content.md: the Markdown content type is written here and in no
  // route, so a handler cannot build and serve a twin of its own.
  it('is the only writer of the Markdown content type under src/app', () => {
    const app = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
    const offenders = readdirSync(app, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(?:ts|tsx|js|mjs)$/.test(name))
      .filter((name) => !/(^|\/)__tests__\/|\.test\./.test(name))
      .filter((name) => readFileSync(join(app, name), 'utf8').includes('text/markdown'));
    expect(offenders).toEqual([]);
  });
});

describe('absoluteUrl()', () => {
  it('names the root the way the canonical does, with no trailing slash', () => {
    expect(absoluteUrl('/')).toBe(ORIGIN);
    expect(absoluteUrl('/about')).toBe(`${ORIGIN}/about`);
  });

  it('reads NEXT_PUBLIC_SITE_URL like sitemap.ts and robots.ts', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.example.dev');
    expect(absoluteUrl('/work')).toBe('https://staging.example.dev/work');
  });

  it.each(['about', '//evil.example/about', 'https://miloscvetkovic.dev/about'])(
    'rejects %j, which is not a path on this site',
    (path) => {
      expect(() => absoluteUrl(path)).toThrow(/not a path on this site/);
    },
  );

  it.each([
    ['https://staging.example.dev/', 'https://staging.example.dev/about'],
    ['  https://staging.example.dev  ', 'https://staging.example.dev/about'],
    ['   ', `${ORIGIN}/about`],
  ])('normalises NEXT_PUBLIC_SITE_URL %j to a bare origin', (configured, expected) => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', configured);
    expect(absoluteUrl('/about')).toBe(expected);
  });

  it.each(['miloscvetkovic.dev', 'https://x.dev/base', 'https://x.dev/?q=1', 'ftp://x.dev'])(
    'refuses NEXT_PUBLIC_SITE_URL %j, which is not an http(s) origin',
    (configured) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', configured);
      expect(() => absoluteUrl('/about')).toThrow(/is not an origin/);
    },
  );
});

const FIXTURE: PageRecord = {
  path: '/about',
  title: 'About — Senior Full-Stack Engineer',
  summary: 'I fix the systems everyone else gave up on.',
  sections: [
    {
      kind: 'prose',
      heading: 'Questions',
      paragraphs: [
        'This site is run by Milos Cvetkovic.',
        ['Ask me about any of this through the ', { text: 'contact page', href: '/contact' }, '.'],
        [
          'Vercel describes this in its ',
          {
            text: 'Web Analytics privacy documentation',
            href: 'https://vercel.com/docs/analytics/privacy-policy',
          },
          '. A blocked script means the visit is not counted.',
        ],
      ],
    },
    {
      kind: 'list',
      heading: 'What I believe',
      items: [
        {
          term: 'Shipping beats perfection',
          description: 'A working feature today beats a perfect feature next quarter.',
        },
        { term: 'Clarity over cleverness', description: 'Code for the tired developer at 2am.' },
      ],
    },
    {
      kind: 'table',
      heading: 'Quick facts',
      columns: ['Fact', 'Value'],
      rows: [
        ['Production systems rescued', '12'],
        ['Teams led', '4'],
      ],
    },
  ],
};

describe('pageToMarkdown() and renderSections()', () => {
  it('renders the title, summary and source, then every section variant', () => {
    expect(pageToMarkdown(FIXTURE)).toBe(
      [
        '# About — Senior Full-Stack Engineer',
        '',
        'I fix the systems everyone else gave up on.',
        '',
        `Source: ${ORIGIN}/about`,
        '',
        '## Questions',
        '',
        'This site is run by Milos Cvetkovic.',
        '',
        `Ask me about any of this through the [contact page](${ORIGIN}/contact).`,
        '',
        'Vercel describes this in its [Web Analytics privacy documentation](https://vercel.com/docs/analytics/privacy-policy). A blocked script means the visit is not counted.',
        '',
        '## What I believe',
        '',
        '- **Shipping beats perfection**: A working feature today beats a perfect feature next quarter.',
        '- **Clarity over cleverness**: Code for the tired developer at 2am.',
        '',
        '## Quick facts',
        '',
        '| Fact | Value |',
        '| --- | --- |',
        '| Production systems rescued | 12 |',
        '| Teams led | 4 |',
        '',
      ].join('\n'),
    );
  });

  it('uses an absolute title as it stands, and names the root without a trailing slash', () => {
    const home = pageToMarkdown({
      path: '/',
      title: { absolute: 'Milos Cvetkovic — Senior Full-Stack Engineer' },
      summary: 'Summary.',
      sections: [],
    });
    expect(home).toBe(
      `# Milos Cvetkovic — Senior Full-Stack Engineer\n\nSummary.\n\nSource: ${ORIGIN}\n`,
    );
  });

  it('resolves the source and on-site links against NEXT_PUBLIC_SITE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.example.dev');
    const twin = pageToMarkdown(FIXTURE);
    expect(twin).toContain('Source: https://staging.example.dev/about\n');
    expect(twin).toContain('[contact page](https://staging.example.dev/contact)');
  });

  it('renders the sections alone, and nothing for none', () => {
    expect(renderSections(FIXTURE.sections)).toBe(
      pageToMarkdown(FIXTURE).split('\n\n').slice(3).join('\n\n').trimEnd(),
    );
    expect(renderSections([])).toBe('');
  });

  it('refuses a record whose path is not a clean pathname', () => {
    expect(() => pageToMarkdown({ ...FIXTURE, path: '/about/' })).toThrow(/not a clean pathname/);
  });

  it('refuses a table row that does not have one cell per column', () => {
    const ragged: PageSection = {
      kind: 'table',
      heading: 'Quick facts',
      columns: ['Fact', 'Value'],
      rows: [['Teams led', '4', 'extra']],
    };
    expect(() => renderSections([ragged])).toThrow(
      'renderSections: row 1 of the table under "Quick facts" has 3 cells for 2 columns',
    );
  });

  it('writes plain text so that it displays as written, never as Markdown syntax', () => {
    const markdown = renderSections([
      {
        kind: 'prose',
        heading: 'C# for *everyone* #',
        paragraphs: [
          '# not a heading',
          '- not a list, and neither is 1. this',
          '+ not a list either',
          '12. not an ordered list',
          '3) nor this one',
          'a | b, [x](y), <b>tag</b>, `code`, _under_, ~strike~, \\slash, &copy; and R&D',
          'line one\n\n    line   two',
          [
            'See ',
            { text: 'the [docs]', href: 'https://en.wikipedia.org/wiki/Foo_(bar) baz' },
            '.',
          ],
        ],
      },
      {
        kind: 'table',
        heading: 'Pipes',
        columns: ['A|B', 'C'],
        rows: [['x | y', '']],
      },
    ]);
    expect(markdown).toBe(
      [
        '## C# for \\*everyone\\* \\#',
        '',
        '\\# not a heading',
        '',
        '\\- not a list, and neither is 1. this',
        '',
        '\\+ not a list either',
        '',
        '12\\. not an ordered list',
        '',
        '3\\) nor this one',
        '',
        'a \\| b, \\[x\\](y), \\<b\\>tag\\</b\\>, \\`code\\`, \\_under\\_, \\~strike\\~, \\\\slash, \\&copy; and R&D',
        '',
        'line one line two',
        '',
        'See [the \\[docs\\]](https://en.wikipedia.org/wiki/Foo_\\(bar\\)%20baz).',
        '',
        '## Pipes',
        '',
        '| A\\|B | C |',
        '| --- | --- |',
        '| x \\| y |  |',
      ].join('\n'),
    );
    // And what a reader sees is the text that went in.
    expect(visible(markdown)).toContain('a | b, [x](y), <b>tag</b>, `code`, _under_, ~strike~');
  });

  /** One prose section holding `paragraph`, rendered, without its heading. */
  const prose = (paragraph: Paragraph) =>
    renderSections([{ kind: 'prose', heading: 'H', paragraphs: [paragraph] }]).replace(
      '## H\n\n',
      '',
    );

  it('keeps a link a link when the text before it ends in "!"', () => {
    expect(prose(['Try it!', { text: 'demo', href: '/demo' }])).toBe(
      `Try it\\![demo](${ORIGIN}/demo)`,
    );
    expect(prose(['Wow!', '', { text: 'demo', href: '/demo' }])).toBe(
      `Wow\\![demo](${ORIGIN}/demo)`,
    );
    // Elsewhere an exclamation mark is only text, and stays as written.
    expect(prose('Ship it!')).toBe('Ship it!');
  });

  it('links to a web page or a mail address as written', () => {
    expect(prose([{ text: 'mail', href: 'mailto:hi@example.com' }])).toBe(
      '[mail](mailto:hi@example.com)',
    );
    expect(prose([{ text: 'site', href: 'http://example.com/a' }])).toBe(
      '[site](http://example.com/a)',
    );
  });

  it.each(['//evil.example/x', 'javascript:alert(1)', 'data:text/html,x', 'contact', '#stack', ''])(
    'refuses the href %j, which is neither a path on this site nor an http(s) or mailto URL',
    (href) => {
      expect(() => prose([{ text: 'x', href }])).toThrow(/neither a path on this site/);
    },
  );

  it('refuses a link with no text', () => {
    expect(() => prose([{ text: '  ', href: '/contact' }])).toThrow(/has no text/);
  });

  it('keeps a non-breaking space, which Markdown reads as text', () => {
    expect(prose('10\u00a0000 users')).toBe('10\u00a0000 users');
  });

  it('prints a term alone when its description is blank', () => {
    expect(
      renderSections([
        { kind: 'list', heading: 'L', items: [{ term: 'Alone', description: ' ' }] },
      ]),
    ).toBe('## L\n\n- **Alone**');
  });

  it.each<[string, PageSection, RegExp]>([
    ['an empty heading', { kind: 'prose', heading: ' ', paragraphs: ['x'] }, /heading is empty/],
    ['no paragraphs', { kind: 'prose', heading: 'H', paragraphs: [] }, /section "H" is empty/],
    ['a blank paragraph', { kind: 'prose', heading: 'H', paragraphs: [' \n '] }, /is empty/],
    ['no list items', { kind: 'list', heading: 'L', items: [] }, /list under "L" is empty/],
    [
      'an empty term',
      { kind: 'list', heading: 'L', items: [{ term: '', description: 'd' }] },
      /a term under "L" is empty/,
    ],
    [
      'a table with no columns',
      { kind: 'table', heading: 'T', columns: [], rows: [] },
      /table under "T" has no columns/,
    ],
    [
      'a table with no rows',
      { kind: 'table', heading: 'T', columns: ['A'], rows: [] },
      /table under "T" is empty/,
    ],
    [
      'an unknown section kind',
      { kind: 'quote', heading: 'Q' } as unknown as PageSection,
      /no renderer for the section kind "quote"/,
    ],
  ])('refuses %s rather than render a gap', (_name, content, error) => {
    expect(() => renderSections([content])).toThrow(error);
  });

  it('refuses a record without a title or a summary', () => {
    expect(() =>
      pageToMarkdown({ ...FIXTURE, title: {} as unknown as PageRecord['title'] }),
    ).toThrow('pageToMarkdown: the record for /about has no title');
    expect(() => pageToMarkdown({ ...FIXTURE, summary: '' })).toThrow(
      /summary of \/about is empty/,
    );
  });
});

describe('caseStudyToMarkdown()', () => {
  const STUDY: CaseStudy = {
    slug: 'nx-remote-cache',
    title: 'Nx Remote Cache Server',
    tagline: 'faster CI builds',
    description: "Why rebuild what hasn't changed?",
    tags: ['Bun', 'Elysia'],
    highlight: {
      category: 'DEVOPS',
      status: 'PRODUCTION',
      metric: { value: 4.96, prefix: '~', suffix: '×', decimals: 1, label: 'faster builds' },
    },
    challenge: 'Every CI run rebuilt the entire monorepo.',
    approach: 'I built a cache server.',
    howItWorks: ['Nx asks the server for the artifact.', 'The server answers from memory.'],
    contributions: ['Built LRU in-memory caching', 'Added dual-token authentication'],
    impact: ['CI pipelines went near-instant'],
    lessons: ['Cache what has not changed.'],
    techStack: [
      { category: 'Runtime', items: ['Bun'] },
      { category: 'Storage', items: ['Azure Blob Storage', 'LRU Cache'] },
    ],
    publishedAt: '2026-09-09',
    updatedAt: '2026-09-25',
  };

  it('renders every field, the page’s section headings and a two-column tech stack', () => {
    expect(caseStudyToMarkdown(STUDY)).toBe(
      [
        '# Nx Remote Cache Server',
        '',
        "Why rebuild what hasn't changed?",
        '',
        `Source: ${ORIGIN}/work/nx-remote-cache`,
        '',
        '- Tagline: faster CI builds',
        '- Category: DEVOPS',
        '- Status: PRODUCTION',
        '- Metric: \\~5.0× faster builds',
        '- Tags: Bun, Elysia',
        '- Published: 2026-09-09',
        '- Updated: 2026-09-25',
        '',
        '## The Challenge',
        '',
        'Every CI run rebuilt the entire monorepo.',
        '',
        '## My Approach',
        '',
        'I built a cache server.',
        '',
        '## How It Works',
        '',
        '1. Nx asks the server for the artifact.',
        '2. The server answers from memory.',
        '',
        '## Key Contributions',
        '',
        '- Built LRU in-memory caching',
        '- Added dual-token authentication',
        '',
        '## Impact',
        '',
        '- CI pipelines went near-instant',
        '',
        '## Lessons',
        '',
        '- Cache what has not changed.',
        '',
        '## Tech Stack',
        '',
        '| Category | Items |',
        '| --- | --- |',
        '| Runtime | Bun |',
        '| Storage | Azure Blob Storage, LRU Cache |',
        '',
      ].join('\n'),
    );
  });

  it('leaves out an optional section the study does not have', () => {
    const required: CaseStudy = { ...STUDY, howItWorks: undefined, lessons: undefined };
    const twin = caseStudyToMarkdown(required);
    expect(twin).not.toContain('## How It Works');
    expect(twin).not.toContain('## Lessons');
    expect(missingFrom(required, twin)).toEqual([]);
  });

  // The guard below is only as good as `missingFrom`, so prove it notices a field the renderer
  // does not know, at the top level and inside the metric.
  it('reports a field the renderer does not show', () => {
    const scoped = {
      ...STUDY,
      scope: 'measured across twelve services',
      highlight: {
        ...STUDY.highlight,
        metric: { ...STUDY.highlight.metric, window: 'over the second quarter of 2025' },
      },
    };
    expect(missingFrom(scoped, caseStudyToMarkdown(scoped))).toEqual([
      'highlight.metric.window',
      'scope',
    ]);
  });

  // A short value can also sit in another field; the check must look where the field belongs.
  it('reports a tech-stack item that shows up only among the tags', () => {
    const twin = caseStudyToMarkdown(STUDY).replace('| Runtime | Bun |', '| Runtime | Deno |');
    expect(twin).toContain('- Tags: Bun, Elysia');
    expect(missingFrom(STUDY, twin)).toEqual(['techStack[0].items[0]']);
  });

  it.each<[string, Partial<CaseStudy>, RegExp]>([
    ['no contributions', { contributions: [] }, /Key Contributions of nx-remote-cache is empty/],
    ['no impact', { impact: [] }, /Impact of nx-remote-cache is empty/],
    ['no tags', { tags: [] }, /the tags of nx-remote-cache is empty/],
    ['a blank tagline', { tagline: ' ' }, /the Tagline of nx-remote-cache is empty/],
    ['an empty challenge', { challenge: '' }, /the challenge of nx-remote-cache is empty/],
    ['no tech stack', { techStack: [] }, /table under "Tech Stack" is empty/],
    [
      'a tech-stack category with no items',
      { techStack: [{ category: 'Runtime', items: [] }] },
      /the Runtime items of nx-remote-cache is empty/,
    ],
    [
      'a tag holding a comma',
      { tags: ['Node.js, TypeScript'] },
      /"Node.js, TypeScript" in .* holds a comma/,
    ],
    [
      'a tech-stack item holding a comma',
      { techStack: [{ category: 'Storage', items: ['Azure Blob Storage, Hot tier'] }] },
      /holds a comma/,
    ],
  ])('refuses a study with %s rather than render a gap', (_name, change, error) => {
    expect(() => caseStudyToMarkdown({ ...STUDY, ...change })).toThrow(error);
  });

  it('has studies to check', () => {
    expect(caseStudies.length).toBeGreaterThan(0);
  });

  describe.each(caseStudies.map((study) => [study.slug, study] as const))('%s', (_slug, study) => {
    // Rendered per test, after the outer beforeEach has pinned the origin.
    let twin: string;
    beforeEach(() => {
      twin = caseStudyToMarkdown(study);
    });

    it('opens with its title, its description and its canonical URL', () => {
      expect(
        visible(twin).startsWith(
          `# ${study.title}\n\n${study.description}\n\nSource: ${ORIGIN}/work/${study.slug}\n\n`,
        ),
      ).toBe(true);
    });

    it('shows every field of the study, optional arrays included when present', () => {
      expect(missingFrom(study, twin)).toEqual([]);
    });

    it('renders its metric through formatMetric()', () => {
      const { metric } = study.highlight;
      expect(visible(twin)).toContain(`- Metric: ${formatMetric(metric)} ${metric.label}\n`);
    });

    it('lists the tech stack as a Category | Items table, one row per category', () => {
      const rows = study.techStack.map(
        ({ category, items }) => `| ${category} | ${items.join(', ')} |`,
      );
      expect(visible(twin)).toContain(
        ['| Category | Items |', '| --- | --- |', ...rows].join('\n'),
      );
    });

    it('never spaces a word out one character at a time', () => {
      expect(twin).not.toMatch(SPACED_OUT);
    });
  });
});

describe('the spaced-out check', () => {
  it('catches a word split into characters, and nothing else', () => {
    expect('M o s t  b u g s live in the gap').toMatch(SPACED_OUT);
    expect('Most bugs live in the gap — and I mean a gap').not.toMatch(SPACED_OUT);
    expect('| A | B | C |\n| 1 | 2 | 3 |').not.toMatch(SPACED_OUT);
    expect(pageToMarkdown(FIXTURE)).not.toMatch(SPACED_OUT);
  });
});
