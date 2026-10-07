import { expect, test, type Page } from '@playwright/test';
import { timeline } from '../../src/data/pages/about';
import { isWideTable } from '../../src/data/pages/table';
import { gotoHydrated } from '../support/hydration';
import { STACKED_BELOW, TABLES } from '../support/tables';

/**
 * The wide tables on a phone (#58). #226 laid a table of more than two columns out 40rem wide and
 * let it scroll sideways inside its region, which on a 375px phone left the timeline's "What
 * changed" column and the toolkit's skills off-screen, and every row as tall as that hidden column,
 * blank to look at. The owner's decision (2026-10-03): below 640px each row is one block, the row
 * header and the first cell on one line joined by a drawn " · ", then each remaining cell on a line
 * of its own, while the HTML stays one table.
 *
 * At phone widths from 320px to one pixel under the breakpoint, on `/about` and `/skills`: every
 * cell lies inside the viewport, every row is as tall as what it shows and no taller, the cells
 * come in that order, the column header row is drawn nowhere and stays anchored inside the table's
 * card, and the first timeline row's story is on screen. A word too long for the line breaks
 * rather than push the page sideways, and so do the column headers of a two-column table, which
 * never stacks: a post may name its columns at any length. The separator is drawn but never read
 * or copied: a row header's accessible name is its text alone, and the row copies as
 * "2025 AI-Native Engineer", not "2025AI-Native Engineer".
 *
 * At 375px, that the stacked tables are still tables to assistive technology: the stacked layout
 * changes the display of every table element, which drops their table semantics in WebKit, so each
 * carries its ARIA role. Playwright's role queries read the DOM and ARIA, the same in every engine,
 * so they prove the roles are there; on Chromium the platform accessibility tree is read as well,
 * through the DevTools protocol, which no other engine offers.
 */

/** Phones, and the band from a large phone in landscape up to the breakpoint. */
const PHONE_WIDTHS = [320, 375, 414, 540, STACKED_BELOW - 1];

/** Every table of more than two columns, with the route that serves it. */
const WIDE = Object.entries(TABLES).flatMap(([route, tables]) =>
  tables.filter(isWideTable).map((table) => ({ route, table })),
);
const WIDE_ROUTES = [...new Set(WIDE.map(({ route }) => route))];

/** Every table of two columns, with the route that serves it. */
const NARROW = Object.entries(TABLES).flatMap(([route, tables]) =>
  tables.filter((table) => !isWideTable(table)).map((table) => ({ route, table })),
);
const NARROW_ROUTES = [...new Set(NARROW.map(({ route }) => route))];

/** Narrows the phone project's viewport to `width`, keeping its own height. */
async function narrowTo(page: Page, width: number) {
  const height = page.viewportSize()?.height ?? 812;
  await page.setViewportSize({ width, height });
}

interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * A table as laid out: its column header row's box, how many of its visually hidden boxes (the
 * column header row and the chips' commas, both absolutely positioned) are anchored outside the
 * table's card, and for each body row its box, the inside edges of its border and padding, how far
 * its text may sit inside a line (the half-leading of its computed line height, and a pixel), its
 * header's `::after` content, and each cell's box with the box of what the cell holds (a range over
 * its contents: the text and the elements drawn in it), or null where the cell draws nothing.
 */
async function layoutOf(page: Page, caption: string) {
  return page.getByRole('table', { name: caption, exact: true }).evaluate((element) => {
    const table = element as HTMLTableElement;
    const edges = ({ left, right, top, bottom }: DOMRect): Edges => ({ left, right, top, bottom });
    const contents = (cell: Element) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const rect = range.getBoundingClientRect();
      return rect.width === 0 && rect.height === 0 ? null : edges(rect);
    };
    const card = table.parentElement;
    const hidden = [table.tHead!, ...table.querySelectorAll('.sr-only')] as HTMLElement[];
    return {
      head: edges(table.tHead!.getBoundingClientRect()),
      unanchored: hidden.filter((element) => element.offsetParent !== card).length,
      rows: [...table.tBodies[0]!.rows].map((row) => {
        const box = edges(row.getBoundingClientRect());
        const style = getComputedStyle(row);
        return {
          header: row.cells[0]!.textContent?.trim() ?? '',
          box,
          inner: {
            top: box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
            bottom:
              box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom),
          },
          leading: (parseFloat(style.lineHeight) - parseFloat(style.fontSize)) / 2 + 1,
          separator: getComputedStyle(row.cells[0]!, '::after').content,
          cells: [...row.cells].map((cell) => ({
            box: edges(cell.getBoundingClientRect()),
            contents: contents(cell),
          })),
        };
      }),
    };
  });
}

test(`the wide tables stack each row into a block at ${PHONE_WIDTHS.join(', ')}px`, async ({
  page,
}) => {
  // A navigation and a read per route, and one for the story, per width.
  test.setTimeout(30_000 + PHONE_WIDTHS.length * (WIDE_ROUTES.length + 1) * 3_000);
  expect(WIDE.map(({ route, table }) => `${route} ${table.caption}`)).toEqual([
    '/about Career timeline',
    '/skills Skills by category',
  ]);
  expect(Math.max(...PHONE_WIDTHS)).toBeLessThan(STACKED_BELOW);

  for (const width of PHONE_WIDTHS) {
    await narrowTo(page, width);
    for (const route of WIDE_ROUTES) {
      await test.step(`${route} at ${width}px`, async () => {
        const response = await gotoHydrated(page, route);
        expect(response?.status(), `${route} did not answer 200`).toBe(200);
        for (const { table } of WIDE.filter((wide) => wide.route === route)) {
          const where = `${table.caption} at ${width}px`;
          const layout = await layoutOf(page, table.caption);

          // The column headers are for assistive technology here: drawn nowhere, read on each cell.
          expect
            .soft(layout.head.bottom - layout.head.top, `${where}: the column header row is drawn`)
            .toBeLessThanOrEqual(1);
          // Absolutely positioned, so anchored by the nearest positioned ancestor: the card, which
          // keeps them inside it whatever an ancestor's insets, transforms or overflow become.
          expect
            .soft(layout.unanchored, `${where}: visually hidden boxes anchored outside the card`)
            .toBe(0);
          expect(
            layout.rows.map(({ header }) => header),
            `${where}: its rows`,
          ).toEqual(table.rows.map(([header]) => header));

          for (const row of layout.rows) {
            const at = `${where}, row ${row.header}`;
            for (const [index, cell] of row.cells.entries()) {
              expect.soft(cell.contents, `${at}: cell ${index} draws nothing`).not.toBeNull();
              for (const box of [cell.box, cell.contents ?? cell.box]) {
                expect
                  .soft(box.left, `${at}: cell ${index} starts off-screen`)
                  .toBeGreaterThanOrEqual(0);
                expect
                  .soft(box.right, `${at}: cell ${index} ends off-screen`)
                  .toBeLessThanOrEqual(width);
              }
            }
            // As tall as what it shows: the first cell's text starts at the top of the row's padding
            // box and the last cell's ends at its bottom, give or take the leading of a line.
            const drawn = row.cells.flatMap(({ contents }) => (contents ? [contents] : []));
            if (drawn.length !== row.cells.length) continue;
            const top = Math.min(...drawn.map((contents) => contents.top));
            const bottom = Math.max(...drawn.map((contents) => contents.bottom));
            expect
              .soft(top - row.inner.top, `${at}: blank above the first line`)
              .toBeLessThanOrEqual(row.leading);
            expect
              .soft(row.inner.bottom - bottom, `${at}: blank below the last line`)
              .toBeLessThanOrEqual(row.leading);
            // The header and the first cell share a line; each remaining cell has a line of its own.
            const [header, first, ...rest] = drawn;
            expect
              .soft(first!.top, `${at}: the first cell is not on the header's line`)
              .toBeLessThan(header!.bottom);
            let above = first!.bottom;
            for (const [index, cell] of rest.entries()) {
              expect
                .soft(cell.top, `${at}: cell ${index + 2} does not start below the one before`)
                .toBeGreaterThanOrEqual(above - 1);
              above = cell.bottom;
            }
            // The " · " between them is drawn, as generated content with empty alternative text.
            expect.soft(row.separator, `${at}: no separator drawn after the header`).toContain('·');
          }
        }
      });
    }

    await test.step(`the first timeline row's story is on screen at ${width}px`, async () => {
      await gotoHydrated(page, '/about');
      const story = page
        .getByRole('table', { name: 'Career timeline', exact: true })
        .getByRole('cell')
        .filter({ hasText: timeline[0]!.description });
      await expect(story).toHaveCount(1);
      await story.scrollIntoViewIfNeeded();
      // Sideways only: a story taller than the viewport is still on screen, a line at a time.
      await expect(story, 'the story is off-screen').toBeInViewport();
      const box = (await story.boundingBox())!;
      expect(box.x, 'the story starts off-screen').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'the story ends off-screen').toBeLessThanOrEqual(width);
    });
  }
});

test('a word too long for a stacked line breaks inside the row, not past the page', async ({
  page,
}) => {
  // The narrowest phone, where a long word has the least room. Today's copy has no such word: this
  // stands in for a URL or a long name added to a row later.
  const width = 320;
  await narrowTo(page, width);
  for (const route of WIDE_ROUTES) {
    await test.step(route, async () => {
      await gotoHydrated(page, route);
      for (const { table } of WIDE.filter((wide) => wide.route === route)) {
        const overflow = await page
          .getByRole('table', { name: table.caption, exact: true })
          .evaluate((element) => {
            const row = (element as HTMLTableElement).tBodies[0]!.rows[0]!;
            const card = element.parentElement!;
            // In the row header, the first cell that runs on after it, and a cell of its own line.
            for (const cell of [row.cells[0]!, row.cells[1]!, row.cells[row.cells.length - 1]!]) {
              cell.append(` ${'x'.repeat(60)}`);
            }
            return {
              page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              card: card.scrollWidth - card.clientWidth,
            };
          });
        expect.soft(overflow.card, `${table.caption}: the long word overflows its card`).toBe(0);
        expect.soft(overflow.page, `${table.caption}: the page scrolls sideways`).toBe(0);
      }
    });
  }
});

test("a two-column table's long column headers wrap inside its card, not past the page", async ({
  page,
}) => {
  // Today's column names are one or two short words; a post's may be longer. Kept on one line,
  // "Failure mode" and "What the agent did instead" pushed a 320px page 81px sideways, and a pair
  // of 29 characters already 11px (measured 2026-10-07). These stand in for a post's: words that
  // wrap, and one word too long for any line.
  await narrowTo(page, 320);
  for (const route of NARROW_ROUTES) {
    await test.step(route, async () => {
      await gotoHydrated(page, route);
      for (const { table } of NARROW.filter((narrow) => narrow.route === route)) {
        const overflow = await page
          .getByRole('table', { name: table.caption, exact: true })
          .evaluate((element) => {
            const [first, second] = (element as HTMLTableElement).tHead!.rows[0]!.cells;
            first!.textContent = 'What the agent did instead';
            second!.textContent = 'x'.repeat(40);
            const card = element.parentElement!;
            return {
              page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              card: card.scrollWidth - card.clientWidth,
            };
          });
        expect.soft(overflow.card, `${table.caption}: a column header overflows its card`).toBe(0);
        expect.soft(overflow.page, `${table.caption}: the page scrolls sideways`).toBe(0);
      }
    });
  }
});

test('a stacked row copies and reads without its separator', async ({ page }) => {
  await narrowTo(page, 375);
  await gotoHydrated(page, '/about');
  const table = page.getByRole('table', { name: 'Career timeline', exact: true });
  const { year, role } = timeline[0]!;
  // Selected as a visitor would. Generated content is never part of a selection in any engine, so
  // this proves what the DOM holds: the real space after the header and no dot. That the dot's
  // alternative text is empty is proved below, through the accessible name.
  const copied = await table.evaluate((element) => {
    const row = (element as HTMLTableElement).tBodies[0]!.rows[0]!;
    const selection = getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(row);
    selection.removeAllRanges();
    selection.addRange(range);
    const text = selection.toString();
    selection.removeAllRanges();
    return text;
  });
  expect(copied, 'the separator is copied').not.toContain('·');
  expect(copied.replace(/\s+/g, ' ').trim(), 'the header and its first cell run together').toMatch(
    new RegExp(`^${year} ${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`),
  );
  // Read as its text alone. Playwright names an element from the engine's computed `::after`
  // content, taking its alternative text after the `/` when there is one and the drawn string when
  // there is not, so a dot whose empty alternative text the engine dropped would name the header
  // "2025 ·" and fail here, in every engine; the first test proves the dot is drawn.
  await expect(table.getByRole('rowheader', { name: year, exact: true })).toHaveCount(1);
});

test('the stacked tables are still tables to assistive technology at 375px', async ({
  page,
  browserName,
}) => {
  await narrowTo(page, 375);
  for (const route of WIDE_ROUTES) {
    await gotoHydrated(page, route);
    for (const { table } of WIDE.filter((wide) => wide.route === route)) {
      await test.step(`${route} ${table.caption}`, async () => {
        const located = page.getByRole('table', { name: table.caption, exact: true });
        await expect(located).toHaveCount(1);
        // Stacked, so this is the layout whose semantics are in question.
        const layout = await layoutOf(page, table.caption);
        expect(layout.head.bottom - layout.head.top).toBeLessThanOrEqual(1);

        const dataCells = table.rows.length * (table.columns.length - 1);
        await expect(located.getByRole('columnheader')).toHaveText([...table.columns]);
        await expect(located.getByRole('row')).toHaveCount(table.rows.length + 1);
        await expect(located.getByRole('rowheader')).toHaveText(
          table.rows.map(([header]) => header),
        );
        await expect(located.getByRole('cell')).toHaveCount(dataCells);
        for (const [header] of table.rows) {
          await expect(located.getByRole('rowheader', { name: header, exact: true })).toHaveCount(
            1,
          );
        }

        if (browserName !== 'chromium') return;
        // Chromium's own tree, not Playwright's reading of the DOM.
        const cdp = await page.context().newCDPSession(page);
        try {
          await cdp.send('DOM.enable');
          await cdp.send('Accessibility.enable');
          // The caption goes in as an argument, never spliced into the code that runs in the page.
          const { result: documentRef } = await cdp.send('Runtime.evaluate', {
            expression: 'document',
          });
          if (!documentRef.objectId) throw new Error('no document to search');
          const { result } = await cdp.send('Runtime.callFunctionOn', {
            objectId: documentRef.objectId,
            functionDeclaration:
              "function (caption) { return [...this.querySelectorAll('main table')].find((table) => table.caption?.textContent === caption); }",
            arguments: [{ value: table.caption }],
          });
          if (!result.objectId) throw new Error(`no table captioned ${table.caption}`);
          const named = async (role: string) =>
            (await cdp.send('Accessibility.queryAXTree', { objectId: result.objectId, role })).nodes
              .filter((node) => !node.ignored)
              .map((node) => String(node.name?.value ?? '').trim());
          expect(await named('table'), 'Chromium: the table and its name').toEqual([table.caption]);
          // Chromium names a header from its rendered text, which the column headers' `uppercase`
          // class transforms, on desktop as here; the words are the columns'.
          expect(await named('columnheader'), 'Chromium: the column headers').toEqual(
            table.columns.map((column) => column.toUpperCase()),
          );
          expect(
            await named('rowheader'),
            'Chromium: the row headers, named by their text alone',
          ).toEqual(table.rows.map(([header]) => header));
          expect((await named('row')).length, 'Chromium: the rows').toBe(table.rows.length + 1);
          expect((await named('cell')).length, 'Chromium: the data cells').toBe(dataCells);
        } finally {
          await cdp.detach();
        }
      });
    }
  }
});
