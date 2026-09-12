import { expect, test, type Page } from '@playwright/test';

/**
 * Two promises the page makes about motion and does not keep.
 *
 * Rows R18 and R19 of the RED manifest, both fixed by #47.
 *
 * - R18 (hero-4) is ADR 0009 rule 4: an endless animation stops while nothing can see it. Seven
 *   `repeat: -1` animations keep running after the story has been scrolled past — `hero-section.tsx:40`
 *   and `:113`, `hero-content.tsx:78`, `hud-elements.tsx:291`, `execution-phase.tsx:284`,
 *   `game-complete.tsx:147`, `loop-phase.tsx:188` — off-screen or at `opacity: 0`, burning a phone
 *   battery for something nobody is looking at. Measured with `document.getAnimations()`, which sees
 *   both CSS and Web Animations API timelines, which is why it catches all seven despite their being
 *   written three different ways.
 * - R19 (hero-5) is the reduced-motion promise. `animated-text.tsx` has no reference to
 *   `prefers-reduced-motion` anywhere against fourteen mouse handlers, so under `reduce` — where every
 *   phase's *scroll* animation correctly returns early — hovering a heading still throws its letters
 *   around: 150 ms after hover a letter reads `translate3d(18.76px, 0, 0) rotate(7.44deg)`.
 *
 * R19 is the more interesting failure, because the page looks compliant: the scroll animations really
 * do respect the preference. It is only the hover ones that do not, and no existing spec hovers
 * anything under `reduce` (`featured-work.spec.ts` hovers under `reduce` but asserts SMIL counts, not
 * transforms).
 */

test.describe.configure({ retries: 0, timeout: 90_000 });

/** Walks to the bottom two frames at a time, so React commits and every ScrollTrigger fires. */
async function walkToBottom(page: Page) {
  await page.evaluate(async () => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    const step = Math.max(1, Math.round(window.innerHeight * 0.75));
    if (bottom() <= 0) throw new Error('the page is not taller than the viewport');
    let steps = 0;
    for (let y = 0; y <= bottom(); y += step) {
      if (++steps > 400) throw new Error('the walk did not reach the bottom in 400 steps');
      window.scrollTo({ top: y, behavior: 'instant' });
      await nextFrame();
    }
    window.scrollTo({ top: bottom(), behavior: 'instant' });
    await nextFrame();
  });
}

test('no endless animation keeps running off-screen or at opacity 0', async ({ page }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R18, #47' });

  // Motion allowed: under `reduce` these animations are never created and the row would be green for
  // the wrong reason.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    false,
  );

  await walkToBottom(page);
  // Let the timer-driven sequences settle so nothing is still legitimately mid-entrance.
  await page.waitForTimeout(9_000);

  const wasteful = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const offenders: string[] = [];
    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running') continue;
      // An endless animation is one with no finite end: `repeat: -1` (GSAP writes it as
      // `iterations: Infinity`) or a CSS `animation-iteration-count: infinite`.
      const timing = animation.effect?.getComputedTiming();
      if (!timing || Number.isFinite(timing.iterations ?? 1)) continue;
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (!(target instanceof Element)) continue;

      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      const offScreen = box.bottom <= 0 || box.top >= viewport.height || box.width === 0;
      const invisible =
        Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none';
      if (!offScreen && !invisible) continue;

      const cls = typeof target.className === 'string' ? target.className.slice(0, 50).trim() : '';
      offenders.push(
        `${target.tagName.toLowerCase()}.${cls} — ` +
          `${offScreen ? 'off-screen' : ''}${offScreen && invisible ? ' and ' : ''}` +
          `${invisible ? `opacity ${style.opacity}` : ''}`,
      );
    }
    return offenders;
  });

  expect(
    wasteful,
    'ADR 0009 rule 4: an endless animation stops while nothing can see it. These are still running ' +
      "at the bottom of the page. Pause them from the section's own ScrollTrigger onLeave, as " +
      'GameComplete already does for its CTA glow.',
  ).toEqual([]);
});

test('under reduce, hovering an animated heading moves nothing', async ({ page }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R19, #47' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'the whole point of this case is the reduce branch',
  ).toBe(true);

  // Every phase renders its finished state on mount under `reduce`, so all six headings are already
  // in place and no reveal is in flight: any transform seen below was put there by the hover.
  const moved = await page.evaluate(async () => {
    const headings = [...document.querySelectorAll<HTMLElement>('h2, h3')].filter((el) =>
      el.querySelector('[class*="cursor-pointer"], .relative'),
    );
    if (headings.length === 0) throw new Error('no animated headings found to hover');

    const offenders: string[] = [];
    for (const heading of headings) {
      const target = heading.querySelector<HTMLElement>('[class*="cursor-pointer"]') ?? heading;
      // Baseline: nothing may already be transformed before the hover, or this proves nothing.
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      // The measured window in the finding: a letter reads translate3d(18.76px, 0, 0) rotate(7.44deg)
      // 150 ms after the hover.
      await new Promise((resolve) => setTimeout(resolve, 200));

      for (const el of [target, ...target.querySelectorAll<HTMLElement>('*')]) {
        const transform = getComputedStyle(el).transform;
        if (transform === 'none' || transform === '') continue;
        offenders.push(
          `"${heading.textContent?.trim().slice(0, 30)}" — ` +
            `${el.tagName.toLowerCase()} transform: ${transform}`,
        );
        break;
      }
    }
    return offenders;
  });

  expect(
    moved,
    'animated-text.tsx has no reduced-motion reference against fourteen mouse handlers, so a ' +
      'visitor who asked for less motion still gets letters thrown around on hover. The scroll ' +
      'animations already respect the preference; the hover ones must too (ADR 0009).',
  ).toEqual([]);
});

test('the scroll animations do respect reduced motion', async ({ page }) => {
  // Green, and the reason R19 is worth a row of its own: the page is not indifferent to the
  // preference, it honours it in one place and not the other. If this ever goes red, R19's fix is
  // being blamed for something much larger.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  await walkToBottom(page);

  // Every phase renders its finished state instead of animating to it: the deepest proof is that the
  // content the animation would have revealed is simply there.
  await expect(page.getByText('DEPLOYMENT SUCCESSFUL').first()).toBeVisible();
  await expect(page.getByText('SELF-HEALING PROTOCOL ACTIVE').first()).toBeVisible();
  await expect(page.getByText('x12').first()).toBeVisible();
});
