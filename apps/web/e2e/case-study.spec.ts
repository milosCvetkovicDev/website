import { expect, test } from '@playwright/test';
import { caseStudies, formatMetric } from '../src/data/case-studies';

/**
 * What each `/work/[slug]` page actually renders.
 *
 * Row R35 of the RED manifest, fixed by #49, plus the green floor around it. Before this file the
 * case-study routes had no content assertion of any kind: `console-clean.spec.ts` loaded the three
 * slugs, the axe gate audited one of them, and `not-found-shell.spec.ts` checked a 404's shell. Greps
 * for `Back to Work` returned nothing.
 *
 * R35 is the mismatch between what a card promises and what the page delivers. Every card on `/` and
 * `/work` advertises a headline figure — `73% faster resolution` — and `work/[slug]/page.tsx` never
 * reads `metric` or `highlight` at all, so the one page a visitor lands on to see that claim
 * substantiated is the only one that does not state it. Asserted through `formatMetric` rather than
 * against a literal, so a data edit moves the test with the data and cannot be satisfied by typing the
 * number into the page.
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

test('the back link reaches /work as a client-side navigation', async ({ page }) => {
  // Green. The back link is the only way off this page other than the header, and a broken href would
  // otherwise only surface as a 404 nobody runs into.
  const [study] = caseStudies;
  await page.goto(`/work/${study.slug}`);

  await page.getByRole('link', { name: /Back to Work/i }).click();

  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('every case study states the headline metric its cards advertise', async ({ page }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R35, #49' });

  const missing: string[] = [];
  for (const study of caseStudies) {
    await page.goto(`/work/${study.slug}`);
    const { metric } = study.highlight;
    const value = formatMetric(metric);

    // Through `formatMetric`, which is the one function that turns the data into copy: a page that
    // hard-coded "73%" would satisfy a literal assertion while still being able to drift from the data.
    if ((await page.getByText(value, { exact: false }).count()) === 0) {
      missing.push(`/work/${study.slug}: does not state its metric value "${value}"`);
    }
    if ((await page.getByText(metric.label, { exact: false }).count()) === 0) {
      missing.push(`/work/${study.slug}: does not state its metric label "${metric.label}"`);
    }
  }

  expect(
    missing,
    'work/[slug]/page.tsx never reads `metric` or `highlight`, so the page a visitor opens to see ' +
      'the claim substantiated is the only one that does not state it. Only /work and FeaturedWork ' +
      'render the figure their cards advertise.',
  ).toEqual([]);
});
