import { expect, test } from '@playwright/test';
import { CONNECTIONS, getActiveConnections } from '../src/data/architecture-graph';
import { featuredProjects } from '../src/data/featured-projects';
import { formatMetric } from '../src/data/case-studies';
import { expectGsapLoaded } from './support/gsap';
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
    // The sequences waited on below run on GSAP, which arrives after hydration. Waiting for it also
    // keeps the jump out of the moment after hydration in which Chromium can undo a scripted scroll
    // (hero.spec.ts, 'scroll indicator fades on scroll').
    await expectGsapLoaded(page);
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
    // Under a 6x and a 10x CDP CPU throttle this test ran out of the 30 s default in 1 of 20 and 3
    // of 5 runs, every time in the hydration wait (then still including the boot loader ADR 0022
    // removed), so it gets the same room past that wait as the hover test.
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

  test('renders SMIL animations when motion is allowed', async ({ page }) => {
    // The twin of the test above, and what makes its zero mean something: the same steps with
    // motion allowed find each kind of SMIL element that one counts, where it belongs
    // (architecture-background.tsx). Before a hover an idle packet (<animateMotion>) runs on every
    // connection and nothing pulses; once a card is active only its lit connections carry a packet,
    // and each of its active nodes pulses (<animate>). Motion allowed means the story above runs, so
    // this hovers only after it settles, as the hover test does and for the same reasons, with the
    // same room.
    test.setTimeout(60_000);
    // The same card as the reduced-motion test, so the two measure the same diagram state.
    const project = featuredProjects[1];
    expect(project, 'a second featured project to hover').toBeDefined();
    const lit = litCount(project);
    expect(lit, `${project.title} lights at least one connection`).toBeGreaterThan(0);
    expect(project.activeNodes.length, `${project.title} activates a node`).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoHydrated(page, '/');
    await expectGsapLoaded(page);
    const section = page.getByRole('region', { name: /featured work/i });
    await section.scrollIntoViewIfNeeded();
    await expect(page.getByText('DEPLOYMENT SUCCESSFUL', { exact: true })).toBeVisible({
      timeout: STORY_SETTLE_TIMEOUT_MS,
    });
    await expect(page.getByText('RESOLVED', { exact: true })).toBeVisible({
      timeout: STORY_SETTLE_TIMEOUT_MS,
    });

    const packets = section.locator('animateMotion');
    const pulses = section.locator('animate');
    await expect(packets, 'an idle packet on every connection').toHaveCount(CONNECTIONS.length);
    await expect(pulses, 'no pulse before a card is active').toHaveCount(0);

    const card = section.getByRole('link', { name: project.title, exact: true });
    await card.hover();
    await expect(card).toHaveAttribute('data-active', 'true');
    await expect(section.locator('path[data-active="true"]')).toHaveCount(lit);
    // Each kind on its own, so neither can stand in for the other, and each scoped to where it
    // belongs: a packet in a lit connection's group, a pulse in an active node's group. The unscoped
    // counts then say there is nothing anywhere else.
    await expect(
      section.locator('g:has(> path[data-active="true"]) animateMotion'),
      'no packet moves along the lit connections',
    ).toHaveCount(lit);
    await expect(packets, 'a packet moves along an unlit connection').toHaveCount(lit);
    await expect(
      section.locator('g[data-active="true"] animate'),
      "the hovered card's active nodes do not pulse",
    ).toHaveCount(project.activeNodes.length);
    await expect(pulses, 'something other than an active node pulses').toHaveCount(
      project.activeNodes.length,
    );
  });

  test('the archive page states the same metrics as the home page', async ({ page }) => {
    // The home page's cards count their metric up while active; under reduced motion MetricCounter
    // renders the final value at once (metric-counter.tsx), so what is read here is what it settles on.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHydrated(page, '/');
    const section = page.getByRole('region', { name: /featured work/i });
    for (const project of featuredProjects) {
      const card = section
        .getByRole('listitem')
        .filter({ has: page.getByRole('link', { name: project.title, exact: true }) });
      await expect(card, `the ${project.title} card on /`).toHaveCount(1);
      await expect(card.getByText(formatMetric(project.metric), { exact: true })).toBeVisible();
      await expect(card.getByText(project.metric.label, { exact: true })).toBeVisible();
    }

    // Each project's own card on /work too, so a metric shown on the wrong card cannot pass.
    await gotoHydrated(page, '/work');
    for (const project of featuredProjects) {
      const card = page.locator(`a[href="/work/${project.slug}"]`);
      await expect(card, `the ${project.title} card on /work`).toHaveCount(1);
      await expect(card.getByText(formatMetric(project.metric), { exact: true })).toBeVisible();
      await expect(card.getByText(project.metric.label, { exact: true })).toBeVisible();
    }
  });
});
