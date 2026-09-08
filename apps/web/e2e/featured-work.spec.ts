import { expect, test } from '@playwright/test';
import { getActiveConnections } from '../src/data/architecture-graph';
import { featuredProjects } from '../src/data/featured-projects';
import { formatMetric } from '../src/data/case-studies';

const litCount = (project: (typeof featuredProjects)[number]) =>
  getActiveConnections(project.activeNodes).filter((connection) => connection.active).length;

test.describe('Featured Work', () => {
  test('cards light up the architecture diagram on hover and keyboard focus', async ({ page }) => {
    await page.goto('/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('svg').first()).toBeVisible();

    for (const project of featuredProjects) {
      await expect(section.getByRole('link', { name: project.title, exact: true })).toBeVisible();
    }
    await expect(section.locator('path[data-active="true"]')).toHaveCount(0);

    const [first, second] = featuredProjects;
    await section.getByRole('link', { name: first.title, exact: true }).hover();
    await expect(section.locator('path[data-active="true"]')).toHaveCount(litCount(first));

    await page.mouse.move(0, 0);
    const secondCard = section.getByRole('link', { name: second.title, exact: true });
    await secondCard.focus();
    await expect(secondCard).toHaveAttribute('data-active', 'true');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(litCount(second));
  });

  test('renders no SMIL animations under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    await section.getByRole('link', { name: featuredProjects[1].title, exact: true }).hover();
    await expect(section.locator('animateMotion, animate')).toHaveCount(0);
  });

  test('the archive page states the same metrics as the home page', async ({ page }) => {
    await page.goto('/work');
    for (const project of featuredProjects) {
      await expect(page.getByText(formatMetric(project.metric), { exact: true })).toBeVisible();
      await expect(page.getByText(project.metric.label, { exact: true }).first()).toBeVisible();
    }
  });
});
