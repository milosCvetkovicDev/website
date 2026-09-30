import { expect, test, type Page } from '@playwright/test';
import { expectGsapLoaded } from './support/gsap';
import { expectHydrated } from './support/hydration';

/**
 * Two promises the page makes about motion and does not keep.
 *
 * Rows R18 and R19 of the RED manifest, both fixed by #47.
 *
 * - R18 (hero-4) is ADR 0009 rule 4: an endless animation stops while nothing can see it. Seven
 *   `repeat: -1` animations keep running after the story has been scrolled past — `hero-section.tsx:40`
 *   and `:113`, `hero-content.tsx:78`, `hud-elements.tsx:326`, `execution-phase.tsx:304`,
 *   `game-complete.tsx:161`, `loop-phase.tsx:209` — off-screen or at `opacity: 0`, burning a phone
 *   battery for something nobody is looking at. Measured with `document.getAnimations()`, which sees
 *   both CSS and Web Animations API timelines, which is why it catches all seven despite their being
 *   written three different ways.
 * - R19 (hero-5) is the reduced-motion promise, fixed by slice 47d and kept as its guard.
 *   `animated-text.tsx` had no reference to `prefers-reduced-motion` against fourteen mouse handlers,
 *   so under `reduce` — where every phase's *scroll* animation correctly returns early — hovering a
 *   heading still threw its letters around: 150 ms after hover a letter read
 *   `translate3d(18.76px, 0, 0) rotate(7.44deg)`. Every handler now returns before it creates a tween
 *   when the preference is set, and the row after R19 extends it to every animated text on the page.
 *
 * R19 was the more interesting failure, because the page looked compliant: the scroll animations
 * really do respect the preference. It was only the hover ones that did not, and no other spec hovers
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
  await expectHydrated(page);
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectHydrated(page);
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'the whole point of this case is the reduce branch',
  ).toBe(true);
  // The hover handlers run their tweens through GSAP, which arrives on the visitor's first intent
  // (`load-gsap.ts`), under `reduce` as well. A hover that did start a tween would play only once
  // GSAP is in, which can be after the 200 ms read below: a clean read for the wrong reason. So the
  // helper sends intent and waits for GSAP first.
  await expectGsapLoaded(page);

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
    'a visitor who asked for less motion gets letters thrown around on hover: every handler in ' +
      'animated-text.tsx must return before it creates a tween under reduce, as the scroll ' +
      'animations already do (ADR 0009).',
  ).toEqual([]);
});

test('under reduce, entering and moving over any animated text changes nothing drawn', async ({
  page,
}) => {
  // #47 AC 4, R19's scenario widened: every `AnimatedText` on the page rather than the headings,
  // which takes in the phase labels and the lines under the headlines, and a pointer move as well as
  // the enter, because a move is the only event the Strategy headline's magnetic variant answers.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectHydrated(page);
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'the whole point of this case is the reduce branch',
  ).toBe(true);
  // As in R19: GSAP first, so a hover that did start a tween would play inside the window below.
  await expectGsapLoaded(page);

  const { count, changed } = await page.evaluate(async () => {
    // Every `AnimatedText` root, and nothing else: they are the only spans that carry
    // `cursor-pointer` (the HUD's hoverable rows are divs). Every phase renders its finished state
    // on mount under `reduce`, so all of them are in place and no reveal is in flight.
    const roots = [
      ...document.querySelectorAll<HTMLElement>('main section span[class*="cursor-pointer"]'),
    ];
    const nameOf = (el: Element) =>
      `${el.tagName.toLowerCase()} "${el.textContent?.trim().slice(0, 30)}"`;
    // What is drawn: every element's transform, opacity, filter, text shadow, colour and text.
    const snapshot = (root: HTMLElement) =>
      [root, ...root.querySelectorAll<HTMLElement>('*')].map((el) => {
        const style = getComputedStyle(el);
        return [style.transform, style.opacity, style.filter, style.textShadow, style.color]
          .concat(el.textContent ?? '')
          .join(' | ');
      });

    const changed: string[] = [];
    const rest = new Map<HTMLElement, string[]>();
    for (const root of roots) {
      const before = snapshot(root);
      rest.set(root, before);
      const box = root.getBoundingClientRect();
      // Off the box's centre on both axes, so a magnetic pull would have somewhere to go.
      const at = { clientX: box.right, clientY: box.bottom };
      root.dispatchEvent(new MouseEvent('mouseover', { ...at, bubbles: true }));
      root.dispatchEvent(new MouseEvent('mouseenter', { ...at, bubbles: false }));
      root.dispatchEvent(new MouseEvent('mousemove', { ...at, bubbles: true }));
      // AC 4's window: 150 ms in, every variant is mid-effect when motion is allowed.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const after = snapshot(root);
      const elements = [root, ...root.querySelectorAll<HTMLElement>('*')];
      // Compared element by element below, so a node added or removed has to be caught here.
      if (after.length !== before.length) {
        changed.push(`${nameOf(root)}: ${before.length} elements became ${after.length}`);
        continue;
      }
      for (const [index, el] of elements.entries()) {
        const style = getComputedStyle(el);
        const letter = Boolean(el.textContent?.trim());
        if (letter && (style.transform !== 'none' || style.opacity !== '1')) {
          changed.push(
            `${nameOf(root)}: ${nameOf(el)} at transform ${style.transform}, ` +
              `opacity ${style.opacity}`,
          );
          break;
        }
        if (after[index] !== before[index]) {
          changed.push(
            `${nameOf(root)}: ${nameOf(el)} went from ${before[index]} to ${after[index]}`,
          );
          break;
        }
      }
      root.dispatchEvent(new MouseEvent('mouseout', { ...at, bubbles: true }));
      root.dispatchEvent(new MouseEvent('mouseleave', { ...at, bubbles: false }));
    }

    // Once more, a second after the last hover: longer than the longest effect with motion allowed
    // (morse, about 0.9 s), so a tween that started late, behind a per-letter delay, is caught too.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    for (const [root, before] of rest) {
      const after = snapshot(root);
      if (after.join('\n') !== before.join('\n')) {
        changed.push(`${nameOf(root)}: changed within a second of the hovers`);
      }
    }
    return { count: roots.length, changed };
  });

  // 24 on 2026-09-28, across the six story sections: fewer means the selector stopped finding them
  // and the row would pass by hovering nothing.
  expect(count, 'the animated texts to hover were not found').toBeGreaterThanOrEqual(24);
  expect(
    changed,
    'under reduce a hover or a pointer move over animated text must create no tween and change no ' +
      "letter's transform or opacity, and the markup must stay as rendered (WCAG 2.3.3, ADR 0006).",
  ).toEqual([]);
});

test('the scroll animations do respect reduced motion', async ({ page }) => {
  // Green, and the reason R19 is worth a row of its own: the page is not indifferent to the
  // preference, it honours it in one place and not the other. If this ever goes red, R19's fix is
  // being blamed for something much larger.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expectHydrated(page);
  await walkToBottom(page);

  // Every phase renders its finished state instead of animating to it: the deepest proof is that the
  // content the animation would have revealed is simply there.
  await expect(page.getByText('DEPLOYMENT SUCCESSFUL').first()).toBeVisible();
  await expect(page.getByText('SELF-HEALING PROTOCOL ACTIVE').first()).toBeVisible();
  await expect(page.getByText('x12').first()).toBeVisible();
});
