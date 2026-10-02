import { render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, techStackTable } from '@/data/case-studies';
import { factsTable, timelineTable } from '@/data/pages/about';
import { toolkitTable } from '@/data/pages/skills';
import { asSentence, cellText, isWideTable } from '@/data/pages/table';
import type { DecoratedCell, Table } from '@/data/pages/types';
import { ScrollTable } from '../scroll-table';

/**
 * The data tables of #58: the case-study tech stacks, the /about quick facts and timeline, and the
 * /skills toolkit, all rendered by `ScrollTable`. A table is named by its caption and has a header
 * cell for every column and one for every row; a wide one scrolls sideways inside a region the
 * keyboard can reach rather than widening the page. A cell reads as `cellText()` says, less its decoration,
 * which is what the Markdown twin writes, so the page and the twin say the same thing.
 * `e2e/seo-surface.spec.ts` checks the same of the served HTML, and the e2e accessibility gate runs
 * axe's table rules over it.
 */

/** Every table the site renders, by where it appears. */
const TABLES: [where: string, table: Table][] = [
  ['/about quick facts', factsTable],
  ['/about timeline', timelineTable],
  ['/skills toolkit', toolkitTable],
  ...caseStudies.map((study): [string, Table] => [
    `${study.slug} tech stack`,
    techStackTable(study),
  ]),
];

/** An element's text as a reader meets it: decoration hidden from assistive technology left out. */
function readText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const FIXTURE: Table = {
  caption: 'A test table',
  columns: ['Name', 'Plain', 'List', 'With a lead', 'With an icon'],
  rows: [
    [
      'First',
      'plain text',
      ['One', 'Two', 'Three'],
      { lead: 'A lead without a stop', text: 'Then the rest.' },
      { icon: '🧪', text: 'Beside an icon' },
    ],
    ['Second', 'more text', ['Alone'], { lead: 'A lead with one!', text: 'More.' }, { text: 'x' }],
  ],
};

/** Two columns: wraps inside the page, so it is neither a region nor a tab stop. */
const NARROW: Table = {
  caption: 'A narrow table',
  columns: ['Fact', 'Figure'],
  rows: [['Teams led', '4']],
};

describe('ScrollTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the table by its caption and heads every column and every row', () => {
    const { container } = render(<ScrollTable {...FIXTURE} />);
    const table = container.querySelector('table');
    if (!table) throw new Error('ScrollTable must render a table');

    expect(table.caption?.textContent).toBe(FIXTURE.caption);
    const columns = [...table.querySelectorAll('thead th')];
    expect(columns.map((th) => [th.getAttribute('scope'), th.textContent])).toEqual(
      FIXTURE.columns.map((column) => ['col', column]),
    );
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(FIXTURE.rows.length);
    rows.forEach((row, index) => {
      const [first, ...rest] = [...row.children];
      expect(first.localName).toBe('th');
      expect(first.getAttribute('scope')).toBe('row');
      expect(first.textContent).toBe(FIXTURE.rows[index][0]);
      expect(rest.map((cell) => cell.localName)).toEqual(FIXTURE.columns.slice(1).map(() => 'td'));
    });
  });

  it('scrolls a wide table inside a region the keyboard reaches, named by the caption', () => {
    const { container, getByRole } = render(<ScrollTable {...FIXTURE} />);
    const region = getByRole('region', { name: FIXTURE.caption });
    expect(region).toHaveAttribute('tabindex', '0');
    // The name has one source, the caption, rather than a second copy in an aria-label.
    expect(region).not.toHaveAttribute('aria-label');
    expect(region.getAttribute('aria-labelledby')).toBe(
      container.querySelector('caption')?.getAttribute('id'),
    );
    expect(region.className).toMatch(/\boverflow-x-auto\b/);
    // The containing block of the chips' `sr-only` separators, which are absolutely positioned:
    // without it they escape the scroller and widen the page by the table's overflow on a phone.
    expect(region.className).toMatch(/(^|\s)relative(\s|$)/);
    expect(region.className).toMatch(/\bfocus-ring\b/);
    expect(region.firstElementChild?.localName, 'the table sits straight inside its region').toBe(
      'table',
    );
    expect(within(region).getByRole('table', { name: FIXTURE.caption })).toBe(
      container.querySelector('table'),
    );
  });

  it('reads each cell as cellText() writes it for the twin, with its icon hidden', () => {
    const { container } = render(<ScrollTable {...FIXTURE} />);
    const rows = [...container.querySelectorAll('tbody tr')];
    rows.forEach((row, index) => {
      const [, ...cells] = FIXTURE.rows[index];
      expect([...row.querySelectorAll('td')].map(readText)).toEqual(cells.map(cellText));
    });

    // The list is drawn as one chip per entry, and read, and copied, as a comma-separated list.
    const chips = rows[0].querySelectorAll('td')[1].children[0]?.children;
    expect(chips).toHaveLength(3);
    // The lead ends as a sentence, set on a line of its own before the text.
    expect(cellText(FIXTURE.rows[0][3])).toBe('A lead without a stop. Then the rest.');
    expect(cellText(FIXTURE.rows[1][3])).toBe('A lead with one! More.');
    // The icon is drawn, beside the text, and hidden from assistive technology.
    const iconCell = rows[0].querySelectorAll('td')[3];
    const icon = iconCell.querySelector('[aria-hidden="true"]');
    expect(icon?.textContent).toBe('🧪');
    expect(iconCell.textContent).toBe('🧪 Beside an icon');
  });

  it('leaves a two-column table out of the tab order: it wraps, so there is nothing to scroll', () => {
    const { container, queryByRole, getByRole } = render(<ScrollTable {...NARROW} />);
    expect(queryByRole('region')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
    expect(getByRole('table', { name: NARROW.caption })).toBeInTheDocument();
    // Still a scroller, and still the separators' containing block, should a cell ever overflow.
    const box = container.querySelector('table')?.parentElement;
    expect(box?.className).toMatch(/(^|\s)relative(\s|$)/);
    expect(box?.className).toMatch(/\boverflow-x-auto\b/);
    expect(box?.className).not.toMatch(/\bfocus-ring\b/);
  });

  it('lays a table of more than two columns out at its minimum width, and scrolls it', () => {
    expect(isWideTable(FIXTURE)).toBe(true);
    expect(isWideTable(NARROW)).toBe(false);
    const { container, rerender } = render(<ScrollTable {...NARROW} />);
    expect(container.querySelector('table')?.className).not.toMatch(/\bmin-w-/);
    rerender(<ScrollTable {...FIXTURE} />);
    expect(container.querySelector('table')?.className).toMatch(/\bmin-w-160\b/);
  });

  it('pins each row header on a solid surface, so a scrolled cell keeps its row name', () => {
    const { container } = render(<ScrollTable {...FIXTURE} />);
    for (const th of container.querySelectorAll('tbody th')) {
      expect(th.className).toMatch(/(^|\s)sticky(\s|$)/);
      expect(th.className).toMatch(/\bleft-0\b/);
      expect(th.className).toContain('bg-[var(--card)]');
    }
  });

  it('types a cell with an icon or a lead, never both, which would leave the icon on its own line', () => {
    // @ts-expect-error: an icon and a lead in one cell is not a DecoratedCell.
    const both: DecoratedCell = { icon: '🧪', lead: 'A lead', text: 'Text' };
    expect(both.text).toBe('Text');
  });

  it('renders without a React warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ScrollTable {...FIXTURE} />);
    expect(errors).not.toHaveBeenCalled();
  });

  it('renders rows that share a header, and a list that repeats an entry, without a key warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ScrollTable
        caption="Repeats"
        columns={['Year', 'Kit', 'Note']}
        rows={[
          ['2021', ['Bun', 'Bun'], 'first'],
          ['2021', ['Bun'], 'second'],
        ]}
      />,
    );
    expect(errors).not.toHaveBeenCalled();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('draws no lead for one that is only whitespace, where it would read as a lone stop', () => {
    const { container } = render(
      <ScrollTable
        caption="Blank lead"
        columns={['Row', 'Cell']}
        rows={[['R', { lead: '  ', text: 'Text' }]]}
      />,
    );
    expect(container.querySelector('td')?.textContent).toBe('Text');
    expect(cellText({ lead: '  ', text: 'Text' })).toBe('Text');
  });
});

describe('the tables the site renders', () => {
  it.each(TABLES)('%s: one cell per column in every row, each row headed once', (_, table) => {
    expect(table.caption.trim()).not.toBe('');
    expect(table.columns.length).toBeGreaterThanOrEqual(2);
    expect(table.rows.length).toBeGreaterThan(0);
    for (const row of table.rows) {
      expect(row, `the row "${row[0]}"`).toHaveLength(table.columns.length);
      expect(row[0].trim(), 'a row header').not.toBe('');
      for (const cell of row.slice(1)) {
        expect(cellText(cell).trim(), `a cell of the row "${row[0]}"`).not.toBe('');
      }
    }
    // A reader moves between rows by their headers, so two rows with one name could not be told
    // apart. (React keys the rows by position, so this is about reading, not rendering.)
    const headers = table.rows.map(([header]) => header);
    expect(new Set(headers).size, 'row headers are unique').toBe(headers.length);
  });

  it.each(TABLES)('%s renders every cell as its twin reads it', (_, table) => {
    const { container } = render(<ScrollTable {...table} />);
    const served = [...container.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map(readText),
    );
    expect(served).toEqual(
      table.rows.map(([header, ...cells]) => [header, ...cells.map(cellText)]),
    );
  });

  it('asSentence ends a lead once', () => {
    expect(asSentence('Shipped it')).toBe('Shipped it.');
    expect(asSentence('Shipped it.')).toBe('Shipped it.');
    expect(asSentence('Shipped it?')).toBe('Shipped it?');
    // A closing quote or bracket after the stop still ends the sentence.
    expect(asSentence('He said "ship it."')).toBe('He said "ship it."');
    expect(asSentence('(as measured.)')).toBe('(as measured.)');
    expect(asSentence('She said “done!”')).toBe('She said “done!”');
    // A trailing comma, colon or semicolon gives way to the stop.
    expect(asSentence('What changed:')).toBe('What changed.');
    expect(asSentence('one; ')).toBe('one.');
  });

  // Literal rows, not built from cellText(): a regression in how a cell reads (a join, a dropped
  // lead) would change the page, the twin and an expectation built from the same code together.
  it.each<[string, Table, number, string[]]>([
    [
      '/about timeline',
      timelineTable,
      2,
      [
        '2016',
        'Full-Stack Developer → Tech Lead',
        'Various',
        'First microservices migration, first cloud deployment, first gray hairs. The years that taught me everything breaks eventually—and how to build systems that break gracefully. Migrated monoliths to microservices. Learned why "it works on my machine" is a confession, not an excuse.',
      ],
    ],
    [
      '/skills toolkit',
      toolkitTable,
      0,
      [
        'AI & Agents',
        'Building AI that actually works in production',
        'Claude Code, Claude Agent SDK, LLM Orchestration, Prompt Engineering, AI Guardrails',
      ],
    ],
    [
      'self-healing-agent tech stack',
      techStackTable(caseStudies.find(({ slug }) => slug === 'self-healing-agent')!),
      2,
      ['AI', 'Claude Agent SDK, Anthropic API'],
    ],
  ])('%s row %i reads, word for word, as written', (_, table, index, expected) => {
    const { container } = render(<ScrollTable {...table} />);
    const row = container.querySelectorAll('tbody tr')[index];
    expect([...row.children].map(readText)).toEqual(expected);
  });
});
