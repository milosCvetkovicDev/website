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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, formatMetric, type CaseStudy } from '@/data/case-studies';
import type { PageRecord, PageSection } from '@/data/pages/types';
import { buildMetadata } from '../metadata';
import {
  absoluteUrl,
  caseStudyToMarkdown,
  markdownResponse,
  markdownTwinPath,
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

/** The text a Markdown reader sees: CommonMark drops the backslash before ASCII punctuation. */
const visible = (markdown: string) => markdown.replace(/\\([!-/:-@[-`{-~])/g, '$1');

/**
 * Four or more single characters in a row, each followed by one space: `M o s t` rather than
 * `Most`, the shape a per-character `<span>` heading takes in extracted text.
 */
const SPACED_OUT = /(?<!\S)(?:\S ){3,}\S(?!\S)/u;

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

/** The fields of `study` whose value its twin does not show, by path. Empty when complete. */
function missingFrom(study: CaseStudy, twin: string): string[] {
  const shown = visible(twin);
  const { metric } = study.highlight;
  const expected: Leaf[] = [
    ...leaves(study).filter(({ path }) => !FORMATTED_METRIC_FIELDS.has(path)),
    { path: 'highlight.metric', text: `${formatMetric(metric)} ${metric.label}` },
  ];
  return expected.filter(({ text }) => !shown.includes(text)).map(({ path }) => path);
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

  it.each(REJECTED)('rejects %j, which is not a clean pathname', (path) => {
    expect(() => markdownTwinPath(path)).toThrow(/not a clean pathname/);
  });

  // The twin path is derived from the same pathname the canonical is: a path buildMetadata()
  // refuses must not get a twin, and one it accepts must. metadata.ts keeps its pattern private,
  // so the two are compared through what each accepts.
  it.each(['/', '/about', '/work/nx-remote-cache', ...REJECTED])(
    'accepts %j exactly when buildMetadata() does',
    (path) => {
      const accepts = (build: () => unknown) => {
        try {
          build();
          return true;
        } catch {
          return false;
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
          '12. not an ordered list',
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
        '12\\. not an ordered list',
        '',
        'a \\| b, \\[x\\](y), \\<b\\>tag\\</b\\>, \\`code\\`, \\_under\\_, \\~strike\\~, \\\\slash, \\&copy; and R&D',
        '',
        'line one line two',
        '',
        'See [the \\[docs\\]](https://en.wikipedia.org/wiki/Foo_%28bar%29%20baz).',
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
    expect(pageToMarkdown(FIXTURE)).not.toMatch(SPACED_OUT);
  });
});
