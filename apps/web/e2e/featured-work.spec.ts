import { expect, test } from '@playwright/test';
import { getActiveConnections } from '../src/data/architecture-graph';
import { featuredProjects } from '../src/data/featured-projects';
import { formatMetric } from '../src/data/case-studies';
import { gotoHydrated } from './support/hydration';

/** How long the story's scroll-triggered timers may take to finish; see the hover test. */
const STORY_SETTLE_TIMEOUT_MS = 20_000;

const litCount = (project: (typeof featuredProjects)[number]) =>
  getActiveConnections(project.activeNodes).filter((connection) => connection.active).length;

test.describe('Featured Work', () => {
  test('cards light up the architecture diagram on hover and keyboard focus', async ({ page }) => {
    // Runs with motion allowed, which is what most visitors get, so the pointer rests on a card
    // while the story above it may still be animating. Two things moved the card away, both
    // measured under a 6x CDP CPU throttle (2026-09-17), each failing with
    // "Expected: 3, Received: 0":
    // - A hover before hydration has no React listener behind it. It lit the diagram only once
    //   hydration caught up, which came at or after the end of the expect window.
    // - The jump past the story fires the Gauntlet and Loop phases' ScrollTrigger `onEnter`. Their
    //   wall-clock timers then add content above this section: a log row every 400 ms, and the
    //   deployment panel 5.3 s in. The section slid 98-132 px down, the card left the
    //   pointer, and `mouseleave` switched it off.
    //
    // Waiting for the story makes the test longer. Under the same 6x throttle it passed in 19-23 s
    // at a load average of 5-20 on 12 CPUs, and ran out of the 30 s default in 7 of 20 runs at
    // 20-240, each time a bare "Test timeout" pending on a different line: throughput, not a hang.
    test.setTimeout(60_000);
    await gotoHydrated(page, '/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    // The last layout change of each phase: the Gauntlet's panel turning to success and the Loop's
    // alert resolving. Everything after them only fades opacity. Their timers put them 6.3 s and
    // 3.7 s after the jump, and later under load, so these wait past the default expect timeout.
    await expect(page.getByText('DEPLOYMENT SUCCESSFUL', { exact: true })).toBeVisible({
      timeout: STORY_SETTLE_TIMEOUT_MS,
    });
    await expect(page.getByText('RESOLVED', { exact: true })).toBeVisible({
      timeout: STORY_SETTLE_TIMEOUT_MS,
    });
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
    // Server markup has no SMIL at all, so the count below proves nothing until React is driving
    // the section: wait for hydration, then show the hover reached React and lit the diagram,
    // which is when an active node would add its pulsing <animate> if motion were not reduced.
    // Under `reduce` the phases above render their finished state in the re-render right after
    // hydration, which gotoHydrated waits through, so no growth moves the card here.
    //
    // The hydration wait includes the home page's loader. Under a 6x and a 10x CDP CPU throttle
    // this test ran out of the 30 s default in 1 of 20 and 3 of 5 runs, every time still waiting
    // for the loader to hide, so it gets the same room past that wait as the hover test.
    test.setTimeout(60_000);
    await gotoHydrated(page, '/');
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    const project = featuredProjects[1];
    const card = section.getByRole('link', { name: project.title, exact: true });
    await card.hover();
    await expect(card).toHaveAttribute('data-active', 'true');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(litCount(project));
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
