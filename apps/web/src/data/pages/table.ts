import type { TableCell } from './types';

/**
 * How a table cell reads as text (#58): what `components/scroll-table.tsx` puts in front of a
 * reader, less its decoration, and what the Markdown twin writes in the cell. Both read it from
 * here, so the page and the twin cannot word a cell differently.
 */

/** `text` ending as a sentence: a full stop added unless it already ends in one. */
export function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * A cell's text: a list joined with `, `, as its chips read aloud; a lead as a sentence before the
 * text; an icon left out.
 */
export function cellText(cell: TableCell): string {
  if (typeof cell === 'string') return cell;
  if ('text' in cell) return cell.lead ? `${asSentence(cell.lead)} ${cell.text}` : cell.text;
  return cell.join(', ');
}
