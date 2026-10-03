import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectGsapLoaded } from './support/gsap';
import { expectHydrated } from './support/hydration';

/**
 * Two promises the page makes about motion, which it once did not keep.
 *
 * Rows R18 and R19 of the RED manifest, both fixed by #47.
 *
 * - R18 (hero-4) is ADR 0009 rule 4: an endless animation stops while nothing can see it. Seven
 *   endless animations kept running after the story had been scrolled past — the hero's glow and
 *   scroll dot, its status pulse, TypingCursor's blink, the Execution caret, GameComplete's arrow and
 *   the Loop's alert dot — off-screen or at an effective opacity of 0, burning a phone battery for
 *   something nobody is looking at. Slice 47g fixed it: `useStoryVisibility` marks the hero and each
 *   phase section `data-story-visible="false"` while it is out of view, a `globals.css` rule pauses
 *   the endless animations inside one, and the scroll dot pauses while its indicator is faded out.
 *   Measured with `document.getAnimations()`, which sees both CSS and Web Animations API timelines,
 *   which is why it caught all seven despite their being written three different ways. It never sees
 *   a GSAP tween, which GSAP writes inline from its ticker: the story's one that repeats,
 *   GameComplete's CTA glow, pauses from its own ScrollTrigger. The pause works a section at a time
 *   and ignores opacity, so R18 measures at the bottom of the page, with every section out of view.
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

/** The hero `<section>`, by the start of its aria-label. */
const heroSection = (page: Page) => page.locator('section[aria-label^="Hero"]');

/**
 * Every story section whose `data-story-visible` disagrees with where it is: the IntersectionObserver
 * path on its own, before any animation is read. The story wrapper is the hero's grandparent
 * (AnimatedHero's outer `div`, around the content layer), and it holds exactly the hero and the six
 * phases: featured work's `<section>` would make eight if the wrapper were ever `<main>`.
 */
async function storyVisibilityMismatches(page: Page) {
  return page.evaluate(() => {
    const story = document.querySelector('section[aria-label^="Hero"]')?.parentElement
      ?.parentElement;
    const sections = story ? [...story.querySelectorAll('section')] : [];
    if (sections.length !== 7)
      return [`the story wrapper holds ${sections.length} sections, not 7`];
    return sections.flatMap((section, index) => {
      const box = section.getBoundingClientRect();
      const { innerWidth: width, innerHeight: height } = window;
      const inView = box.bottom > 0 && box.top < height && box.right > 0 && box.left < width;
      // The observer counts a section touching the viewport's edge as intersecting: either is right.
      const onEdge = Math.abs(box.bottom) < 1 || Math.abs(box.top - height) < 1;
      const attribute = section.getAttribute('data-story-visible');
      if (attribute === String(inView) || (onEdge && attribute !== null)) return [];
      return [`section ${index + 1} is ${inView ? 'in' : 'out of'} view, marked ${attribute}`];
    });
  });
}

/** The story's named endless animations, by keyframe name, with each one's play state. */
async function animationStates(page: Page, names: string[]) {
  return page.evaluate(
    (names) =>
      document
        .getAnimations()
        .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
        .map((animation) => [animation.animationName, animation.playState])
        .filter(([name]) => names.includes(name))
        .sort(([a], [b]) => a.localeCompare(b)),
    names,
  );
}

const HERO_ANIMATIONS = ['hero-breathe', 'hero-scroll-bounce', 'hero-status-pulse'];
const heroAnimationStates = (page: Page) => animationStates(page, HERO_ANIMATIONS);
const caretState = (page: Page) => animationStates(page, ['caret-pulse']);
const each = (state: string, names = HERO_ANIMATIONS) => names.map((name) => [name, state]);

/**
 * Wheels the page, as a visitor does, until `region`'s top sits at the viewport's top. Not
 * window.scrollTo: Chromium can undo a scripted scroll made this soon after hydration (see 'scroll
 * indicator fades on scroll' in hero.spec.ts).
 */
async function parkOn(page: Page, region: Locator) {
  await page.mouse.move(640, 512);
  await expect(async () => {
    const top = await region.evaluate((el) => el.getBoundingClientRect().top);
    if (Math.abs(top) > 8) await page.mouse.wheel(0, top);
    expect(Math.abs(await region.evaluate((el) => el.getBoundingClientRect().top))).toBeLessThan(
      64,
    );
  }).toPass({ timeout: 10_000 });
}

// The Scroll indicator is displayed from `lg` and 1024 px tall only (#134, #58), and an element
// that is not displayed runs no CSS animation at all, so at the desktop project's 1280x720 its dot
// would be missing from both tests below rather than measured. This spec sits outside
// `e2e/mobile/`, so it runs on the desktop project only (playwright.config.ts, MOBILE_SPECS), as it
// did at 1280x720.
test.describe('at 1280x1024, where the scroll indicator is displayed', () => {
  test.use({ viewport: { width: 1280, height: 1024 } });

  test('no endless animation keeps running off-screen or at opacity 0', async ({ page }) => {
    // Motion allowed: under `reduce` these animations are never created and the row would be green
    // for the wrong reason.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expectHydrated(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      false,
    );

    await walkToBottom(page);
    // Not a wait for a settled state: an endless animation running out of view is wrong at any
    // moment. The wait lets a sequence that adds an endless element late (a spinner once a stage
    // starts, a pulse once an alert lands) do so before the count, so it is measured, not missed.
    await page.waitForTimeout(9_000);
    // Chromium can undo a scripted scroll soon after hydration: measure at the bottom, not at the
    // top with the hero in view.
    await expect(async () => {
      const atBottom = await page.evaluate(() => {
        const bottom = document.documentElement.scrollHeight - window.innerHeight;
        if (window.scrollY < bottom - 2) window.scrollTo({ top: bottom, behavior: 'instant' });
        return window.scrollY >= bottom - 2;
      });
      expect(atBottom, 'the walk ends at the bottom of the page').toBe(true);
      expect(
        await heroSection(page).evaluate((el) => el.getBoundingClientRect().bottom),
      ).toBeLessThanOrEqual(0);
    }).toPass({ timeout: 10_000 });
    await expect
      .poll(() => storyVisibilityMismatches(page), {
        message: 'each story section is marked data-story-visible by where it is',
      })
      .toEqual([]);

    const { endless, wasteful, outside } = await page.evaluate(() => {
      // The story wrapper, as storyVisibilityMismatches checked it: seven sections exactly. AC 5
      // holds the story to the rule; the featured work below it has endless pulses of its own, which
      // are a follow-up of #47 and reported here without failing.
      const story = document.querySelector('section[aria-label^="Hero"]')?.parentElement
        ?.parentElement;
      if (!story || story.querySelectorAll('section').length !== 7) {
        throw new Error(
          'the story wrapper, holding the hero and six phase sections, was not found',
        );
      }
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const offenders: string[] = [];
      const outside: string[] = [];
      let endless = 0;
      for (const animation of document.getAnimations()) {
        // An endless animation is one with no finite end: a CSS `animation-iteration-count:
        // infinite` or a Web Animations `iterations: Infinity`. GSAP's own tweens never show up
        // here: it writes inline styles from its ticker.
        const timing = animation.effect?.getComputedTiming();
        if (!timing || Number.isFinite(timing.iterations ?? 1)) continue;
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target;
        if (!(target instanceof Element)) continue;
        const inStory = story.contains(target);
        if (inStory) endless++;
        if (animation.playState !== 'running') continue;

        const box = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        const offScreen =
          box.bottom <= 0 ||
          box.top >= viewport.height ||
          box.right <= 0 ||
          box.left >= viewport.width ||
          box.width === 0;
        // Effective opacity: every ancestor's, and the target's own unless this animation is what
        // moves it, or a blink caught on its off beat would read as invisible. The scroll dot's own
        // opacity is its keyframes', while the wrapper that fades the indicator out takes it to 0.
        const animatesOpacity = effect?.getKeyframes().some((frame) => 'opacity' in frame);
        let opacity = animatesOpacity ? 1 : Number(style.opacity);
        for (let el = target.parentElement; el; el = el.parentElement) {
          opacity *= Number(getComputedStyle(el).opacity);
        }
        const invisible = opacity === 0 || style.visibility === 'hidden';
        if (!offScreen && !invisible) continue;

        const cls =
          typeof target.className === 'string' ? target.className.slice(0, 50).trim() : '';
        (inStory ? offenders : outside).push(
          `${target.tagName.toLowerCase()}.${cls} — ` +
            `${offScreen ? 'off-screen' : ''}${offScreen && invisible ? ' and ' : ''}` +
            `${invisible ? `effective opacity ${opacity}` : ''}`,
        );
      }
      return { endless, wasteful: offenders, outside };
    });

    if (outside.length > 0) {
      test.info().annotations.push({
        type: 'outside the story (featured work, a follow-up of #47)',
        description: outside.join('; '),
      });
    }
    // Paused animations still exist, so the story's endless animations are counted here whatever
    // their state: the hero's three at least, or the row would pass by measuring nothing.
    expect(endless, 'the endless animations in the story were not found').toBeGreaterThanOrEqual(3);
    expect(
      wasteful,
      'ADR 0009 rule 4: an endless animation stops while nothing can see it. These CSS or Web ' +
        'Animations are still running at the bottom of the page, where every story section is out ' +
        "of view. A CSS one inside a story section takes a class listed in globals.css's " +
        'data-story-visible rule. A GSAP tween is invisible to this measure: one that repeats ' +
        "pauses from its own ScrollTrigger, as GameComplete's CTA glow does.",
    ).toEqual([]);
  });

  test("parked on a phase, the hero's endless animations pause and the phase's run, and back", async ({
    page,
  }) => {
    // #47 AC 5's second half, the scenario "Off-screen animations stop": the hero's breathing glow,
    // its status pulse and the scroll dot, and the Execution caret for a phase, each found by its
    // keyframes. The scroll dot also pauses inline once the page has scrolled 100 px, which it
    // always has when the hero is out of view; the glow and the status pulse have only the rule.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expectHydrated(page);
    await expect
      .poll(async () => [...(await heroAnimationStates(page)), ...(await caretState(page))], {
        message: 'at the top, the hero runs and the Execution caret, far below, waits',
      })
      .toEqual([...each('running'), ['caret-pulse', 'paused']]);

    await parkOn(page, page.getByRole('region', { name: /strategy/i }));
    expect(
      await heroSection(page).evaluate((el) => el.getBoundingClientRect().bottom),
      'the hero is entirely above the viewport',
    ).toBeLessThanOrEqual(0);
    await expect
      .poll(() => heroAnimationStates(page), {
        message: 'with the hero out of view, its glow, status pulse and scroll dot all pause',
      })
      .toEqual(each('paused'));

    await parkOn(page, page.getByRole('region', { name: /execution/i }));
    await expect
      .poll(() => caretState(page), { message: 'parked on Execution, its caret runs' })
      .toEqual([['caret-pulse', 'running']]);
    await expect.poll(() => storyVisibilityMismatches(page)).toEqual([]);

    await expect(async () => {
      if ((await page.evaluate(() => window.scrollY)) > 0) await page.mouse.wheel(0, -100_000);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }).toPass({ timeout: 10_000 });
    await expect
      .poll(async () => [...(await heroAnimationStates(page)), ...(await caretState(page))], {
        message: 'back at the top, the hero runs again and the caret waits again',
      })
      .toEqual([...each('running'), ['caret-pulse', 'paused']]);
  });
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
      el.querySelector('[data-animation]'),
    );
    if (headings.length === 0) throw new Error('no animated headings found to hover');

    const offenders: string[] = [];
    for (const heading of headings) {
      const target = heading.querySelector<HTMLElement>('[data-animation]') ?? heading;
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
    // `data-animation`. Every phase renders its finished state on mount under `reduce`, so all of
    // them are in place and no reveal is in flight.
    const roots = [...document.querySelectorAll<HTMLElement>('main section span[data-animation]')];
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
