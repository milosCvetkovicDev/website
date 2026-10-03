import { expect, test, type Page } from '@playwright/test';
import { isWideTable } from '../src/data/pages/table';
import { gotoHydrated } from './support/hydration';
import { STACKED_BELOW, TABLES } from './support/tables';

/**
 * The data tables from 640px up (#58). Below `STACKED_BELOW` a table of more than two columns
 * stacks each row into a block (`mobile/tables.spec.ts`); from there up every table is the grid
 * #226 drew, and no table scrolls any more, so none may overflow its box at any width.
 *
 * #226 laid a wide table out at least 40rem wide, which needs a 640px box: `/about` and `/skills`
 * give their tables 590px at a 640px viewport and 638px at 688px (measured 2026-10-03, every 20px
 * from 600 to 800), so the grid fitted from 690px up only and scrolled below that. The grid now has
 * no minimum width; its narrowest is 440px for the timeline and 423px for the toolkit, which fits
 * from the owner's 640px up. At each width here: the page does not scroll sideways, every table
 * lies inside its box, and every table is a grid, its column headers drawn and the cells of each
 * row on one top edge. One pixel under the breakpoint the wide tables stack, which pins it.
 */

const GRID_WIDTHS = [STACKED_BELOW, 700, 768, 1024, 1280];

/** Every table on the page as laid out, with the inside edges of its box. */
async function layoutOf(page: Page) {
  return page.locator('main table').evaluateAll((elements) =>
    elements.map((element) => {
      const table = element as HTMLTableElement;
      const box = table.parentElement!;
      const outer = box.getBoundingClientRect();
      const style = getComputedStyle(box);
      const drawn = table.getBoundingClientRect();
      const head = table.tHead!.getBoundingClientRect();
      return {
        caption: table.caption?.textContent ?? '',
        box: {
          left: outer.left + parseFloat(style.borderLeftWidth),
          right: outer.right - parseFloat(style.borderRightWidth),
          scrollWidth: box.scrollWidth,
          clientWidth: box.clientWidth,
        },
        table: { left: drawn.left, right: drawn.right },
        headHeight: head.height,
        rows: [...table.tBodies[0]!.rows].map((row) =>
          [...row.cells].map((cell) => cell.getBoundingClientRect().top),
        ),
      };
    }),
  );
}

test(`no table overflows its box from ${STACKED_BELOW}px up, and each is a grid`, async ({
  page,
}) => {
  const routes = Object.keys(TABLES);
  // A navigation and a read per route, per width.
  test.setTimeout(30_000 + routes.length * GRID_WIDTHS.length * 3_000);
  for (const width of GRID_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await test.step(`${route} at ${width}px`, async () => {
        const response = await gotoHydrated(page, route);
        expect(response?.status(), `${route} did not answer 200`).toBe(200);
        const page_ = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect
          .soft(page_.scrollWidth, `${route} scrolls sideways at ${width}px`)
          .toBeLessThanOrEqual(page_.clientWidth);
        const tables = await layoutOf(page);
        expect(tables.map(({ caption }) => caption)).toEqual(
          (TABLES[route] ?? []).map(({ caption }) => caption),
        );
        for (const table of tables) {
          const where = `${table.caption} at ${width}px`;
          expect
            .soft(table.box.scrollWidth, `${where} overflows its box`)
            .toBeLessThanOrEqual(table.box.clientWidth);
          expect
            .soft(table.table.left, `${where} starts outside its box`)
            .toBeGreaterThanOrEqual(table.box.left - 0.5);
          expect
            .soft(table.table.right, `${where} ends outside its box`)
            .toBeLessThanOrEqual(table.box.right + 0.5);
          expect
            .soft(table.headHeight, `${where}: the column headers are not drawn`)
            .toBeGreaterThan(1);
          for (const [index, tops] of table.rows.entries()) {
            expect
              .soft(
                Math.max(...tops) - Math.min(...tops),
                `${where}: row ${index}'s cells do not share a top edge`,
              )
              .toBeLessThanOrEqual(1);
          }
        }
      });
    }
  }
});

test(`the wide tables stack below ${STACKED_BELOW}px, and the narrow ones stay grids`, async ({
  page,
}) => {
  const width = STACKED_BELOW - 1;
  await page.setViewportSize({ width, height: 900 });
  for (const [route, expected] of Object.entries(TABLES)) {
    if (!expected.some(isWideTable)) continue;
    await test.step(route, async () => {
      await gotoHydrated(page, route);
      const tables = await layoutOf(page);
      for (const [index, table] of tables.entries()) {
        const where = `${table.caption} at ${width}px`;
        expect
          .soft(table.box.scrollWidth, `${where} overflows its box`)
          .toBeLessThanOrEqual(table.box.clientWidth);
        if (!isWideTable(expected[index]!)) {
          expect.soft(table.headHeight, `${where}: a narrow table stays a grid`).toBeGreaterThan(1);
          continue;
        }
        expect
          .soft(table.headHeight, `${where}: the column headers are drawn`)
          .toBeLessThanOrEqual(1);
        for (const [row, tops] of table.rows.entries()) {
          // The header and the first cell share a line; the second cell starts on a line below.
          expect
            .soft(tops[2]! - tops[0]!, `${where}: row ${row} is not stacked`)
            .toBeGreaterThan(1);
        }
      }
    });
  }
});
