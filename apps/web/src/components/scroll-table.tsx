import { useId } from 'react';
import { isWideTable, leadOf } from '@/data/pages/table';
import type { DecoratedCell, Table, TableCell } from '@/data/pages/types';

/**
 * A data table that scrolls sideways inside its own region rather than widening the page (#58): the
 * case-study tech stacks, the /about quick facts and timeline, and the /skills toolkit. A server
 * component, with no state of its own.
 *
 * The caption names the table. A table of more than two columns (`isWideTable()`) is laid out at
 * least 40rem wide and scrolls inside a region named by that caption, because a keyboard user has
 * to be able to reach a scrolling box to scroll it: the region is a tab stop with the shared focus
 * ring, as the code sample on `/` is (`execution-phase.tsx`), and its row headers stay pinned while
 * the rest scrolls under them. A two-column table wraps inside the page instead, so it is neither a
 * region nor a tab stop; `e2e/mobile/layout-overflow.spec.ts` proves it never overflows on a phone.
 * Every column has a `th scope="col"` and every row a `th scope="row"`, so a screen reader announces
 * both headers with each cell. A cell's text is the twin's (`cellText()` in `data/pages/table.ts`):
 * a list is drawn as chips and read, and copied, as one comma-separated list, a lead is set on a
 * line of its own, and an icon is drawn but hidden from assistive technology.
 */
export function ScrollTable({ caption, columns, rows }: Table) {
  const captionId = useId();
  const wide = isWideTable({ columns });
  return (
    <div
      // The region takes its name from the caption, so the name has one source and is not read
      // twice over as "X region, X table" from two copies.
      {...(wide ? { role: 'region', 'aria-labelledby': captionId, tabIndex: 0 } : {})}
      // `relative`: the region contains the chips' absolutely positioned `sr-only` separators, so
      // they scroll and clip with the table instead of widening the page on a phone.
      // Two whole class strings: the Tailwind class sorter trims the space a template would need.
      className={
        wide
          ? 'focus-ring relative overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]'
          : 'relative overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]'
      }
    >
      <table
        className={
          wide
            ? 'w-full min-w-160 border-collapse text-left text-sm'
            : 'w-full border-collapse text-left text-sm'
        }
      >
        {/* A label under the section's heading, not a second heading: quieter than the h2. */}
        <caption
          id={captionId}
          className="px-5 pt-4 pb-2 text-left font-mono text-xs tracking-wider text-[var(--muted)]"
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)]">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="px-5 py-3 font-mono text-xs font-medium tracking-wider whitespace-nowrap text-[var(--muted)] uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Keyed by position: the rows are static, and two rows may share a header's text. */}
          {rows.map(([header, ...cells], row) => (
            <tr key={row} className="border-t border-[var(--border)] align-top first:border-t-0">
              {/* Pinned on the card's solid surface while a wide table scrolls, so a cell is never
                  left without its row's name, and axe can still measure the header's contrast. */}
              <th scope="row" className="sticky left-0 bg-[var(--card)] px-5 py-4 font-semibold">
                {header}
              </th>
              {cells.map((cell, index) => (
                <td key={index} className="px-5 py-4">
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
          key={index}
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

function Decorated({ cell }: { cell: DecoratedCell }) {
  const { icon, text } = cell;
  const lead = leadOf(cell);
  return (
    <>
      {/* Decoration: the text beside it says what it means, so it is not read out. */}
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {icon ? ' ' : null}
      {lead ? (
        <span className="mb-1 block font-medium text-[var(--accent-text)]">{lead}</span>
      ) : null}
      {lead ? ' ' : null}
      <span className={lead ? 'text-[var(--muted)]' : undefined}>{text}</span>
    </>
  );
}
