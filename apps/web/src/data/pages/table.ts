import type { Table, TableCell } from './types';

/**
 * How a table cell reads as text (#58): what `components/scroll-table.tsx` puts in front of a
 * reader, less its decoration, and what the Markdown twin writes in the cell. Both read it from
 * here, so the page and the twin cannot word a cell differently.
 */

/**
 * `text` ending as a sentence: a full stop added unless it already ends in one. A closing quote or
 * bracket after the stop still counts as an ending (`said "done."`), and a trailing comma, colon or
 * semicolon gives way to the full stop rather than sit before it.
 */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  if (/[.!?…]["'”’)\]]*$/.test(trimmed)) return trimmed;
  return `${trimmed.replace(/[,:;]+$/, '')}.`;
}

/** A cell's lead, or nothing when it is absent or only whitespace, which would read as a lone `.`. */
export function leadOf(cell: { lead?: string }): string | undefined {
  const lead = cell.lead?.trim();
  return lead ? asSentence(lead) : undefined;
}

/**
 * A cell's text: a list joined with `, `, as its chips read aloud; a lead as a sentence before the
 * text; an icon left out.
 */
export function cellText(cell: TableCell): string {
  if (typeof cell === 'string') return cell;
  if ('text' in cell) {
    const lead = leadOf(cell);
    return lead ? `${lead} ${cell.text}` : cell.text;
  }
  return cell.join(', ');
}

/**
 * Whether a table is laid out at least 40rem wide and scrolls sideways inside a region the keyboard
 * can reach: one of more than two columns, which on a phone would otherwise squeeze each column to a
 * word a line. A two-column table wraps inside the page's width instead, so it is not a scroller
 * and not a tab stop.
 */
export function isWideTable({ columns }: Pick<Table, 'columns'>): boolean {
  return columns.length > 2;
}
