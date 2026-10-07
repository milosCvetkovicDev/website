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
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  caseStudies,
  caseStudyMetricScope,
  formatMetric,
  formatMetricScope,
  type CaseStudy,
} from '@/data/case-studies';
import { OWNER_TODO, ownerTodo } from '@/data/owner-todo';
import { pages } from '@/data/pages';
import type { PageRecord, PageSection, Paragraph, TableSection } from '@/data/pages/types';
import { buildPostIndex, type PostBlock } from '@/data/posts';
import { everyBlockPost, fixturePosts, hostileTitlePost } from '@/test/fixtures/posts';
import { visible } from '@/test/markdown';
import { buildMetadata } from '../metadata';
import { markdownTwinPath } from '../pathname';
import {
  absoluteUrl,
  blogToMarkdown,
  caseStudyToMarkdown,
  markdownResponse,
  pageToMarkdown,
  postBodyToMarkdown,
  postToMarkdown,
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

/**
 * The study fields the twin shows only inside `formatMetricScope()`'s sentence on its Basis line
 * (#58), as the page's metric panel does: the window's days as a reader reads them, the method as
 * a sentence, and nothing of a definition that is still the owner's, whose marker is never served.
 * So they are not looked for leaf by leaf; `missingFrom` looks for that whole sentence instead.
 */
const SCOPE_FIELDS = ['metricDefinition'];

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

/**
 * The fields each shown on one fact line of the twin, by the label that line opens with. The most
 * specific key that owns a path wins, so the basis, which sits inside the metric, is looked for on
 * its own line whatever order these keys are in.
 */
const FACT_LINES: Record<string, string> = {
  tagline: 'Tagline',
  'highlight.category': 'Category',
  'highlight.status': 'Status',
  'highlight.metric.basis': 'Basis',
  metricDefinition: 'Basis',
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
  const [fact] = Object.keys(FACT_LINES)
    .filter(owns)
    .sort((a, b) => b.length - a.length);
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
    ...leaves(study).filter(
      ({ path }) =>
        !FORMATTED_METRIC_FIELDS.has(path) &&
        !SCOPE_FIELDS.some((field) => path === field || path.startsWith(`${field}.`)),
    ),
    { path: 'highlight.metric', text: `${formatMetric(metric)} ${metric.label}` },
    // The scope sentence, from the producer the page reads too; a study with no basis to state
    // throws here, so a missing scope fails the check rather than look for an empty string.
    { path: 'metricDefinition', text: caseStudyMetricScope(study) },
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
    // Regular files only: route folders carry file-like names (`about/index.md/`, #173), and one
    // that ended in a script extension would reach readFileSync and throw EISDIR (#189).
    const offenders = readdirSync(app, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(app, join(entry.parentPath, entry.name)))
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
      caption: 'Quick facts',
      columns: ['Fact', 'Value'],
      rows: [
        ['Production systems rescued', '12'],
        ['Teams led', '4'],
      ],
    },
  ],
};

describe('pageToMarkdown() and renderSections()', () => {
  it("refuses a record that still holds an owner's placeholder anywhere, rather than serve it", () => {
    // The quick facts leave out a fact whose basis is a placeholder; a marker anywhere else in a
    // record (a label, a figure, a paragraph) has no renderer to leave it out, so the twin refuses.
    const marker = ownerTodo('a fixture hint');
    const withMarker: PageRecord = { ...FIXTURE, summary: `${FIXTURE.summary} ${marker}` };
    expect(() => pageToMarkdown(withMarker)).toThrow(
      `pageToMarkdown(/about): a field still holds ${OWNER_TODO}, never served`,
    );
    expect(pageToMarkdown(FIXTURE)).not.toContain(OWNER_TODO);
  });

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
      caption: 'Quick facts',
      columns: ['Fact', 'Value'],
      rows: [['Teams led', '4', 'extra']],
    };
    expect(() => renderSections([ragged])).toThrow(
      'serialise: row 1 of the table under "Quick facts" has 3 cells for 2 columns',
    );
  });

  it('writes a cell as the page reads it: a list joined, a lead as a sentence, no icon (#58)', () => {
    const markdown = renderSections([
      {
        kind: 'table',
        heading: 'The longer version',
        caption: 'Career timeline',
        // The icon cell first: a wide table's first cell runs on after the row header on a phone,
        // so it may not be a list or carry a lead (refused below).
        columns: ['Year', 'Area', 'Kit', 'What changed'],
        rows: [
          [
            '2025',
            { icon: '🤖', text: 'Agents' },
            ['Bun', 'Hono'],
            { lead: 'Shipped the agent', text: 'It fixed bugs.' },
          ],
        ],
      },
    ]);
    expect(markdown).toBe(
      [
        '## The longer version',
        '',
        'Table: Career timeline',
        '',
        '| Year | Area | Kit | What changed |',
        '| --- | --- | --- | --- |',
        '| 2025 | Agents | Bun, Hono | Shipped the agent. It fixed bugs. |',
      ].join('\n'),
    );
  });

  it('names a table by its caption, as the page does, unless the heading already does (#58)', () => {
    const withCaption = (caption: string): PageSection => ({
      kind: 'table',
      heading: 'Quick facts',
      caption,
      columns: ['Fact', 'Figure'],
      rows: [['Teams led', '4']],
    });
    expect(renderSections([withCaption('Facts at a glance')])).toBe(
      [
        '## Quick facts',
        '',
        'Table: Facts at a glance',
        '',
        '| Fact | Figure |',
        '| --- | --- |',
        '| Teams led | 4 |',
      ].join('\n'),
    );
    expect(renderSections([withCaption('Quick facts')])).not.toContain('Table:');
  });

  it.each<[string, Partial<TableSection>, RegExp]>([
    ['a blank caption', { caption: ' ' }, /the caption of the table under "T" is empty/],
    ['a blank column', { columns: ['A', ''] }, /column 2 of the table under "T" is empty/],
    ['a blank row header', { rows: [[' ', 'x']] }, /the header of row 1 of the table under "T"/],
    [
      'a decorated cell without text',
      { rows: [['Row', { icon: '🤖', text: ' ' }]] },
      /the B of row 1 of the table under "T" is empty/,
    ],
  ])(
    'refuses a table with %s: the page would render an unnamed header or a bare icon',
    (_, change, error) => {
      const base: TableSection = {
        kind: 'table',
        heading: 'T',
        caption: 'C',
        columns: ['A', 'B'],
        rows: [['Row', 'x']],
      };
      expect(() => renderSections([{ ...base, ...change }])).toThrow(error);
    },
  );

  it('refuses a list cell whose entry holds a comma, or that has no entries', () => {
    const withList = (list: readonly string[]): PageSection => ({
      kind: 'table',
      heading: 'Toolkit',
      caption: 'Skills by category',
      columns: ['Category', 'Skills'],
      rows: [['Frontend', list]],
    });
    expect(() => renderSections([withList(['React, Next.js'])])).toThrow(/holds a comma/);
    expect(() => renderSections([withList([])])).toThrow(
      /the Skills of row 1 of the table under "Toolkit" is empty/,
    );
    // A blank entry would be an empty chip on the page and "A, , B" in the twin.
    expect(() => renderSections([withList(['React', ' ', 'Vue'])])).toThrow(
      /an entry in the Skills of row 1 of the table under "Toolkit" is empty/,
    );
  });

  it.each<[string, TableSection['rows'], RegExp]>([
    [
      'a list as its first cell',
      [['2025', ['Bun', 'Hono'], 'x']],
      /the B of row 1 of the table under "T" is a list/,
    ],
    [
      'a lead in its first cell',
      [['2025', { lead: 'Shipped', text: 'x' }, 'x']],
      /the B of row 1 of the table under "T" has a lead/,
    ],
    ['a blank first cell', [['2025', ' ', 'x']], /the B of row 1 of the table under "T" is blank/],
    ['a blank later cell', [['2025', 'x', '']], /the C of row 1 of the table under "T" is blank/],
  ])(
    'refuses a wide table with %s, which its stacked row on a phone could not draw',
    (_, rows, error) => {
      const wide: TableSection = {
        kind: 'table',
        heading: 'T',
        caption: 'C',
        columns: ['A', 'B', 'C'],
        rows,
      };
      expect(() => renderSections([wide])).toThrow(error);
      // Two columns never stack, so the same cells are fine there.
      const narrow = rows.map(([header, first]) => [header, first] as const);
      expect(() => renderSections([{ ...wide, columns: ['A', 'B'], rows: narrow }])).not.toThrow();
    },
  );

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
        caption: 'Pipes',
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
      { kind: 'table', heading: 'T', caption: 'T', columns: [], rows: [] },
      /table under "T" has no columns/,
    ],
    [
      'a table with no rows',
      { kind: 'table', heading: 'T', caption: 'T', columns: ['A', 'B'], rows: [] },
      /table under "T" is empty/,
    ],
    [
      'a table of one column, row headers with no cell to head',
      { kind: 'table', heading: 'T', caption: 'T', columns: ['A'], rows: [['x']] },
      /table under "T" has one column/,
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
      metric: {
        value: 4.96,
        prefix: '~',
        suffix: '×',
        decimals: 1,
        label: 'faster builds',
        basis: 'CI time with the cache, against every run rebuilding everything.',
      },
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
    metricDefinition: {
      state: 'defined',
      window: { from: '2025-03-01', to: '2025-08-31' },
      method: 'Median CI time over the window, before and after.',
    },
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
        '- Basis: CI time with the cache, against every run rebuilding everything. Measured from 1 March 2025 to 31 August 2025. Median CI time over the window, before and after.',
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
        'Table: Tech stack for Nx Remote Cache Server',
        '',
        '| Layer | Technologies |',
        '| --- | --- |',
        '| Runtime | Bun |',
        '| Storage | Azure Blob Storage, LRU Cache |',
        '',
      ].join('\n'),
    );
  });

  it('writes the metric’s scope on the Basis line, in place of the basis alone, as the page does (#58)', () => {
    const twin = caseStudyToMarkdown(STUDY);
    const scope = formatMetricScope(STUDY.highlight.metric.basis, STUDY.metricDefinition);
    expect(scope).toMatch(/^CI time with the cache.* Measured from .* Median CI time/);
    expect(visible(twin)).toContain(`\n- Basis: ${scope}\n`);
    // One producer, one copy: the basis is inside the sentence, never on a line of its own too.
    expect(visible(twin).split(STUDY.highlight.metric.basis)).toHaveLength(2);
    // The window as a reader reads it, never the stored days.
    expect(twin).not.toContain('2025-03-01');
  });

  it('writes the basis alone while the definition is still the owner’s, and never its marker', () => {
    const unfilled: CaseStudy = { ...STUDY, metricDefinition: { state: OWNER_TODO } };
    const twin = caseStudyToMarkdown(unfilled);
    expect(visible(twin)).toContain(`\n- Basis: ${STUDY.highlight.metric.basis}\n`);
    expect(twin).not.toContain('Measured');
    expect(twin).not.toContain(OWNER_TODO);
    expect(missingFrom(unfilled, twin)).toEqual([]);
  });

  it('refuses a study whose scope cannot be stated at all, rather than write an empty Basis line', () => {
    const blank: CaseStudy = {
      ...STUDY,
      highlight: { ...STUDY.highlight, metric: { ...STUDY.highlight.metric, basis: ' ' } },
      metricDefinition: { state: OWNER_TODO },
    };
    expect(() => caseStudyToMarkdown(blank)).toThrow(
      /caseStudyMetricScope\(nx-remote-cache\): the headline figure has no basis to state/,
    );
  });

  it('refuses a study with a window and method but no basis, which would not say what it counted', () => {
    // formatMetricScope() alone would state the window and method; a study's scope opens with what
    // the figure counted, so the twin refuses it, as the page does, rather than serve the rest.
    expect(STUDY.metricDefinition.state).toBe('defined');
    for (const basis of ['', ' ', '—.']) {
      const unstated: CaseStudy = {
        ...STUDY,
        highlight: { ...STUDY.highlight, metric: { ...STUDY.highlight.metric, basis } },
      };
      expect(() => caseStudyToMarkdown(unstated), JSON.stringify(basis)).toThrow(
        /caseStudyMetricScope\(nx-remote-cache\)/,
      );
    }
  });

  it('escapes Markdown in the basis, which is free prose, and still shows it whole', () => {
    const basis = '*Median* CI time for `nx build` [all_projects], against <none> ~ ever | 1 & 2.';
    const study: CaseStudy = {
      ...STUDY,
      highlight: { ...STUDY.highlight, metric: { ...STUDY.highlight.metric, basis } },
    };
    const twin = caseStudyToMarkdown(study);
    // The basis opens the scope sentence, and the window and method follow it on the same line.
    expect(twin).toContain(
      '\n- Basis: \\*Median\\* CI time for \\`nx build\\` \\[all\\_projects\\], against \\<none\\> \\~ ever \\| 1 & 2. Measured from ',
    );
    expect(visible(twin)).toContain(`\n- Basis: ${basis} Measured from `);
    expect(missingFrom(study, twin)).toEqual([]);
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
    ['no tech stack', { techStack: [] }, /the tech stack of nx-remote-cache is empty/],
    [
      'a tech-stack category with no items',
      { techStack: [{ category: 'Runtime', items: [] }] },
      /the Technologies of row 1 of the tech stack of nx-remote-cache is empty/,
    ],
    [
      'a blank tech-stack category',
      { techStack: [{ category: ' ', items: ['Bun'] }] },
      /the header of row 1 of the tech stack of nx-remote-cache is empty/,
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

    it('renders its metric through formatMetric(), and its scope once, on the next line', () => {
      const { metric } = study.highlight;
      const scope = caseStudyMetricScope(study);
      expect(scope.startsWith(metric.basis), 'the scope opens with the basis').toBe(true);
      expect(visible(twin)).toContain(
        `- Metric: ${formatMetric(metric)} ${metric.label}\n- Basis: ${scope}\n`,
      );
      // One producer (#58): the scope sentence holds the basis, so the basis is never written twice.
      expect(visible(twin).split(metric.basis)).toHaveLength(2);
    });

    it('lists the tech stack as a Layer | Technologies table, one row per layer', () => {
      // The page's table has these columns (#58): the twin's first header cell is the unit the
      // markdown-twins parity test looks for.
      const rows = study.techStack.map(
        ({ category, items }) => `| ${category} | ${items.join(', ')} |`,
      );
      expect(visible(twin)).toContain(
        ['| Layer | Technologies |', '| --- | --- |', ...rows].join('\n'),
      );
    });

    it('never spaces a word out one character at a time', () => {
      expect(twin).not.toMatch(SPACED_OUT);
    });

    it('serves no owner placeholder, whether or not its metric definition is filled in', () => {
      expect(twin).not.toContain(OWNER_TODO);
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

describe('postToMarkdown()', () => {
  it('writes the every-block fixture: its opening, its dates, then every block kind in order', () => {
    expect(postToMarkdown(everyBlockPost)).toBe(
      [
        '# Fixture: every block and inline kind',
        '',
        'A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.',
        '',
        `Source: ${ORIGIN}/blog/fixture-every-block`,
        '',
        '- Published: 2026-08-03',
        '- Updated: 2026-08-20',
        '',
        `A paragraph of plain text, then inline code: \`buildPostIndex(posts)\`, then a link to [the work page](${ORIGIN}/work) and one to [an external page](https://example.com/fixture?kind=link#inline).`,
        '',
        '## A level-two heading',
        '',
        '- A bullet item of plain text.',
        '- A bullet item with `inline code` in it.',
        `- [A bullet item that is a link](${ORIGIN}/blog)`,
        '',
        '### A level-three heading',
        '',
        '1. The first numbered item.',
        '2. The second numbered item.',
        '',
        '```ts',
        "const greeting = 'fixture';",
        'console.log(greeting);',
        '```',
        '',
        '```',
        'A code block with no language.',
        '```',
        '',
        '> A quotation, with `code` and plain text in it.',
        '',
        // Captioned even where a heading might name it, so a draft's `Table:` line always has a twin.
        'Table: Fixture: a table of three columns',
        '',
        '| Fixture run | Blocks | Result |',
        '| --- | --- | --- |',
        '| First run | 9 | Every block rendered |',
        '| Second run | 9 | The same, with \\| and \\* in a cell |',
        '',
      ].join('\n'),
    );
  });

  it('escapes what Markdown would read as syntax, and ends a jev post with its lines after a rule', () => {
    expect(postToMarkdown(hostileTitlePost)).toBe(
      [
        '# Fixture: & \\<tags\\> and "quotes"',
        '',
        'A test fixture whose title holds &, \\< and " and whose text holds \\*stars\\*, \\_underscores\\_ and \\<b\\>tags\\</b\\>, all of it plain text.',
        '',
        `Source: ${ORIGIN}/blog/fixture-hostile-title`,
        '',
        '- Published: 2026-09-07',
        '- Updated: 2026-09-07',
        '',
        '\\# Not a heading, \\*not emphasis\\*, \\[not a link\\](/nowhere) & \\<em\\>not markup\\</em\\>.',
        '',
        '---',
        '',
        'I have no relationship with TypeSafe.',
        '',
      ].join('\n'),
    );
  });

  it('fences code longer than its longest backtick run, and pads a code span that starts with one', () => {
    expect(
      postBodyToMarkdown(
        [
          { kind: 'code', language: 'md', code: '```ts\nconst a = `b`;\n---\n```' },
          { kind: 'paragraph', content: ['Run ', { code: '`x`' }, ' or ', { code: 'a``b' }, '.'] },
        ],
        'fixture',
      ),
    ).toBe(
      [
        '````md',
        '```ts',
        'const a = `b`;',
        '---',
        '```',
        '````',
        '',
        'Run `` `x` `` or ```a``b```.',
      ].join('\n'),
    );
  });

  it('escapes a ! that ends text before a link, which would make the link an image', () => {
    expect(
      postBodyToMarkdown(
        [
          {
            kind: 'paragraph',
            content: [
              'Look!',
              { text: 'the work page', href: '/work' },
              ' Run!',
              { code: 'x' },
              '!',
            ],
          },
        ],
        'fixture',
      ),
    ).toBe(`Look\\![the work page](${ORIGIN}/work) Run!\`x\`!`);
  });

  it('refuses a table the page could not draw, as it refuses a page table', () => {
    expect(() =>
      postBodyToMarkdown(
        [{ kind: 'table', caption: 'One column', columns: ['Only'], rows: [['a']] }],
        'fixture',
      ),
    ).toThrow(/^serialise: the table at block 1 of fixture has one column/);
  });

  it.each<[string, PostBlock[], string]>([
    [
      'an empty heading',
      [{ kind: 'heading', level: 3, text: ' ' }],
      'serialise: the level-3 heading at block 1 of fixture is empty',
    ],
    [
      'a link to another scheme',
      [{ kind: 'paragraph', content: ['See ', { text: 'the file', href: 'ftp://example.com/a' }] }],
      'serialise: the link "ftp://example.com/a" in block 1 of fixture is neither a path on this site nor an http(s) or mailto URL',
    ],
    [
      'a link with no text in a list item',
      [{ kind: 'list', items: [['One.'], [{ text: ' ', href: '/work' }]] }],
      'serialise: the link to "/work" in item 2 of block 1 of fixture has no text',
    ],
    [
      'a block kind it has no writer for',
      [{ kind: 'video' } as unknown as PostBlock],
      'postToMarkdown: no writer for the block kind "video" at block 1 of fixture',
    ],
  ])('names the post and the block for %s', (_name, body, message) => {
    expect(() => postBodyToMarkdown(body, 'fixture')).toThrow(message);
  });

  it('names the post whose title is empty', () => {
    expect(() => postToMarkdown({ ...everyBlockPost, title: ' ' })).toThrow(
      'serialise: postToMarkdown: the title of /blog/fixture-every-block is empty',
    );
  });
});

describe('blogToMarkdown()', () => {
  it('is the record, Coming Soon card included, while no post is published', () => {
    expect(blogToMarkdown(pages['/blog'], [])).toBe(pageToMarkdown(pages['/blog']));
  });

  it('lists each published post newest first, as /blog does: title, day, URL, summary', () => {
    expect(blogToMarkdown(pages['/blog'], buildPostIndex(fixturePosts).publishedPosts)).toBe(
      [
        '# Writing',
        '',
        pages['/blog'].summary,
        '',
        `Source: ${ORIGIN}/blog`,
        '',
        '## Fixture: & \\<tags\\> and "quotes"',
        '',
        '- Published: 2026-09-07',
        `- URL: ${ORIGIN}/blog/fixture-hostile-title`,
        '',
        'A test fixture whose title holds &, \\< and " and whose text holds \\*stars\\*, \\_underscores\\_ and \\<b\\>tags\\</b\\>, all of it plain text.',
        '',
        '## Fixture: every block and inline kind',
        '',
        '- Published: 2026-08-03',
        `- URL: ${ORIGIN}/blog/fixture-every-block`,
        '',
        'A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.',
        '',
      ].join('\n'),
    );
  });

  it('names itself, and the post whose title is empty, in an error', () => {
    expect(() =>
      blogToMarkdown({ ...pages['/blog'], title: {} as unknown as PageRecord['title'] }, [
        everyBlockPost,
      ]),
    ).toThrow('blogToMarkdown: the record for /blog has no title');
    expect(() => blogToMarkdown(pages['/blog'], [{ ...everyBlockPost, title: ' ' }])).toThrow(
      'serialise: blogToMarkdown: the title of fixture-every-block is empty',
    );
  });
});
