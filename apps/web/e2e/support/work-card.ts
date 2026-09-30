import type { Page } from '@playwright/test';

/** The /work archive card link for one case study: the link whose href is that slug. */
export const linkFor = (page: Page, slug: string) =>
  page.locator(`a[href="/work/${slug}"]`).first();

/**
 * The /work archive card for one case study: the link's nearest `group` ancestor, which is the
 * element its hover and focus variants key off. The link carries only the title, so the status, the
 * metric and the rest of the card are found through this. Walking up from the link rather than
 * filtering every `div.group` that contains it keeps one card even if a wrapper around the list ever
 * takes the `group` class too. `ancestor` is a reverse axis, so `[1]` is the nearest match; the
 * parenthesised `(ancestor::div[...])[1]` would be the outermost.
 */
export const cardFor = (page: Page, slug: string) =>
  linkFor(page, slug).locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]',
  );
