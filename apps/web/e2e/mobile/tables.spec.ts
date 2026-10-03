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
 * At 320, 375 and 414px, on `/about` and `/skills`: every cell lies inside the viewport, every row
 * is as tall as what it shows and no taller, the cells come in that order, the column header row
 * is drawn nowhere, and the first timeline row's story is on screen. The separator is drawn but
 * never read or copied: a row header's accessible name is its text alone, and the row copies as
 * "2025 AI-Native Engineer", not "2025AI-Native Engineer" nor with the dot.
 *
 * At 375px, that the stacked tables are still tables to assistive technology: the stacked layout
 * changes the display of every table element, which drops their table semantics in WebKit, so each
 * carries its ARIA role. Playwright's role queries read the DOM and ARIA, the same in every engine,
 * so they prove the roles are there; on Chromium the platform accessibility tree is read as well,
 * through the DevTools protocol, which no other engine offers.
 */

const PHONE_WIDTHS = [320, 375, 414];

/** Every table of more than two columns, with the route that serves it. */
const WIDE = Object.entries(TABLES).flatMap(([route, tables]) =>
  tables.filter(isWideTable).map((table) => ({ route, table })),
);
const WIDE_ROUTES = [...new Set(WIDE.map(({ route }) => route))];

/** How far, in CSS pixels, a line's glyphs may sit inside its line box: text-sm's half-leading. */
const LEADING = 4;

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
 * A table as laid out: its column header row's box, and for each body row its box, the inside edges
 * of its border and padding, its header's `::after` content, and each cell's box with the box of
 * what the cell holds (a range over its contents: the text and the elements drawn in it).
 */
async function layoutOf(page: Page, caption: string) {
  return page.getByRole('table', { name: caption, exact: true }).evaluate((element) => {
    const table = element as HTMLTableElement;
    const edges = ({ left, right, top, bottom }: DOMRect): Edges => ({ left, right, top, bottom });
    const contents = (cell: Element) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      return edges(range.getBoundingClientRect());
    };
    return {
      head: edges(table.tHead!.getBoundingClientRect()),
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
          expect(
            layout.rows.map(({ header }) => header),
            `${where}: its rows`,
          ).toEqual(table.rows.map(([header]) => header));

          for (const row of layout.rows) {
            const at = `${where}, row ${row.header}`;
            for (const [index, cell] of row.cells.entries()) {
              for (const box of [cell.box, cell.contents]) {
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
            const top = Math.min(...row.cells.map(({ contents }) => contents.top));
            const bottom = Math.max(...row.cells.map(({ contents }) => contents.bottom));
            expect
              .soft(top - row.inner.top, `${at}: blank above the first line`)
              .toBeLessThanOrEqual(LEADING);
            expect
              .soft(row.inner.bottom - bottom, `${at}: blank below the last line`)
              .toBeLessThanOrEqual(LEADING);
            // The header and the first cell share a line; each remaining cell has a line of its own.
            const [header, first, ...rest] = row.cells;
            expect
              .soft(first!.contents.top, `${at}: the first cell is not on the header's line`)
              .toBeLessThan(header!.contents.bottom);
            let above = first!.contents.bottom;
            for (const [index, cell] of rest.entries()) {
              expect
                .soft(
                  cell.contents.top,
                  `${at}: cell ${index + 2} does not start below the one before`,
                )
                .toBeGreaterThanOrEqual(above - 1);
              above = cell.contents.bottom;
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
      await expect(story, 'the story is clipped or off-screen').toBeInViewport({ ratio: 1 });
    });
  }
});

test('a stacked row copies and reads without its separator', async ({ page }) => {
  await narrowTo(page, 375);
  await gotoHydrated(page, '/about');
  const table = page.getByRole('table', { name: 'Career timeline', exact: true });
  const { year, role } = timeline[0]!;
  // Selected and copied as a visitor would: generated content is never part of a selection.
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
  // Read as its text alone: the separator's alternative text is empty.
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
          const { result } = await cdp.send('Runtime.evaluate', {
            expression: `[...document.querySelectorAll('main table')].find((table) => table.caption?.textContent === ${JSON.stringify(table.caption)})`,
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
