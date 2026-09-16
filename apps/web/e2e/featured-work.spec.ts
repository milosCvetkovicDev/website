import { expect, test } from '@playwright/test';
import { getActiveConnections } from '../src/data/architecture-graph';
import { featuredProjects } from '../src/data/featured-projects';
import { formatMetric } from '../src/data/case-studies';
import { gotoHydrated } from './support/hydration';

const litCount = (project: (typeof featuredProjects)[number]) =>
  getActiveConnections(project.activeNodes).filter((connection) => connection.active).length;

test.describe('Featured Work', () => {
  test('cards light up the architecture diagram on hover and keyboard focus', async ({ page }) => {
    await gotoHydrated(page, '/');
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

    // The whole card is the hover target, not only the title text: hover the description, which
    // sits under the title link's ::after overlay (force skips the "receives events" check that the
    // overlay is designed to fail).
    const firstCard = section.getByRole('link', { name: first.title, exact: true });
    const secondCard = section.getByRole('link', { name: second.title, exact: true });
    await section.getByText(second.description, { exact: true }).hover({ force: true });
    await expect(secondCard).toHaveAttribute('data-active', 'true');
    await expect(firstCard).toHaveAttribute('data-active', 'false');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(litCount(second));

    await page.mouse.move(0, 0);
    await secondCard.focus();
    await expect(secondCard).toHaveAttribute('data-active', 'true');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(litCount(second));
  });

  test('renders no SMIL animations under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHydrated(page, '/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    const card = section.getByRole('link', { name: featuredProjects[1].title, exact: true });
    await card.hover();
    // The precondition that gives the zero below its meaning. The server markup has no SMIL either,
    // so without a card that is actually active this passed on a page whose hover did nothing.
    await expect(card).toHaveAttribute('data-active', 'true');
    await expect(section.locator('animateMotion, animate')).toHaveCount(0);
  });

  // The twin of the test above, and what makes its zero a statement about reduced motion: with motion
  // allowed, the same hover on the same card starts both kinds of SMIL. They are gated separately
  // (the packets on visibility and motion, the active nodes' pulse on motion alone), so each is
  // counted on its own: a single combined count stayed green with the packets switched off, because
  // the pulse alone kept it above zero.
  test('animates the active connections when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoHydrated(page, '/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    const card = section.getByRole('link', { name: featuredProjects[1].title, exact: true });
    await card.hover();
    await expect(card).toHaveAttribute('data-active', 'true');
    await expect
      .poll(() => section.locator('animateMotion').count(), {
        message: 'packets on the connections',
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => section.locator('animate').count(), { message: 'the active nodes pulsing' })
      .toBeGreaterThan(0);
  });

  // It used to visit /work only, so a home page stating different numbers passed. Both pages are
  // read now, each against the one data file. Reduced motion, so a counter the hover test left
  // running cannot be caught mid-count.
  test('the archive page states the same metrics as the home page', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/', '/work']) {
      await gotoHydrated(page, path);
      const scope =
        path === '/' ? page.getByRole('region', { name: /featured work/i }) : page.locator('main');
      for (const project of featuredProjects) {
        await expect(
          scope.getByText(formatMetric(project.metric), { exact: true }),
          `${project.title}'s metric on ${path}`,
        ).toBeVisible();
        await expect(scope.getByText(project.metric.label, { exact: true }).first()).toBeVisible();
      }
    }
  });
});
