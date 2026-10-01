import { expect, test } from '@playwright/test';
import { beliefs, credentials } from '../src/data/pages/about';
import { coreSkills, skillCategories } from '../src/data/pages/skills';
import { gotoHydrated } from './support/hydration';

/**
 * What a screen reader is given on `/about` and `/skills`: the decorative emoji are left out, and
 * the self-rated skill levels are announced as meters, not as progress bars.
 *
 * The emoji are decoration beside text that already says the same thing, so each one sits in an
 * `aria-hidden` span: it still shows, and it is never read out ("rocket", "robot face", "graduation
 * cap" ...). A level is a fixed measurement within a known range, which is what `meter` means; a
 * `progressbar` tells the listener a task is under way.
 *
 * This file sits outside `e2e/mobile/`, so the desktop `chromium` project runs it. Nothing here
 * interacts, but every check reads the page after hydration, which must not put back what the
 * server-rendered markup left out.
 */

/** Any emoji or other pictograph, the class a screen reader names aloud. */
const PICTOGRAPH = /\p{Extended_Pictographic}/gu;

/** The pictographs in `text`, each with its code point, so a failure says which one leaked. */
const pictographsIn = (text: string) =>
  [...text.matchAll(PICTOGRAPH)].map(
    ([char]) => `${char} U+${char.codePointAt(0)?.toString(16).toUpperCase()}`,
  );

/** `text` as a literal inside a regular expression (Node 22 has no `RegExp.escape`). */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const { path, icons, labels } of [
  {
    path: '/about',
    icons: [...beliefs.map(({ icon }) => icon), ...credentials.map(({ icon }) => icon)],
    labels: [...beliefs.map(({ title }) => title), ...credentials.map(({ text }) => text)],
  },
  {
    path: '/skills',
    icons: skillCategories.map(({ icon }) => icon),
    labels: skillCategories.map(({ name }) => name),
  },
]) {
  test(`${path} keeps every emoji out of what main announces`, async ({ page }) => {
    await gotoHydrated(page, path);
    const main = page.locator('main');
    const snapshot = await main.ariaSnapshot();
    expect(pictographsIn(snapshot), `pictographs in the accessibility tree of ${path}`).toEqual([]);

    // Not vacuous: the text each icon stands beside is still announced, and every icon the record
    // holds is still drawn on the page, inside an `aria-hidden` element, rather than deleted.
    for (const label of labels) expect(snapshot).toContain(label);
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      await expect(main.locator('[aria-hidden="true"]').filter({ hasText: icon })).not.toHaveCount(
        0,
      );
    }
  });
}

test('/skills announces each self-rated level as a meter, not a progress bar', async ({ page }) => {
  await gotoHydrated(page, '/skills');
  await expect(page.locator('[role="progressbar"]')).toHaveCount(0);

  const meters = page.getByRole('meter');
  expect(coreSkills.length).toBeGreaterThan(0);
  await expect(meters).toHaveCount(coreSkills.length);
  for (const [index, { name, level }] of coreSkills.entries()) {
    const meter = meters.nth(index);
    // Named after its skill: a non-empty name that a listener can tell apart from the others.
    await expect(meter).toHaveAccessibleName(new RegExp(`^${escapeRegExp(name)}\\s+\\S`));
    await expect(meter).toHaveAttribute('aria-valuenow', String(level));
    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '100');
  }
});
