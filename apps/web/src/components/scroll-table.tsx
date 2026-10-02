import { asSentence } from '@/data/pages/table';
import type { DecoratedCell, Table, TableCell } from '@/data/pages/types';

/**
 * A data table that scrolls sideways inside its own region rather than widening the page (#58): the
 * case-study tech stacks, the /about quick facts and timeline, and the /skills toolkit. A server
 * component, with no state of its own.
 *
 * The caption names the table, and the region it scrolls in carries the same name, because a
 * keyboard user has to be able to reach a scrolling box to scroll it: the region is a tab stop with
 * the shared focus ring, as the code sample on `/` is (`execution-phase.tsx`). Every column has a
 * `th scope="col"` and every row a `th scope="row"`, so a screen reader announces both headers with
 * each cell. A cell's text is the twin's (`cellText()` in `data/pages/table.ts`): a list is drawn
 * as chips and read, and copied, as one comma-separated list, a lead is set on a line of its own,
 * and an icon is drawn but hidden from assistive technology.
 */
interface ScrollTableProps extends Table {
  /**
   * Lays the table out at least 40rem wide. A table of several prose columns would otherwise squeeze
   * each one to a word a line on a phone; this one scrolls inside its region instead.
   */
  wide?: boolean;
}

export function ScrollTable({ caption, columns, rows, wide = false }: ScrollTableProps) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      // `relative`: the region contains the chips' absolutely positioned `sr-only` separators, so
      // they scroll and clip with the table instead of widening the page on a phone.
      className="focus-ring relative overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]"
    >
      <table
        className={
          wide
            ? 'w-full min-w-[40rem] border-collapse text-left text-sm'
            : 'w-full border-collapse text-left text-sm'
        }
      >
        <caption className="px-5 pt-4 pb-2 text-left text-sm font-semibold">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--border)]">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-5 py-3 font-mono text-xs font-medium tracking-wider whitespace-nowrap text-[var(--muted)] uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([header, ...cells]) => (
            <tr key={header} className="border-t border-[var(--border)] align-top first:border-t-0">
              <th scope="row" className="px-5 py-4 font-semibold">
                {header}
              </th>
              {cells.map((cell, index) => (
                <td key={columns[index + 1] ?? index} className="px-5 py-4">
                  <Cell cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell }: { cell: TableCell }) {
  if (typeof cell === 'string') return cell;
  if ('text' in cell) return <Decorated cell={cell} />;
  return (
    <span className="flex flex-wrap gap-2">
      {cell.map((item, index) => (
        <span
          key={item}
          className="rounded bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent-text)]"
        >
          {item}
          {/* The chips are drawn apart; read, or copied, they are one list. */}
          {index < cell.length - 1 ? <span className="sr-only">, </span> : null}
        </span>
      ))}
    </span>
  );
}

function Decorated({ cell: { icon, lead, text } }: { cell: DecoratedCell }) {
  return (
    <>
      {/* Decoration: the text beside it says what it means, so it is not read out. */}
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {icon ? ' ' : null}
      {lead ? (
        <span className="mb-1 block font-medium text-[var(--accent-text)]">{asSentence(lead)}</span>
      ) : null}
      {lead ? ' ' : null}
      <span className={lead ? 'text-[var(--muted)]' : undefined}>{text}</span>
    </>
  );
}
