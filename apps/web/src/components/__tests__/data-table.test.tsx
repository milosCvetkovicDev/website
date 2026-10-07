import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, techStackTable } from '@/data/case-studies';
import { factsTable, timelineTable } from '@/data/pages/about';
import { toolkitTable } from '@/data/pages/skills';
import { asSentence, cellText, isWideTable } from '@/data/pages/table';
import type { DecoratedCell, Table } from '@/data/pages/types';
import { DataTable } from '../data-table';

/**
 * The data tables of #58: the case-study tech stacks, the /about quick facts and timeline, and the
 * /skills toolkit, all rendered by `DataTable`. A table is named by its caption and has a header
 * cell for every column and one for every row; below 640px a wide one stacks each row into a block
 * rather than scrolling sideways (the owner's decision on #226), keeping its table roles. A cell
 * reads as `cellText()` says, less its decoration, which is what the Markdown twin writes, so the
 * page and the twin say the same thing. `e2e/seo-surface.spec.ts` checks the same of the served
 * HTML, the e2e accessibility gates run axe's table rules over it on a desktop and on a phone, and
 * `e2e/mobile/tables.spec.ts` and `e2e/table-layout.spec.ts` measure the two layouts.
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

/** Two columns: wraps inside the page at every width, so it never stacks. */
const NARROW: Table = {
  caption: 'A narrow table',
  columns: ['Fact', 'Figure'],
  rows: [['Teams led', '4']],
};

describe('DataTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the table by its caption and heads every column and every row', () => {
    const { container, getByRole } = render(<DataTable {...FIXTURE} />);
    const table = container.querySelector('table');
    if (!table) throw new Error('DataTable must render a table');

    expect(table.caption?.textContent).toBe(FIXTURE.caption);
    // Named through `aria-labelledby` as well as natively, so the name holds where the stacked
    // layout's `display` drops the caption's own role.
    expect(table.getAttribute('aria-labelledby')).toBe(table.caption?.getAttribute('id'));
    expect(getByRole('table', { name: FIXTURE.caption })).toBe(table);
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
      expect(first.textContent?.trim()).toBe(FIXTURE.rows[index][0]);
      expect(rest.map((cell) => cell.localName)).toEqual(FIXTURE.columns.slice(1).map(() => 'td'));
    });
  });

  it.each([
    ['a wide table', FIXTURE],
    ['a narrow table', NARROW],
  ])('draws %s in a plain box: not a region, not a tab stop, not a scroller', (_, table) => {
    const { container, queryByRole } = render(<DataTable {...table} />);
    expect(queryByRole('region')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
    const box = container.querySelector('table')?.parentElement;
    expect(box?.localName).toBe('div');
    expect(box?.attributes.length, 'the box carries a class and nothing else').toBe(1);
    // Nothing scrolls, so nothing needs a scroller, a focus ring, a minimum width or a pinned
    // header: #226's region went with the owner's decision to stack the rows on a phone.
    expect(container.innerHTML).not.toMatch(
      /\boverflow-(x-)?(auto|scroll)\b|\bfocus-ring\b|\bmin-w-|\bsticky\b/,
    );
  });

  it('reads each cell as cellText() writes it for the twin, with its icon hidden', () => {
    const { container } = render(<DataTable {...FIXTURE} />);
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

  it('gives every element of a table its ARIA role, which outlasts a change of display', () => {
    for (const table of [FIXTURE, NARROW]) {
      const { container, unmount } = render(<DataTable {...table} />);
      const element = container.querySelector('table')!;
      const roles = (selector: string) =>
        [...element.querySelectorAll(selector)].map((node) => node.getAttribute('role'));
      expect(element.getAttribute('role')).toBe('table');
      expect(roles(':scope > thead, :scope > tbody')).toEqual(['rowgroup', 'rowgroup']);
      expect(roles('tr')).toEqual(table.rows.map(() => 'row').concat('row'));
      expect(roles('thead th')).toEqual(table.columns.map(() => 'columnheader'));
      expect(roles('tbody th')).toEqual(table.rows.map(() => 'rowheader'));
      expect(roles('td')).toEqual(table.rows.flatMap(([, ...cells]) => cells.map(() => 'cell')));
      // The scopes stay, for whatever reads the markup rather than the roles.
      expect(
        new Set([...element.querySelectorAll('thead th')].map((th) => th.getAttribute('scope'))),
      ).toEqual(new Set(['col']));
      unmount();
    }
  });

  it('stacks each row of a wide table into a block below 640px, and leaves a narrow one alone', () => {
    expect(isWideTable(FIXTURE)).toBe(true);
    expect(isWideTable(NARROW)).toBe(false);
    const classes = (element: Element | null | undefined) => element?.className.split(/\s+/) ?? [];

    const { container, rerender } = render(<DataTable {...FIXTURE} />);
    const table = container.querySelector('table')!;
    expect(classes(table)).toContain('max-sm:block');
    expect(classes(table.caption)).toContain('max-sm:block');
    // The column header row is hidden from sight there, and only from sight.
    expect(classes(table.tHead)).toEqual(['max-sm:sr-only']);
    expect(classes(table.tBodies[0])).toContain('max-sm:block');
    for (const row of table.tBodies[0]!.rows) {
      expect(classes(row)).toContain('max-sm:block');
      const [header, first, ...rest] = [...row.cells];
      // The header and the first cell run on as one line, the rest each take a line of their own.
      expect(classes(header)).toContain('max-sm:inline');
      expect(classes(first)).toContain('max-sm:inline');
      for (const cell of rest) expect(classes(cell)).toContain('max-sm:block');
    }

    rerender(<DataTable {...NARROW} />);
    // A narrow table never stacks: below 640px only its column headers change, wrapping their names
    // and breaking a word too long for the line, as a wide table's (hidden there) do too.
    const columnHeaders = [...container.querySelectorAll('th[scope="col"]')];
    for (const header of columnHeaders) {
      expect(classes(header).filter((name) => name.startsWith('max-sm:'))).toEqual([
        'max-sm:wrap-anywhere',
        'max-sm:whitespace-normal',
      ]);
      header.remove();
    }
    expect(columnHeaders).toHaveLength(NARROW.columns.length);
    expect(container.innerHTML).not.toContain('max-sm:');
  });

  it("joins a stacked row's header to its first cell with a dot no one reads, copies or parses", () => {
    const { container } = render(<DataTable {...FIXTURE} />);
    // Generated content with empty alternative text: drawn, but not in the document, the
    // accessible name or a selection. A browser without that syntax drops the declaration and
    // draws no dot, and the space below still keeps the two apart.
    for (const [index, header] of container.querySelectorAll('tbody th').entries()) {
      expect(header.className.split(/\s+/)).toContain("max-sm:after:content-['·_'/'']");
      // The row's header and a real space after it, so the line copies as "First plain text".
      expect(header.textContent).toBe(`${FIXTURE.rows[index]![0]} `);
    }
    expect(container.textContent).not.toContain('·');
    // A narrow table never stacks, so its headers carry neither.
    const narrow = render(<DataTable {...NARROW} />).container.querySelector('tbody th');
    expect(narrow?.textContent).toBe(NARROW.rows[0][0]);
    expect(narrow?.className).not.toContain('content-');
  });

  it('types a cell with an icon or a lead, never both, which would leave the icon on its own line', () => {
    // @ts-expect-error: an icon and a lead in one cell is not a DecoratedCell.
    const both: DecoratedCell = { icon: '🧪', lead: 'A lead', text: 'Text' };
    expect(both.text).toBe('Text');
  });

  it('renders without a React warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DataTable {...FIXTURE} />);
    expect(errors).not.toHaveBeenCalled();
  });

  it('renders rows that share a header, and a list that repeats an entry, without a key warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <DataTable
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

  it.each([
    ['only whitespace', '  '],
    ['only a colon', ' : '],
    ['only the punctuation a stop replaces', ',; '],
  ])('draws no lead that is %s, where it would read as a lone stop', (_, lead) => {
    const { container } = render(
      <DataTable
        caption="Blank lead"
        columns={['Row', 'Cell']}
        rows={[['R', { lead, text: 'Text' }]]}
      />,
    );
    expect(container.querySelector('td')?.textContent).toBe('Text');
    expect(cellText({ lead, text: 'Text' })).toBe('Text');
  });

  it('draws no icon that is only whitespace, which would leave a stray space before the text', () => {
    const { container } = render(
      <DataTable
        caption="Blank icon"
        columns={['Row', 'Cell']}
        rows={[['R', { icon: ' ', text: 'Text' }]]}
      />,
    );
    const cell = container.querySelector('td')!;
    expect(cell.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(cell.textContent).toBe('Text');
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
    const { container } = render(<DataTable {...table} />);
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
  it.each<[string, number, Table, string[]]>([
    [
      '/about timeline',
      2,
      timelineTable,
      [
        '2016',
        'Full-Stack Developer → Tech Lead',
        'Various',
        'First microservices migration, first cloud deployment, first gray hairs. The years that taught me everything breaks eventually—and how to build systems that break gracefully. Migrated monoliths to microservices. Learned why "it works on my machine" is a confession, not an excuse.',
      ],
    ],
    [
      '/skills toolkit',
      0,
      toolkitTable,
      [
        'AI & Agents',
        'Building AI that actually works in production',
        'Claude Code, Claude Agent SDK, LLM Orchestration, Prompt Engineering, AI Guardrails',
      ],
    ],
    [
      'self-healing-agent tech stack',
      2,
      techStackTable(caseStudies.find(({ slug }) => slug === 'self-healing-agent')!),
      ['AI', 'Claude Agent SDK, Anthropic API'],
    ],
  ])('%s row %i reads, word for word, as written', (_, index, table, expected) => {
    const { container } = render(<DataTable {...table} />);
    const row = container.querySelectorAll('tbody tr')[index];
    expect([...row.children].map(readText)).toEqual(expected);
  });
});
