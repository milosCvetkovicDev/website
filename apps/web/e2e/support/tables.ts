import type { Page } from '@playwright/test';
import { caseStudies, techStackTable } from '../../src/data/case-studies';
import { aboutRecord } from '../../src/data/pages/about';
import { skillsRecord } from '../../src/data/pages/skills';
import { cellText, isWideTable } from '../../src/data/pages/table';
import type { PageRecord, Table } from '../../src/data/pages/types';
import { caseStudyRoute } from '../routes';

/**
 * The data tables the site serves (#58), read from the records the page and its Markdown twin both
 * render: a route's tables, in page order, and each one as the served HTML reads once parsed.
 * Shared by `seo-surface.spec.ts`, which checks the markup, `accessibility.spec.ts`, which runs
 * axe's table rules on these routes, and `mobile/layout-overflow.spec.ts`, which checks that a wide
 * table scrolls inside its region and a narrow one fits, rather than either widening the page.
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
 * A table as a parser reads it, with the box around it: for a wide table, the region it scrolls in,
 * whose `label` is the text of the element its `aria-labelledby` names.
 */
export interface ServedTable {
  caption: string | null;
  region: { role: string | null; tabindex: string | null; label: string | null; scrolls: boolean };
  columns: { scope: string | null; text: string }[];
  rows: { header: { tag: string; scope: string | null; text: string }; cells: string[] }[];
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
    return [...(main?.querySelectorAll('table') ?? [])].map((table) => {
      const region = table.parentElement;
      const labelledBy = region?.getAttribute('aria-labelledby');
      return {
        caption: table.caption ? text(table.caption) : null,
        region: {
          role: region?.getAttribute('role') ?? null,
          tabindex: region?.getAttribute('tabindex') ?? null,
          label: labelledBy ? text(table.ownerDocument.getElementById(labelledBy)) : null,
          scrolls: region?.classList.contains('overflow-x-auto') ?? false,
        },
        columns: [...table.querySelectorAll('thead th')].map((th) => ({
          scope: th.getAttribute('scope'),
          text: text(th),
        })),
        rows: [...table.querySelectorAll('tbody tr')].map((row) => {
          const [first, ...rest] = [...row.children];
          return {
            header: {
              tag: first?.localName ?? '',
              scope: first?.getAttribute('scope') ?? null,
              text: text(first ?? null),
            },
            cells: rest.map(text),
          };
        }),
      };
    });
  }, html);
}

/** Whitespace collapsed and trimmed, as `servedTables()` reads the served text. */
const collapsed = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The table a record describes, in the shape `servedTables()` reads a served one. A wide table
 * (`isWideTable()`) sits in a keyboard-reachable region named by its caption; a narrow one in a
 * plain box that is neither.
 */
export function expectedTable(table: Table): ServedTable {
  const { caption, columns, rows } = table;
  const wide = isWideTable(table);
  return {
    caption: collapsed(caption),
    region: {
      role: wide ? 'region' : null,
      tabindex: wide ? '0' : null,
      label: wide ? collapsed(caption) : null,
      scrolls: true,
    },
    columns: columns.map((text) => ({ scope: 'col', text: collapsed(text) })),
    rows: rows.map(([header, ...cells]) => ({
      header: { tag: 'th', scope: 'row', text: collapsed(header) },
      cells: cells.map((cell) => collapsed(cellText(cell))),
    })),
  };
}
