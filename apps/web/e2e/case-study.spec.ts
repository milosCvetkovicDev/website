import { expect, test } from '@playwright/test';
import { caseStudies, formatMetric } from '../src/data/case-studies';
import { gotoHydrated } from './support/hydration';
import { warmRoutes } from './support/warm-routes';

/**
 * What each `/work/[slug]` page actually renders.
 *
 * Row R35 of the RED manifest, fixed by #49, plus the green floor around it. Before this file the
 * case-study routes had no content assertion of any kind: `console-clean.spec.ts` loaded the three
 * slugs, the axe gate audited one of them, and `not-found-shell.spec.ts` checked a 404's shell. Greps
 * for `Back to Work` returned nothing.
 *
 * R35 was the mismatch between what a card promises and what the page delivers. Every card on `/`
 * and `/work` advertises a headline figure, and `work/[slug]/page.tsx` never read `metric` or
 * `highlight` at all, so the one page a visitor lands on to see that claim substantiated was the only
 * one that did not state it. #49 gave it a metric panel with the figure, its label and its basis.
 * Asserted through `formatMetric` rather than against a literal, so a data edit moves the test with
 * the data and cannot be satisfied by typing the number into the page.
 */

test.describe.configure({ retries: 0 });

test('every case study renders its title, description and a link back to /work', async ({
  page,
}) => {
  // Green. Derived from the data file, so a new case study is covered without touching this spec.
  for (const study of caseStudies) {
    const response = await page.goto(`/work/${study.slug}`);
    expect(response?.status(), `/work/${study.slug} should answer 200`).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/work/${study.slug}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(study.title);
    await expect(page.getByText(study.description, { exact: true })).toBeVisible();

    const back = page.getByRole('link', { name: /Back to Work/i });
    await expect(back).toHaveCount(1);
    await expect(back).toHaveAttribute('href', '/work');

    // The closing CTA reads `social.linkedin.href` (#49); the literal is the oracle.
    const connect = page.getByRole('link', { name: 'Connect on LinkedIn', exact: true });
    await expect(connect).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/milos-cvetkovic-dev',
    );
  }
});

test('every case study renders the tech stack and impact from the data file', async ({ page }) => {
  // Green, and the reason the page is worth loading at all: `case-studies.ts` is the single source of
  // truth, so a page that silently stopped rendering a section would otherwise pass every gate.
  const [study] = caseStudies;
  await page.goto(`/work/${study.slug}`);

  await expect(page.getByText(study.challenge, { exact: true })).toBeVisible();
  await expect(page.getByText(study.approach, { exact: true })).toBeVisible();
  for (const contribution of study.contributions.slice(0, 3)) {
    await expect(page.getByText(contribution, { exact: true })).toBeVisible();
  }
  for (const group of study.techStack) {
    await expect(page.getByText(group.category, { exact: true }).first()).toBeVisible();
  }
});

// The back link is a client-side navigation into `/work`, whose URL changes only once that route's RSC
// payload has arrived. Run alone from a deleted `.next-e2e`, the click was the dev server's first
// request for `/work`, which compiled the route: the payload took 4.1 s and the URL had still not
// changed when the 5 s `toHaveURL` ran out, in 1 of 10 runs (2026-09-13). The route is requested
// before the test (e2e/support/warm-routes.ts), from an anonymous group so the test keeps its title.
test.describe(() => {
  test.beforeAll(async ({ playwright }, testInfo) => {
    await warmRoutes(playwright, testInfo, ['/work']);
  });

  test('the back link reaches /work as a client-side navigation', async ({ page }) => {
    // Green. The back link is the only way off this page other than the header, and a broken href
    // would otherwise only surface as a 404 nobody runs into.
    const [study] = caseStudies;
    await gotoHydrated(page, `/work/${study.slug}`);

    await page.getByRole('link', { name: /Back to Work/i }).click();

    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test('every case study states the headline metric its cards advertise, and its basis', async ({
  page,
}) => {
  const missing: string[] = [];
  for (const study of caseStudies) {
    await page.goto(`/work/${study.slug}`);
    const { metric } = study.highlight;
    const value = formatMetric(metric);

    // The figure, its label and its basis together, in the one panel that states them: three
    // strings found anywhere on the page would pass with the label in "More work" and the basis
    // in the footer. The value goes through `formatMetric`, which is the one function that turns
    // the data into copy: a page that hard-coded "73%" would satisfy a literal assertion while
    // still being able to drift from the data.
    const panel = page.getByRole('region', { name: 'Headline result' });
    if ((await panel.count()) !== 1) {
      missing.push(`/work/${study.slug}: has no single "Headline result" panel`);
      continue;
    }
    const parts = [
      ['value', value],
      ['label', metric.label],
      ['basis', metric.basis],
    ] as const;
    for (const [part, text] of parts) {
      const shown = panel.getByText(text, { exact: true });
      if ((await shown.count()) !== 1 || !(await shown.isVisible())) {
        missing.push(`/work/${study.slug}: its panel does not show its metric ${part} "${text}"`);
      }
    }
    // The basis is what makes the figure checkable: what it counted, against what. It is printed
    // once on the page, so a second producer (#58's scope sentence) replaces this one, not joins it.
    if ((await page.getByText(metric.basis, { exact: false }).count()) !== 1) {
      missing.push(`/work/${study.slug}: prints its metric basis more than once`);
    }
  }

  expect(
    missing,
    'work/[slug]/page.tsx must show the figure its cards advertise, with its label and basis, ' +
      'read from case-studies.ts: the page a visitor opens to see the claim substantiated.',
  ).toEqual([]);
});
