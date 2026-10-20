import Link from 'next/link';
import type { Inline, PostBlock } from '@/data/posts';
import { linkKind } from '@/lib/links';
import { DataTable } from './data-table';

/**
 * A post's body, block by block, as plain elements (#61, ADR 0028). A server component with no
 * client state: nothing here needs the browser, and a heading split into per-character spans
 * reads one letter at a time to an extractor (#47), so every string renders whole, as written.
 *
 * Colour follows ADR 0011: links are `--accent-text` and underlined, so a link inside a run of text
 * is told apart by more than its colour; the accent paints only the quote's rule; nothing is dimmed
 * with an opacity step. A code block scrolls sideways inside its own region, which takes focus so a
 * keyboard can scroll it, and the page itself never scrolls sideways on a phone.
 */

const LINK_CLASS = 'text-[var(--accent-text)] underline underline-offset-4';
const INLINE_CODE_CLASS =
  'rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 font-mono text-[0.9em]';

/** A run of inline pieces: text as written, code, and links through the router when on-site. */
function Pieces({ content }: { content: readonly Inline[] }) {
  return content.map((piece, index) => {
    if (typeof piece === 'string') return piece;
    if (piece.code !== undefined) {
      return (
        <code key={index} className={INLINE_CODE_CLASS}>
          {piece.code}
        </code>
      );
    }
    // `linkKind` throws at build time on anything but a site path or an http(s) URL.
    return linkKind(piece.href) === 'site' ? (
      <Link key={index} href={piece.href} className={LINK_CLASS}>
        {piece.text}
      </Link>
    ) : (
      <a key={index} href={piece.href} className={LINK_CLASS}>
        {piece.text}
      </a>
    );
  });
}

function Block({ block }: { block: PostBlock }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 2 ? (
        <h2 className="mt-12 mb-4 text-2xl font-semibold">{block.text}</h2>
      ) : (
        <h3 className="mt-8 mb-3 text-xl font-semibold">{block.text}</h3>
      );
    case 'paragraph':
      return (
        <p className="mb-6 text-lg leading-relaxed">
          <Pieces content={block.content} />
        </p>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List
          className={`mb-6 space-y-2 pl-6 text-lg leading-relaxed ${block.ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <Pieces content={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'code':
      // The figure is the scroll region: named, so a screen reader announces what took focus, and
      // focusable, so a keyboard can scroll a line wider than the page. `aria-label` belongs on the
      // figure; on the `pre`, a generic element, axe's aria-prohibited-attr would fail it.
      return (
        <figure
          tabIndex={0}
          aria-label={block.language ? `Code, ${block.language}` : 'Code'}
          className="mb-6 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <pre className="w-max min-w-full p-4 font-mono text-sm leading-relaxed">
            <code>{block.code}</code>
          </pre>
        </figure>
      );
    case 'quote':
      return (
        <blockquote className="mb-6 border-l-2 border-[var(--accent)] pl-4 text-lg leading-relaxed italic">
          <p>
            <Pieces content={block.content} />
          </p>
        </blockquote>
      );
    case 'table':
      // `DataTable` gives the caption, the column and row headers, and the stacked layout a table
      // of three or more columns takes on a phone (#226), where its column headers are hidden from
      // sight, as on every other page with a table.
      return (
        <div className="mb-6">
          <DataTable caption={block.caption} columns={block.columns} rows={block.rows} />
        </div>
      );
    default: {
      // A seventh `PostBlock` kind fails typecheck here until it has a renderer, rather than
      // returning nothing and dropping its block from the page.
      const unhandled: never = block;
      throw new Error(`PostBody: no renderer for ${JSON.stringify(unhandled)}`);
    }
  }
}

export function PostBody({ blocks }: { blocks: readonly PostBlock[] }) {
  return (
    <div data-post-body className="wrap-break-word">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
