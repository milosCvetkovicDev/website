import type { Page } from '@playwright/test';
import { caseStudies, techStackTable } from '../../src/data/case-studies';
import { aboutRecord } from '../../src/data/pages/about';
import { skillsRecord } from '../../src/data/pages/skills';
import { cellText } from '../../src/data/pages/table';
import type { PageRecord, Table } from '../../src/data/pages/types';
import { caseStudyRoute } from '../routes';

/**
 * The data tables the site serves (#58), read from the records the page and its Markdown twin both
 * render: a route's tables, in page order, and each one as the served HTML reads once parsed.
 * Shared by `seo-surface.spec.ts`, which checks the markup, `accessibility.spec.ts` and
 * `mobile/accessibility.spec.ts`, which run axe's table rules on these routes,
 * `table-layout.spec.ts`, which checks the layout from 640px up, and `mobile/tables.spec.ts` and
 * `mobile/layout-overflow.spec.ts`, which check that on a phone a wide table stacks its rows and no
 * table widens the page.
 */

const tablesOf = (record: PageRecord): Table[] =>
  record.sections.filter((section) => section.kind === 'table');

/** Every route that serves a table, with its tables in page order. */
export const TABLES: Readonly<Record<string, readonly Table[]>> = {
  '/about': tablesOf(aboutRecord),
  '/skills': tablesOf(skillsRecord),
  ...Object.fromEntries(
    caseStudies.map((study) => [caseStudyRoute(study.slug), [techStackTable(study)]]),
  ),
};

/**
 * The width below which a table of more than two columns stacks each row into a block (the owner's
 * decision on #226, 2026-10-03): Tailwind's `sm`, 40rem, the breakpoint of the `max-sm:` variants in
 * `components/data-table.tsx`. From here up it is a grid, which fits its box at every width because
 * it has no minimum width of its own: its narrowest, 440px for the timeline, fits the 590px box
 * `/about` and `/skills` give it at 640px.
 */
export const STACKED_BELOW = 640;

/**
 * The axe rules a data table must pass, and which of them each table route must pass on at least
 * one node, derived from `TABLES`, so a route that gains a table gains these checks with it (and
 * `seo-surface.spec.ts` fails a route that serves a table `TABLES` does not list). Every table rule
 * must also have run there, which is what proves it was selected: `td-has-header` and
 * `table-fake-caption` are switched on in the shared options, and `th-has-data-cells` comes in with
 * the `wcag2a` tag. `td-has-header` applies only to a table of at least three rows by three columns
 * (axe's `data-table-large-matches`), so it can pass only where the career timeline and the toolkit
 * are; a case study's tech stack, two columns wide, leaves it inapplicable. Shared by the desktop
 * gate and the phone pass, which audits the stacked layout.
 */
export const TABLE_RULES = ['td-has-header', 'th-has-data-cells', 'table-fake-caption'] as const;
export const TABLE_RULES_PASSING: Readonly<
  Record<string, readonly (typeof TABLE_RULES)[number][]>
> = Object.fromEntries(
  Object.entries(TABLES).map(([route, tables]) => [
    route,
    tables.some(({ columns, rows }) => columns.length >= 3 && rows.length >= 3)
      ? TABLE_RULES
      : TABLE_RULES.filter((rule) => rule !== 'td-has-header'),
  ]),
);

/**
 * A table as a parser reads it, with the box around it. `label` is the text of the element the
 * table's `aria-labelledby` names, and every `role` is an explicit one, as served: the stacked
 * layout changes the display of a wide table's elements, which drops their table semantics in
 * WebKit, so each carries its role in the markup.
 */
export interface ServedTable {
  caption: string | null;
  label: string | null;
  role: string | null;
  /** The box around the table: never a region, never a tab stop, never a scroller. */
  box: { role: string | null; tabindex: string | null; scrolls: boolean };
  /** The roles of the table's row groups, `thead` then `tbody`. */
  rowgroups: (string | null)[];
  head: {
    role: string | null;
    columns: { scope: string | null; role: string | null; text: string }[];
  };
  rows: {
    role: string | null;
    header: { tag: string; scope: string | null; role: string | null; text: string };
    cells: { role: string | null; text: string }[];
  }[];
}

/**
 * Every table inside `main#main-content` of `html`, parsed by the browser's `DOMParser`, which runs
 * no script: what a crawler that reads tables gets. A cell's text leaves out anything under
 * `aria-hidden`, the decoration the twin leaves out too, with whitespace collapsed.
 */
export async function servedTables(page: Page, html: string): Promise<ServedTable[]> {
  return page.evaluate((markup) => {
    const main = new DOMParser()
      .parseFromString(markup, 'text/html')
      .querySelector('main#main-content');
    const text = (element: Element | null) => {
      if (!element) return '';
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    const role = (element: Element | null | undefined) => element?.getAttribute('role') ?? null;
    return [...(main?.querySelectorAll('table') ?? [])].map((table) => {
      const box = table.parentElement;
      const labelledBy = table.getAttribute('aria-labelledby');
      const headRow = table.tHead?.rows[0];
      return {
        caption: table.caption ? text(table.caption) : null,
        label: labelledBy ? text(table.ownerDocument.getElementById(labelledBy)) : null,
        role: role(table),
        box: {
          role: role(box),
          tabindex: box?.getAttribute('tabindex') ?? null,
          // A class, since the parsed document has no styles: the scroller #226 drew with.
          scrolls: [...(box?.classList ?? [])].some((name) =>
            /^overflow-(x-)?(auto|scroll)$/.test(name),
          ),
        },
        rowgroups: [table.tHead, ...table.tBodies].map(role),
        head: {
          role: role(headRow),
          columns: [...(headRow?.cells ?? [])].map((th) => ({
            scope: th.getAttribute('scope'),
            role: role(th),
            text: text(th),
          })),
        },
        rows: [...table.tBodies].flatMap((body) =>
          [...body.rows].map((row) => {
            const [first, ...rest] = [...row.cells];
            return {
              role: role(row),
              header: {
                tag: first?.localName ?? '',
                scope: first?.getAttribute('scope') ?? null,
                role: role(first),
                text: text(first ?? null),
              },
              cells: rest.map((cell) => ({ role: role(cell), text: text(cell) })),
            };
          }),
        ),
      };
    });
  }, html);
}

/** Whitespace collapsed and trimmed, as `servedTables()` reads the served text. */
const collapsed = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The table a record describes, in the shape `servedTables()` reads a served one: named by its
 * caption, in a plain box, every element carrying its table role, every column and every row headed.
 */
export function expectedTable(table: Table): ServedTable {
  const { caption, columns, rows } = table;
  return {
    caption: collapsed(caption),
    label: collapsed(caption),
    role: 'table',
    box: { role: null, tabindex: null, scrolls: false },
    rowgroups: ['rowgroup', 'rowgroup'],
    head: {
      role: 'row',
      columns: columns.map((text) => ({
        scope: 'col',
        role: 'columnheader',
        text: collapsed(text),
      })),
    },
    rows: rows.map(([header, ...cells]) => ({
      role: 'row',
      header: { tag: 'th', scope: 'row', role: 'rowheader', text: collapsed(header) },
      cells: cells.map((cell) => ({ role: 'cell', text: collapsed(cellText(cell)) })),
    })),
  };
}
