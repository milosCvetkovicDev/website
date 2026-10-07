import { useId } from 'react';
import { isWideTable, leadOf } from '@/data/pages/table';
import type { DecoratedCell, Table, TableCell } from '@/data/pages/types';

/**
 * A data table (#58): the case-study tech stacks, the /about quick facts and timeline, and the
 * /skills toolkit. A server component, with no state of its own, and nothing in it scrolls.
 *
 * The caption names the table. Every column has a `th scope="col"` and every row a
 * `th scope="row"`, so a screen reader announces both headers with each cell. A cell's text is the
 * twin's (`cellText()` in `data/pages/table.ts`): a list is drawn as chips and read, and copied, as
 * one comma-separated list, a lead is set on a line of its own, and an icon is drawn but hidden
 * from assistive technology.
 *
 * A table of more than two columns (`isWideTable()`: the quick facts, the timeline and the toolkit)
 * is a grid from Tailwind's `sm` (640px) up and below it stacks each row into a block, as the owner
 * chose on #226 (2026-10-03): the row header and the first cell on one line, joined by a drawn
 * " · ", then each remaining cell on a line of its own, and the column header row hidden from sight
 * but not from assistive technology. The grid has no minimum width, so it fits its box at every
 * width it is drawn at: the timeline's narrowest is about 440px, and `/about` and `/skills` give a
 * table 590px at 640px (`e2e/table-layout.spec.ts`). A two-column table wraps inside the page at
 * every width and never stacks. Stacked, a word too long for its line breaks anywhere rather than
 * push the page sideways; the grids keep the browser's own breaking, since letting a word break
 * there would change how their columns share the width. A wide table's first cell must be text that
 * can run on after the header, and none of its cells may be blank, which `serialise.ts` checks of
 * every table the site renders.
 *
 * Changing the `display` of table elements drops their table semantics in WebKit, so every element
 * carries its role explicitly (`table`, `rowgroup`, `row`, `columnheader`, `rowheader`, `cell`), and
 * the table is named by `aria-labelledby` as well as by its caption. Every table has them, so the
 * markup has one shape. `e2e/mobile/tables.spec.ts` checks that the roles are there in every engine
 * and, on Chromium, that the platform accessibility tree still holds a table; what VoiceOver makes
 * of the stacked table in Safari is untested. The card is `relative`, so the boxes hidden from
 * sight (the stacked column header row, the chips' commas) are anchored inside it.
 */
export function DataTable({ caption, columns, rows }: Table) {
  const captionId = useId();
  const wide = isWideTable({ columns });
  // Each element's classes are whole strings, one for each layout, so the `max-sm:` variants
  // that stack a wide table are absent from a narrow one, and the class sorter can sort each.
  return (
    <div className="relative rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <table
        role="table"
        aria-labelledby={captionId}
        className={
          wide
            ? 'w-full border-collapse text-left text-sm max-sm:block max-sm:wrap-anywhere'
            : 'w-full border-collapse text-left text-sm'
        }
      >
        {/* A label under the section's heading, not a second heading: quieter than the h2. */}
        <caption
          id={captionId}
          className={
            wide
              ? 'px-5 pt-4 pb-2 text-left font-mono text-xs tracking-wider text-[var(--muted)] max-sm:block'
              : 'px-5 pt-4 pb-2 text-left font-mono text-xs tracking-wider text-[var(--muted)]'
          }
        >
          {caption}
        </caption>
        {/* Stacked, the rows name what they hold by their order, so the column headers are read
            with each cell but not drawn. */}
        <thead role="rowgroup" className={wide ? 'max-sm:sr-only' : undefined}>
          <tr role="row" className="border-b border-[var(--border)]">
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                role="columnheader"
                className="px-5 py-3 font-mono text-xs font-medium tracking-wider whitespace-nowrap text-[var(--muted)] uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className={wide ? 'max-sm:block' : undefined}>
          {/* Keyed by position: the rows are static, and two rows may share a header's text. */}
          {rows.map(([header, ...cells], row) => (
            <tr
              key={row}
              role="row"
              className={
                wide
                  ? 'border-t border-[var(--border)] align-top first:border-t-0 max-sm:block max-sm:px-5 max-sm:py-4'
                  : 'border-t border-[var(--border)] align-top first:border-t-0'
              }
            >
              {/* Stacked, the header runs on into the first cell. The dot between them is generated
                  content with empty alternative text: drawn, but not in the document, so neither
                  the twin, a parser, a screen reader nor a copy gets it. The space after the header
                  is real, so the line copies as "2025 AI-Native Engineer", and it still parts the
                  two in a browser that drops the declaration for its alternative-text syntax. */}
              <th
                scope="row"
                role="rowheader"
                className={
                  wide
                    ? "px-5 py-4 font-semibold max-sm:inline max-sm:p-0 max-sm:after:content-['·_'/'']"
                    : 'px-5 py-4 font-semibold'
                }
              >
                {header}
                {wide ? ' ' : null}
              </th>
              {cells.map((cell, index) => (
                <td
                  key={index}
                  role="cell"
                  className={
                    !wide
                      ? 'px-5 py-4'
                      : index === 0
                        ? 'px-5 py-4 max-sm:inline max-sm:p-0'
                        : 'px-5 py-4 max-sm:mt-2 max-sm:block max-sm:p-0'
                  }
                >
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
  const { text } = cell;
  // An icon of only whitespace would draw nothing and leave a stray space before the text.
  const icon = cell.icon?.trim();
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
