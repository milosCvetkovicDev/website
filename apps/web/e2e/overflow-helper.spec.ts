import { expect, test, type Page } from '@playwright/test';
import { measureOverflow } from './support/overflow';

/**
 * The overflow helper's own checks, on pages built with `setContent` rather than on the site.
 *
 * `e2e/layout-overflow.spec.ts` and `e2e/mobile/layout-overflow.spec.ts` pass on a clean site
 * whether or not `measureOverflow` could see an overflow at all, and its offender list is only ever
 * read on a failure, so a helper that stopped measuring, or started naming the wrong element, would
 * go unnoticed until the day it mattered. Each case here is a page whose overflow is known.
 */

test.describe.configure({ retries: 0 });

const WIDTH = 320;

async function load(page: Page, body: string) {
  await page.setViewportSize({ width: WIDTH, height: 400 });
  await page.setContent(
    `<!doctype html><html><head><style>body { margin: 0 } div { height: 10px }</style></head>` +
      `<body>${body}</body></html>`,
  );
  const [seen] = await measureOverflow(page, [{ kind: 'read', label: 'now' }]);
  if (!seen) throw new Error('the helper returned no window');
  return seen;
}

test('a page that fits reads 0 and names nothing', async ({ page }) => {
  const seen = await load(page, `<div class="fits" style="width: ${WIDTH}px"></div>`);
  expect(seen.worst).toBe(0);
  expect(seen.offenders).toEqual([]);
});

test('a 1px overflow is measured and names its element', async ({ page }) => {
  const seen = await load(page, `<div class="wide" style="width: ${WIDTH + 1}px"></div>`);
  expect(seen.worst).toBe(1);
  expect(seen.offenders.join('\n')).toContain('div.wide =');
});

test('text running past a box that fits names the element holding it', async ({ page }) => {
  const seen = await load(
    page,
    `<p class="heading" style="margin: 0; white-space: nowrap">${'overflowing '.repeat(12)}</p>`,
  );
  expect(seen.worst).toBeGreaterThan(0);
  expect(seen.offenders.join('\n')).toContain('p (text).heading =');
});

test('an absolute box under a static clipping parent is named', async ({ page }) => {
  // The parent clips, but it is not the box's containing block, so the box still widens the page.
  const seen = await load(
    page,
    `<div style="overflow: hidden; width: 100px">` +
      `<div class="escapes" style="position: absolute; left: 250px; width: 200px"></div></div>`,
  );
  expect(seen.worst).toBe(130);
  expect(seen.offenders.join('\n')).toContain('div.escapes =');
});

for (const property of ['transform: translateX(0)', 'translate: 0 0', 'position: relative']) {
  test(`an absolute box clipped by a containing block made with ${property} is not named`, async ({
    page,
  }) => {
    // Tailwind 4's `translate-*`, `scale-*` and `rotate-*` utilities set the individual transform
    // properties, not `transform`, and each makes a containing block just the same.
    const seen = await load(
      page,
      `<div style="overflow: hidden; width: 100px; ${property}">` +
        `<div class="clipped" style="position: absolute; left: 250px; width: 200px"></div></div>` +
        `<div class="wide" style="width: ${WIDTH + 20}px"></div>`,
    );
    expect(seen.worst).toBe(20);
    const named = seen.offenders.join('\n');
    expect(named).toContain('div.wide =');
    expect(named).not.toContain('div.clipped =');
  });
}

test('a fixed box is not named', async ({ page }) => {
  const seen = await load(
    page,
    `<div class="fixed" style="position: fixed; left: 250px; width: 200px"></div>` +
      `<div class="wide" style="width: ${WIDTH + 20}px"></div>`,
  );
  expect(seen.worst).toBe(20);
  expect(seen.offenders.join('\n')).not.toContain('div.fixed =');
});
