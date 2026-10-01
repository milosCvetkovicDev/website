import { expect, test, type Page } from '@playwright/test';
import { beliefs, credentials } from '../src/data/pages/about';
import { coreSkills, skillCategories } from '../src/data/pages/skills';
import { pictographsIn } from '../src/test/pictographs';
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
 * This file sits outside `e2e/mobile/`, so the desktop `chromium` project runs it. The emoji check
 * runs twice: on the served markup with JavaScript off, and again after hydration, which must not
 * put back what the server-rendered markup left out. What counts as an emoji, flags and keycaps
 * included, is `src/test/pictographs.ts`, which the unit test on the records shares.
 */

/** `text` as a literal inside a regular expression (Node 22 has no `RegExp.escape`). */
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A quoted name or text in an aria snapshot template; JSON's string syntax is YAML's too. */
const quoted = (text: string) => JSON.stringify(text);

/**
 * One card that draws an icon: the icon, and the aria snapshot its card must match once the icon
 * is hidden, so the words beside it are still announced, in that card and not somewhere else.
 * `drawn` is the card's visible text where the icon sits inline with the words.
 */
interface IconCard {
  icon: string;
  announced: string;
  drawn?: string;
}

const routes: readonly { path: string; cards: readonly IconCard[] }[] = [
  {
    path: '/about',
    cards: [
      ...beliefs.map(({ icon, title }) => ({
        icon,
        announced: `- heading ${quoted(title)} [level=3]`,
      })),
      // The text sits beside its icon in one line, so the gap between them is checked as drawn.
      ...credentials.map(({ icon, text }) => ({
        icon,
        announced: `- text: ${quoted(text)}`,
        drawn: `${icon} ${text}`,
      })),
    ],
  },
  {
    path: '/skills',
    cards: skillCategories.map(({ icon, name }) => ({
      icon,
      announced: `- heading ${quoted(name)} [level=3]`,
    })),
  },
];

/**
 * The checks on one page, as loaded: nothing in the page's accessibility tree is an emoji, and
 * every icon in the record is still drawn, visible, inside an `aria-hidden` element of its own
 * card, beside words that are announced. The second half keeps the first from passing vacuously,
 * by deleting the icons or the cards.
 */
async function expectIconsHidden(page: Page, path: string, cards: readonly IconCard[]) {
  const snapshot = await page.locator('body').ariaSnapshot();
  expect(pictographsIn(snapshot), `pictographs in the accessibility tree of ${path}`).toEqual([]);

  const main = page.locator('main');
  expect(cards.length).toBeGreaterThan(0);
  const icons = cards.map(({ icon }) => icon);
  expect(new Set(icons).size, `each icon on ${path} names one card`).toBe(icons.length);
  for (const { icon, announced, drawn } of cards) {
    expect(icon.trim(), 'an icon in the record').not.toBe('');
    const hidden = main
      .locator('[aria-hidden="true"]')
      .filter({ hasText: new RegExp(`^${escapeRegExp(icon)}$`) });
    await expect(hidden, `${icon} drawn once, hidden`).toHaveCount(1);
    await expect(hidden).toBeVisible();
    const card = hidden.locator('xpath=..');
    await expect(card).toMatchAriaSnapshot(announced);
    if (drawn !== undefined) await expect(card).toHaveText(drawn);
  }
}

for (const { path, cards } of routes) {
  test(`${path} keeps every emoji out of what the page announces`, async ({ page }) => {
    await gotoHydrated(page, path);
    await expectIconsHidden(page, path, cards);
  });
}

test.describe('in the served markup, without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const { path, cards } of routes) {
    test(`${path} keeps every emoji out of what the page announces`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `GET ${path}`).toBe(200);
      await expectIconsHidden(page, path, cards);
    });
  }
});

test('/skills announces each self-rated level as a meter, not a progress bar', async ({ page }) => {
  await gotoHydrated(page, '/skills');
  const main = page.locator('main');
  await expect(page.locator('[role="progressbar"]')).toHaveCount(0);

  expect(coreSkills.length).toBeGreaterThan(0);
  await expect(main.getByRole('meter')).toHaveCount(coreSkills.length);
  for (const { name, level } of coreSkills) {
    // Found by its name, which says whose level it is, that the level is self-assessed, and the
    // level itself; one meter per name, so a listener can tell the meters apart.
    const meter = main.getByRole('meter', {
      name: new RegExp(`^${escapeRegExp(name)} .*self-assessed.* ${level}%$`, 'i'),
    });
    await expect(meter, `the ${name} meter`).toHaveCount(1);
    await expect(meter).toHaveAttribute('aria-valuenow', String(level));
    await expect(meter).toHaveAttribute('aria-valuetext', `${level}%`);
    await expect(meter).toHaveAttribute('aria-valuemin', '0');
    await expect(meter).toHaveAttribute('aria-valuemax', '100');
  }
});
