import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PostBlock } from '@/data/posts';
import { everyBlockPost, hostileTitlePost } from '@/test/fixtures/posts';
import { PostBody } from '../post-body';

/**
 * A post's body, block by block (#61, 61b). The fixtures hold every block kind and every inline
 * kind; `src/data/__tests__/posts.test.ts` fails when one goes missing from them, so a kind this
 * renderer drops fails here.
 *
 * The page around it, and the dates, are `app/blog/__tests__/post-page.test.tsx`'s.
 */

const blocksOf = (kind: PostBlock['kind']) =>
  everyBlockPost.body.filter((block) => block.kind === kind);

function renderBody(blocks: readonly PostBlock[] = everyBlockPost.body) {
  const { container } = render(<PostBody blocks={blocks} />);
  const body = container.querySelector<HTMLElement>('[data-post-body]');
  if (!body) throw new Error('PostBody must render one element marked data-post-body');
  return body;
}

/** Every class name used anywhere under `root`, the root included. */
const classesUnder = (root: Element) =>
  [root, ...root.querySelectorAll('*')].flatMap((element) => [...element.classList]);

describe('PostBody', () => {
  it('renders one element per block, in order', () => {
    /** The element each block kind renders as. */
    const tagOf = (block: PostBlock): string => {
      switch (block.kind) {
        case 'heading':
          return `H${block.level}`;
        case 'paragraph':
          return 'P';
        case 'list':
          return block.ordered ? 'OL' : 'UL';
        case 'code':
          return 'FIGURE';
        case 'quote':
          return 'BLOCKQUOTE';
        case 'table':
          return 'DIV';
      }
    };
    const body = renderBody();
    expect([...body.children].map((element) => element.tagName)).toEqual(
      everyBlockPost.body.map(tagOf),
    );
  });

  it('keeps each heading at its level, under the page title', () => {
    const body = renderBody();
    // In order, by tag, so a fixture with two headings at one level still reads as one list.
    expect(
      [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => [h.tagName, h.textContent]),
    ).toEqual(
      blocksOf('heading').map((block) =>
        block.kind === 'heading' ? [`H${block.level}`, block.text] : [],
      ),
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('renders both list styles with one item per entry', () => {
    const body = renderBody();
    const lists = [...body.querySelectorAll(':scope > ul, :scope > ol')];
    const blocks = blocksOf('list');
    expect(lists).toHaveLength(blocks.length);
    blocks.forEach((block, index) => {
      if (block.kind !== 'list') return;
      expect(lists[index].tagName).toBe(block.ordered ? 'OL' : 'UL');
      expect(within(lists[index] as HTMLElement).getAllByRole('listitem')).toHaveLength(
        block.items.length,
      );
    });
  });

  it('renders inline code as code and each link to where it goes', () => {
    const body = renderBody();
    const inline = [...body.querySelectorAll(':not(pre) > code')].map((code) => code.textContent);
    expect(inline).toEqual(['buildPostIndex(posts)', 'inline code', 'code']);

    const links = within(body).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['the work page', '/work'],
      ['an external page', 'https://example.com/fixture?kind=link#inline'],
      ['A bullet item that is a link', '/blog'],
    ]);
    for (const link of links) {
      // ADR 0011: the accent as text is --accent-text, and a link inside a run of text needs more
      // than colour to tell it apart (axe's link-in-text-block).
      expect(link).toHaveClass('text-[var(--accent-text)]', 'underline');
    }
  });

  it('shows every string as written, never as markup', () => {
    const body = renderBody(hostileTitlePost.body);
    const [block] = hostileTitlePost.body;
    if (block.kind !== 'paragraph') throw new Error('the hostile fixture opens with a paragraph');
    expect(body.textContent).toBe(block.content.join(''));
    // One paragraph holding text alone: no element of any kind was made from the string.
    expect([...body.children].map((element) => element.tagName)).toEqual(['P']);
    expect(body.querySelectorAll('p *')).toHaveLength(0);
  });

  it('puts each code block in a keyboard-reachable scroll region of its own, as written', () => {
    const body = renderBody();
    const blocks = blocksOf('code');
    const regions = [...body.querySelectorAll<HTMLElement>(':scope > figure')];
    expect(regions).toHaveLength(blocks.length);
    blocks.forEach((block, index) => {
      if (block.kind !== 'code') return;
      const region = regions[index];
      // A long line scrolls inside the block, so a phone never scrolls the page sideways, and the
      // region takes focus so a keyboard can scroll it too (WCAG 2.1.1).
      expect(region).toHaveClass('overflow-x-auto');
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toHaveAccessibleName(block.language ? `Code, ${block.language}` : 'Code');
      // Line breaks and all: `pre` keeps the whitespace the text holds.
      expect(region.querySelector('pre > code')?.textContent).toBe(block.code);
    });
  });

  it('renders a quote as a blockquote with its inline pieces', () => {
    const body = renderBody();
    const quote = body.querySelector('blockquote');
    expect(quote?.textContent).toBe('A quotation, with code and plain text in it.');
    expect(quote?.querySelector('code')?.textContent).toBe('code');
  });

  it('renders a table with its caption, its column headers and its row headers', () => {
    renderBody();
    const block = everyBlockPost.body.find((candidate) => candidate.kind === 'table');
    if (block?.kind !== 'table') throw new Error('the every-block fixture has no table');
    const table = screen.getByRole('table', { name: block.caption });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(block.columns);
    // Trimmed at the end: a table of three or more columns ends each row header with a real space,
    // so the stacked line copies as the header and its first cell (`data-table.tsx`).
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent.trimEnd()),
    ).toEqual(block.rows.map(([header]) => header));
    // Every other cell as written, in order: `|` and `*` stay text, and nothing is added to a cell.
    expect(
      within(table)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(block.rows.flatMap(([, ...cells]) => cells));
  });

  it('never dims text with opacity, and never uses --accent as a text colour', () => {
    // ADR 0011 and 0010: secondary text takes --muted; an alpha or opacity step is measured by axe
    // at its blended colour, and --accent misses AA as text in the dark theme.
    // Each class without its variants (`hover:`, `md:`, `dark:`), so a dim behind one counts too,
    // and with an arbitrary step (`/[0.6]`, `opacity-[.6]`) as well as a scale one (`/60`).
    const bases = classesUnder(renderBody()).map((name) => name.split(':').at(-1) ?? name);
    const step = String.raw`(?:\d+(?:\.\d+)?|\[[^\]]+\])`;
    const dimmed = new RegExp(String.raw`^(?:text-.*\/${step}|opacity-${step})$`);
    expect(bases.filter((name) => dimmed.test(name) && name !== 'opacity-100')).toEqual([]);
    expect(bases).not.toContain('text-[var(--accent)]');
  });

  it('puts no text under aria-hidden', () => {
    const body = renderBody();
    for (const hidden of body.querySelectorAll('[aria-hidden="true"]')) {
      expect(hidden.textContent?.trim()).toBe('');
    }
  });
});
