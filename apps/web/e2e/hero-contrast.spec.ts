import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectGsapLoaded } from './support/gsap';
import { expectHydrated } from './support/hydration';
import { PAGE_HEADINGS } from './support/page-headings';
import { TMUX_LOG_STREAM, tmuxLogStreamProblems } from './support/tmux-log-stream';

/**
 * The hero's own text colours, measured by computed style rather than by axe.
 *
 * Rows R12, R13 and R17 of the RED manifest, all fixed by #47. R17 is fixed by slice 47d and was
 * restated there: it hovered under `reduce`, where the glitch no longer plays, so it now hovers with
 * motion allowed, after the section's entrance, and samples only the glitch's own text. R12 and R13
 * are fixed by slice 47c, which paints the skill tags, "Scroll to see how." and the Scroll label in
 * theme tokens at full alpha.
 *
 * Axe cannot decide these nodes and never will: the island sets `backdrop-filter: blur(28px)` over a
 * radial-gradient glow, so axe answers `incomplete` with messageKey `bgGradient` — "background could
 * not be determined" — for the `Scroll` label and all eight skill tags, in both schemes. The
 * accessibility gate only fails on `violations`, which is how the hero ships at 2.6:1 with four green
 * axe tests. `e2e/accessibility.spec.ts` now records those `incomplete` counts as a budget so they
 * cannot quietly grow; deciding the colours is this file's job, and it is why the colour rows are a
 * separate spec rather than a stricter axe run.
 *
 * The instrument: read `getComputedStyle(el).color`, reject any alpha below 1, composite the colour
 * over the element's own resolved background stack and compute the WCAG 2.1 contrast ratio here in the
 * spec. Same again after `hover()`. It is honest about one limit: the composite walks ancestor
 * `background-color`s, so a gradient or an image behind the text is approximated by whatever solid
 * colour sits under it. That is the same approximation a reviewer makes with a colour picker, it is
 * conservative for this page (the hero glow is `rgba(139,92,246,0.06)` over the page background), and
 * it is why the numbers below are recorded as measurements rather than as the definition of the bug.
 *
 * Measured on 2026-09-12 against the hero as it then shipped, which is what R12 and R13 were RED for:
 *
 *   Scroll label      2.56:1 light   2.84:1 dark    (`HeroSection`'s inline colour, alpha 0.7)
 *   skill tags        2.69:1 light   3.21:1 dark    (`SkillTags`, alpha 0.7 / 0.6)
 *   skill tag hover   2.70:1 light                  (`hover:text-[#a78bfa]`, opaque but too light)
 *
 * All of them at 9-10px, where AA asks for 4.5:1. Those agree with the numbers recorded in the task's
 * manifest to within 0.03, which is the rounding in the composite. "Scroll to see how." was a
 * violet-to-cyan gradient clipped to the text, whose stops measured 2.70:1 and 1.79:1 in light.
 */

test.describe.configure({ retries: 0 });

const AA_NORMAL_TEXT = 4.5;
const colorSchemes = ['light', 'dark'] as const;

interface Sample {
  /** A short description of the element, so a failure names the offender. */
  what: string;
  /** The `color` exactly as the browser resolved it. */
  color: string;
  alpha: number;
  /** The colour composited over its background stack, as `[r, g, b]` in sRGB. */
  rgb: [number, number, number];
  background: [number, number, number];
  fontSizePx: number;
  bold: boolean;
  /** The ancestor background layers the composite walked, nearest first, for the failure message. */
  chain: string[];
}

/** sRGB relative luminance, WCAG 2.1 §relativeluminancedef. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** 3:1 is enough for text at 18.66px bold or 24px regular; everything measured here is 9-10px. */
const requiredRatio = ({ fontSizePx, bold }: Sample) =>
  fontSizePx >= 24 || (bold && fontSizePx >= 18.66) ? 3 : AA_NORMAL_TEXT;

const ratioOf = (sample: Sample) => contrastRatio(sample.rgb, sample.background);
const round = (n: number) => Math.round(n * 100) / 100;
const passesAA = (sample: Sample) => ratioOf(sample) >= requiredRatio(sample);

const describeSample = (sample: Sample) =>
  `${sample.what}: color ${sample.color} (alpha ${round(sample.alpha)}) on ` +
  `rgb(${sample.background.join(', ')}) = ${round(ratioOf(sample))}:1, needs ` +
  `${requiredRatio(sample)}:1 at ${round(sample.fontSizePx)}px` +
  `\n      background layers: ${sample.chain.join(' < ') || '(none, assumed white)'}`;

/**
 * Installs the page-side colour probe. One implementation, used by both the per-element sampling and
 * the whole-hero sweep, because a second copy of the compositing rules is a second place to get them
 * wrong. Must be called before the navigation.
 */
async function installColorProbe(page: Page) {
  await page.addInitScript(() => {
    // Colours are resolved by painting them on a 1x1 canvas and reading the pixel back, not by
    // pulling numbers out of the string. Tailwind v4 emits an alpha-modified colour as
    // `oklab(L a b / A)`, so `bg-white/80` computes to `oklab(0.999994 0.0000456 0.0000201 / 0.8)`,
    // and a numeric parse reads its first three components as an almost-black RGB: that composited the
    // hero island over a dark base and reported the light-theme skill tags at 2.08:1 instead of
    // 2.69:1 — wrong by enough to mislead the fix. The canvas accepts every syntax the browser does
    // (hex, rgb, oklab, oklch, `color()`, named, `transparent`) and answers in sRGB, which is what the
    // WCAG formula wants.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      if (!ctx || !value || value === 'none') return [0, 0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      // A value the canvas cannot parse leaves fillStyle unchanged, so seed a sentinel and notice.
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    };
    const over = (top: Rgba, bottom: [number, number, number]): [number, number, number] => [
      Math.round(top[0] * top[3] + bottom[0] * (1 - top[3])),
      Math.round(top[1] * top[3] + bottom[1] * (1 - top[3])),
      Math.round(top[2] * top[3] + bottom[2] * (1 - top[3])),
    ];

    // `color` measures another colour drawn over the same stack, such as a text-shadow's, in place
    // of the element's own.
    (window as unknown as Record<string, unknown>).__contrastProbe = (
      el: HTMLElement,
      color?: string,
    ) => {
      const layers: Rgba[] = [];
      const chain: string[] = [];
      let base: [number, number, number] | null = null;
      for (let node: Element | null = el; node; node = node.parentElement) {
        const raw = getComputedStyle(node).backgroundColor;
        const background = parse(raw);
        if (background[3] === 0) continue;
        const cls = typeof node.className === 'string' ? node.className.slice(0, 40).trim() : '';
        chain.push(`${node.tagName.toLowerCase()}.${cls}=${raw}`);
        if (background[3] >= 1) {
          base = [background[0], background[1], background[2]];
          break;
        }
        layers.push(background);
      }
      // Nothing opaque all the way up means the canvas of the page itself, which the UA paints white.
      base ??= [255, 255, 255];
      // Bottom-most translucent layer first, so each composites over what is already resolved.
      for (const layer of layers.reverse()) base = over(layer, base);

      const style = getComputedStyle(el);
      const measured = color ?? style.color;
      const rgba = parse(measured);
      return {
        color: measured,
        alpha: rgba[3],
        rgb: over(rgba, base),
        background: base,
        fontSizePx: parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 700,
        chain,
      };
    };
  });
}

type ProbeResult = Omit<Sample, 'what'>;
type ProbeWindow = { __contrastProbe: (el: HTMLElement, color?: string) => ProbeResult };

/** One element's colour and the background it is painted over. */
async function sampleColor(locator: Locator, what: string): Promise<Sample> {
  const raw = await locator.evaluate((el) =>
    (window as unknown as ProbeWindow).__contrastProbe(el as HTMLElement),
  );
  return { what, ...raw };
}

/** A sweep's sample: the probe's reading, the element's own text, and how its glyphs are filled. */
interface SweptSample extends Sample {
  text: string;
  /** The computed `-webkit-text-fill-color`, which paints the glyphs over `color` when set. */
  fill: string;
  /** Whether a background is clipped to the text, which paints the glyphs with an image. */
  clippedToText: boolean;
}

/**
 * Every element inside the hero section that carries text of its own, in one round trip, less the
 * tmux background's log stream (`TMUX_LOG_STREAM`). Those lines are painted in the `--log-*`
 * colours, 0.35 to 0.55 alpha by design, and start streaming on an idle callback plus up to 2 s, so
 * whether a sweep met one depended on how fast the page settled: a dark run on 2026-09-30 listed a
 * line beside the skill tags. They are decoration behind the island, tracked as DIM5 in
 * `src/test/dimmed-text.test.ts`, and `accessibility.spec.ts` leaves the same containers out of its
 * at-rest pass. `tmuxLogStreamProblems` runs before and after, so the exclusion can cover nothing
 * but the stream, and everything else in the tmux background, its bars and pane titles, is swept.
 * Elements that are not displayed are swept too: their computed `color` is the one they would
 * paint, so the Scroll label, `display: none` below 1024 px tall, is still read.
 */
async function sampleHeroText(page: Page): Promise<SweptSample[]> {
  const why =
    `the sweep leaves ${TMUX_LOG_STREAM} out as the log stream, so it must match only the ` +
    'log-stream slots: whatever else sits there goes unmeasured';
  expect(await tmuxLogStreamProblems(page), `${why} (before the sweep)`).toEqual([]);
  const samples = (await page
    .locator('section[aria-label^="Hero"]')
    .evaluate((section, excluded) => {
      const probe = (window as unknown as ProbeWindow).__contrastProbe;
      const found = [];
      for (const el of section.querySelectorAll<HTMLElement>('*')) {
        if (el.closest(excluded)) continue;
        const ownText = [...el.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
        if (!ownText) continue;
        const style = getComputedStyle(el);
        found.push({
          what: `${el.tagName.toLowerCase()} "${ownText.slice(0, 32)}"`,
          text: ownText,
          fill: style.getPropertyValue('-webkit-text-fill-color'),
          clippedToText:
            style.backgroundClip === 'text' ||
            style.getPropertyValue('-webkit-background-clip') === 'text',
          ...probe(el),
        });
      }
      return found;
    }, TMUX_LOG_STREAM)) as SweptSample[];
  expect(await tmuxLogStreamProblems(page), `${why} (after the sweep)`).toEqual([]);
  return samples;
}

/** Navigates to `/` in one scheme with the probe installed, and waits for hydration. */
async function openHero(page: Page, colorScheme: (typeof colorSchemes)[number]) {
  await installColorProbe(page);
  await page.emulateMedia({ colorScheme });
  await page.goto('/');
  await expectHydrated(page);
  // Playwright ignores an unknown emulation option silently: prove the scheme reached the page, or a
  // "dark" run would be measuring the light palette twice.
  await expect(page.locator('html')).toContainClass(colorScheme);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const heroSection = (page: Page) => page.locator('section[aria-label^="Hero"]');
const skillTags = (page: Page) =>
  heroSection(page).getByRole('list', { name: 'Technical skills' }).getByRole('listitem');
const scrollLabel = (page: Page) => heroSection(page).getByText('Scroll', { exact: true });
const inviteLine = (page: Page) =>
  heroSection(page).getByText('Scroll to see how.', { exact: true });
/** The hero island: the blurred card holding the player card, the headline and the skill tags. */
const island = (page: Page) =>
  page.locator('section[aria-label^="Hero"] div[class*="max-w-[600px]"]').first();

for (const colorScheme of colorSchemes) {
  test(`no hero text is painted at a partial alpha in the ${colorScheme} theme`, async ({
    page,
  }) => {
    await openHero(page, colorScheme);

    const samples = await sampleHeroText(page);
    // An empty sweep passes every filter below, so first prove it read the text this row exists for.
    const tagTexts = await skillTags(page).evaluateAll((tags) =>
      tags.map((tag) => tag.textContent?.trim() ?? ''),
    );
    expect(tagTexts.length, 'the skill tags must be on the page to be swept').toBeGreaterThan(0);
    const swept = new Set(samples.map((sample) => sample.text));
    expect(
      ['Scroll', 'Scroll to see how.', ...tagTexts].filter((text) => !swept.has(text)),
      'the sweep must read the Scroll label, "Scroll to see how." and every skill tag',
    ).toEqual([]);

    const dimmed = samples.filter((sample) => sample.alpha < 1);
    expect(
      dimmed.map((sample) => `${sample.what} color=${sample.color}`),
      'a hero text colour with an alpha below 1 cannot be checked by axe (the blurred island makes ' +
        'its background undecidable) and cannot pass AA at 9-10px. Use a token at full alpha and ' +
        '--muted for secondary text: docs/adr/0011-colour-roles-on-scoped-surfaces.md.',
    ).toEqual([]);

    // The probe reads `color`. Glyphs filled by `-webkit-text-fill-color`, or by a background
    // clipped to the text as "Scroll to see how." once was, paint something else, often transparent
    // over a gradient, and would leave every number in this file measuring a colour nobody sees.
    const repainted = samples.filter(
      (sample) => sample.fill !== sample.color || sample.clippedToText,
    );
    expect(
      repainted.map(
        (sample) =>
          `${sample.what} color=${sample.color} fill=${sample.fill} clippedToText=${sample.clippedToText}`,
      ),
      'hero text must be painted in its own `color`: a text fill or a background clipped to the ' +
        'text hides the painted colour from this probe and from axe',
    ).toEqual([]);
  });

  test(`the headline and the lines under it reach AA in the ${colorScheme} theme`, async ({
    page,
  }) => {
    // Green. On the island axe cannot decide any of these lines: each is one of the `incomplete`
    // nodes in the `/` budget of accessibility.spec.ts, so without this nothing would measure their
    // colour. Since #58 the h1 names who the site is about, drawn at 15-17 px semibold, so normal
    // text that needs 4.5:1, and right under it come the hook, which was the h1, and then the line
    // saying the specialisation, which was sr-only until #48 made it visible and is drawn in
    // `--muted`.
    await openHero(page, colorScheme);
    const h1 = page.getByRole('heading', { level: 1 });
    const lines = [
      { line: h1, what: 'the h1 naming who the site is about' },
      { line: h1.locator('xpath=following-sibling::p[1]'), what: 'the hook under the h1' },
      {
        line: h1.locator('xpath=following-sibling::p[2]'),
        what: 'the specialisation line under the hook',
      },
    ];
    // Which paragraphs these are, before their colour is read.
    await expect(lines[0].line).toHaveText(PAGE_HEADINGS['/'].heading);
    await expect(lines[1].line).toHaveText(PAGE_HEADINGS['/'].hook);
    await expect(lines[2].line).toHaveText(/^Specializing in /);
    for (const { line, what } of lines) {
      const sample = await sampleColor(line, what);
      expect(sample.alpha, what).toBe(1);
      expect(passesAA(sample), describeSample(sample)).toBe(true);
    }
  });

  test(`the Scroll label, "Scroll to see how." and every skill tag reach AA at rest and hovered in the ${colorScheme} theme`, async ({
    page,
  }) => {
    // Tall enough for the Scroll label. Since #58 it is displayed from `lg` and 1024 px (64rem)
    // tall only, so at the desktop project's 1280x720 it is `display: none` and this would measure
    // an element nobody sees. Set before the navigation, so the page never lays out at 720. This
    // file sits outside e2e/mobile/, so only the desktop project runs it
    // (playwright-config.test.ts).
    await page.setViewportSize({ width: 1280, height: 1024 });
    await openHero(page, colorScheme);
    await expect(
      scrollLabel(page),
      'the Scroll label must be displayed to be measured',
    ).toBeVisible();
    // Playwright counts an element at opacity 0 as visible, and the probe ignores opacity. The
    // indicator fades out (`transition-opacity`) once the page is scrolled past 100 px, so wait for it
    // to rest fully opaque: a label nobody can see, or one caught mid-fade, proves nothing.
    await expect(
      scrollLabel(page).locator('..'),
      'the Scroll indicator must be fully opaque to be measured',
    ).toHaveCSS('opacity', '1');

    const label = await sampleColor(scrollLabel(page), 'the Scroll label');
    const invite = inviteLine(page);
    const inviteSample = await sampleColor(invite, 'the "Scroll to see how." line');
    const samples: Sample[] = [label, inviteSample];
    // Resolved once and iterated, as CLAUDE.md's query-cost note asks: `getByRole(..., { name })`
    // inside the loop would recompute every candidate's accessible name on each call.
    const tags = await skillTags(page).all();
    expect(tags.length, 'the skill tags must be on the page to be measured').toBeGreaterThan(0);
    for (const [index, tag] of tags.entries()) {
      samples.push(await sampleColor(tag, `skill tag ${index + 1} "${await tag.innerText()}"`));
    }

    // Hovered, which is a second colour entirely and the only state `hover:text-[var(--accent-text)]`
    // is reachable in. One tag stands for all of them, which holds only while they share one class
    // list, so that is asserted rather than assumed.
    expect(
      new Set(await skillTags(page).evaluateAll((all) => all.map((tag) => tag.className))).size,
      'every skill tag must carry the same classes for one hovered tag to stand for them all',
    ).toBe(1);
    const [firstTag] = tags;
    await firstTag.hover();
    // The tag's colour transitions, so wait for it to arrive at --accent-text, which the invite line
    // is painted in, rather than sleep for a guess at the duration: sampling mid-transition would
    // read a blend of the two colours and prove nothing.
    await expect
      .poll(() => firstTag.evaluate((el) => getComputedStyle(el).color), {
        message: 'the hovered skill tag should settle on --accent-text',
      })
      .toBe(inviteSample.color);
    samples.push(
      await sampleColor(firstTag, `hovered skill tag 1 "${await firstTag.innerText()}"`),
    );

    expect(
      samples.filter((sample) => !passesAA(sample)).map(describeSample),
      `${colorScheme} theme. The Scroll label (hero-section.tsx) and "Scroll to see how." ` +
        '(hero-content.tsx) are --accent-text; the tags are --muted and hover to --accent-text. ' +
        'A token passes only on the surfaces it was measured on (ADR 0011), and AA asks for 4.5:1 ' +
        'at these sizes.',
    ).toEqual([]);

    // The probe cannot see a text shadow, so the label's halo must be the colour the probe measured
    // it against. A black halo in light pulled the darkest pixel under the glyphs down to rgb(219),
    // 5.13:1 against the probe's 6.81:1, and a darker one would fail AA with this row still green.
    const shadow = await scrollLabel(page).evaluate((el) => getComputedStyle(el).textShadow);
    const shadowColour = /^(?:rgba?|oklab|oklch|color)\([^)]*\)/.exec(shadow)?.[0];
    expect(
      shadowColour,
      `the Scroll label's text-shadow "${shadow}" should lead with a colour`,
    ).toBeTruthy();
    const halo = await scrollLabel(page).evaluate(
      (el, colour) => (window as unknown as ProbeWindow).__contrastProbe(el as HTMLElement, colour),
      shadowColour,
    );
    expect(
      halo.rgb,
      `the Scroll label's halo (${shadowColour}) must be the background it is measured on, ` +
        'var(--background), so that the ratio above is the one painted',
    ).toEqual(label.background);

    // The probe measures `color`. A gradient clipped to the text, as this line used to be, paints
    // through a transparent `-webkit-text-fill-color` instead, and would leave the sample above
    // measuring a colour nobody sees. The partial-alpha row sweeps the whole hero for the same thing.
    const paint = await invite.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        fill: style.getPropertyValue('-webkit-text-fill-color'),
        color: style.color,
        backgroundImage: style.backgroundImage,
      };
    });
    expect(
      { fill: paint.fill, backgroundImage: paint.backgroundImage },
      '"Scroll to see how." must be painted in its own `color`, not a gradient clipped to the text',
    ).toEqual({ fill: paint.color, backgroundImage: 'none' });
  });
}

/** A hover's measurements over its own text: see `sampleWhileHovered`. */
interface HoverSamples {
  /** Whether the hover visibly played: a transform or a text shadow appeared in its subtree. */
  played: boolean;
  /** Text drawn at an opacity strictly between 0 and 1, with the lowest value seen. */
  dimmed: string[];
  /** Every distinct colour its text was drawn in, text shadows included, measured by the probe. */
  colours: (Sample & { shadow: boolean })[];
}

type FinderWindow = { __findAnimatedText: (text: string) => HTMLElement | null };

/**
 * Installs `__findAnimatedText(text)` in the page, which returns the `AnimatedText` root showing
 * `text`, or null while there is none: the only spans in the story that carry `data-animation`,
 * matched on their text or on the visually hidden copy some variants carry. Two roots showing the
 * same text throw, because every step after it would then pick one of them silently. An init
 * script, like the probe, because the site's CSP refuses code built from a string in the page. Must
 * be called before the navigation.
 */
async function installAnimatedTextFinder(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__findAnimatedText = (text: string) => {
      const roots = [
        ...document.querySelectorAll<HTMLElement>('main section span[data-animation]'),
      ].filter(
        (el) =>
          el.textContent?.trim() === text ||
          el.querySelector('.sr-only')?.textContent?.trim() === text,
      );
      if (roots.length > 1) throw new Error(`${roots.length} animated texts read "${text}"`);
      return roots[0] ?? null;
    };
  });
}

/** The root showing `text`, from inside the page, for the steps that need it to be there. */
type Found = (text: string) => HTMLElement;

/**
 * Opens `/` in one scheme with motion allowed, brings the story section holding the animated `text`
 * 40% down the viewport the way a visitor does, with the wheel, and waits for its entrance to finish:
 * the text and its section's closing headline, with everything above either up to the section, are
 * fully opaque. On the Gauntlet that includes the headline block, which waits for the pipeline.
 */
async function openAnimatedText(
  page: Page,
  colorScheme: (typeof colorSchemes)[number],
  text: string,
) {
  await installAnimatedTextFinder(page);
  await openHero(page, colorScheme);
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'the hover effects play only with motion allowed',
  ).toBe(false);
  // The story builds its timelines and the hovers play once GSAP is in (`load-gsap.ts`).
  await expectGsapLoaded(page);

  // Mounted with the page, so a text missing once hydrated is missing for good.
  await page.waitForFunction(
    (wanted) => (window as unknown as FinderWindow).__findAnimatedText(wanted) !== null,
    text,
  );
  const { target, delta } = await page.evaluate((wanted) => {
    const find = (window as unknown as FinderWindow).__findAnimatedText as Found;
    const section = find(wanted).closest('section');
    if (!section) throw new Error(`"${wanted}" is not inside a section`);
    const bottom = document.documentElement.scrollHeight - innerHeight;
    const y = Math.round(scrollY + section.getBoundingClientRect().top - innerHeight * 0.4);
    const clamped = Math.max(0, Math.min(y, bottom));
    return { target: clamped, delta: clamped - scrollY };
  }, text);
  // Scrolled with the wheel: Chromium can put a script-driven scroll on `/` back to the top.
  await page.mouse.move(2, 360);
  await page.mouse.wheel(0, delta);
  await page.waitForFunction((y) => Math.abs(scrollY - y) < 2, target);

  await page.waitForFunction(
    (wanted) => {
      const root = (window as unknown as FinderWindow).__findAnimatedText(wanted);
      if (!root) return false;
      const section = root.closest('section');
      // The closing headline, the last heading that is not the section's title: the title is the
      // header row the section is labelled by (#47, hero-10), which no entrance fades, so waiting on
      // it would be over at once. Excluded by reference, so a section that lost its closing
      // headline throws below rather than falling back to the title.
      const titleId = section?.getAttribute('aria-labelledby');
      const headline = [...(section?.querySelectorAll('h2, h3') ?? [])]
        .filter((heading) => heading.id !== titleId)
        .at(-1);
      // Without it the wait below would be over at once, mid-entrance.
      if (!titleId || !headline) {
        throw new Error(`no closing headline beside the title in the section holding "${wanted}"`);
      }
      const opaque = (from: Element) => {
        for (let el: Element | null = from; el && el !== section; el = el.parentElement) {
          if (getComputedStyle(el).opacity !== '1') return false;
        }
        return true;
      };
      return opaque(root) && opaque(headline);
    },
    text,
    { timeout: 20_000 },
  );
}

/**
 * Hovers the animated `text` and samples its own subtree every frame for 45 frames, about 750 ms at
 * 60 Hz and longer than either effect measured here (the rainbow on `PHASE 4` runs about 0.6 s, the
 * glitch about 0.35 s). Every frame, not one read afterwards, which would race the effect. Only the
 * text's own subtree, so a reveal or a resting defect elsewhere on the page cannot answer for it.
 * The visually hidden copy that some variants carry for assistive technology is skipped: nothing
 * draws it.
 *
 * The hover counts as played only once a transform or a text shadow differs from what the subtree
 * showed before it, so an identity matrix an entrance left behind cannot answer for it. A text's
 * opacity is the product of its own and every ancestor's up to the root, so a wrapper faded around
 * the text counts as much as the text itself.
 */
async function sampleWhileHovered(page: Page, text: string): Promise<HoverSamples> {
  return page.evaluate(async (wanted) => {
    const find = (window as unknown as FinderWindow).__findAnimatedText as Found;
    const probe = (window as unknown as ProbeWindow).__contrastProbe;
    const root = find(wanted);
    let played = false;
    const dimmed = new Map<string, number>();
    const colours = new Map<string, Sample & { shadow: boolean }>();
    const drawn = () =>
      [root, ...root.querySelectorAll<HTMLElement>('*')].filter((el) => !el.closest('.sr-only'));
    const motionOf = (el: Element) => {
      const style = getComputedStyle(el);
      return `${style.transform} | ${style.textShadow}`;
    };
    const atRest = new Map(drawn().map((el) => [el, motionOf(el)]));
    const opacityOf = (el: Element) => {
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity);
        if (node === root) break;
      }
      return opacity;
    };

    const sample = () => {
      for (const el of drawn()) {
        const style = getComputedStyle(el);
        if (motionOf(el) !== (atRest.get(el) ?? 'none | none')) played = true;
        const ownText = [...el.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim();
        if (!ownText) continue;
        const what = `${el.tagName.toLowerCase()} "${ownText.slice(0, 24)}"`;
        const opacity = opacityOf(el);
        // 0 exactly is hidden, which is how every reveal starts; anything between is dimmed text.
        if (opacity > 0 && opacity < 1) dimmed.set(what, Math.min(dimmed.get(what) ?? 1, opacity));
        // Computed colours hold no nested parentheses: `rgb(…)`, `lab(…)`, `oklch(…)`.
        const shadows =
          style.textShadow === 'none' ? [] : (style.textShadow.match(/[a-z]+\([^()]*\)/gi) ?? []);
        for (const [color, shadow] of [
          [style.color, false] as const,
          ...shadows.map((value) => [value, true] as const),
        ]) {
          const key = `${what} ${shadow ? 'text-shadow' : 'color'} ${color}`;
          if (!colours.has(key)) {
            colours.set(key, {
              what: `${what} ${shadow ? 'text-shadow' : 'color'}`,
              shadow,
              ...probe(el, color),
            });
          }
        }
      }
    };

    root.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    for (let frame = 0; frame < 45; frame += 1) {
      sample();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    root.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    root.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    return {
      played,
      dimmed: [...dimmed].map(([what, opacity]) => `${what} at opacity ${opacity}`),
      colours: [...colours.values()],
    };
  }, text);
}

/** Records every colour a hover drew with its ratio, so a passing run still reports its margin. */
function recordContrast(colours: HoverSamples['colours']) {
  test.info().annotations.push({
    type: 'contrast',
    description: colours.map((c) => `${c.what} ${c.color} ${round(ratioOf(c))}:1`).join('; '),
  });
}

/**
 * The glitch variant's two texts: the Execution phase label, on the accent pill, and the Gauntlet's
 * closing headline, on the page.
 */
const GLITCH_TARGETS = [
  { what: 'the PHASE 3 label', text: 'PHASE 3' },
  { what: "the Gauntlet's closing headline", text: '"It worked on my machine" doesn\'t fly here.' },
];

for (const colorScheme of colorSchemes) {
  for (const { what, text } of GLITCH_TARGETS) {
    // R17, restated by slice 47d. It used to hover under `reduce`, where nothing is mid-reveal, but
    // the glitch no longer plays there (AC 4), so it hovers with motion allowed once the section's
    // entrance has finished, and samples the glitch's own text only (a resting defect elsewhere in
    // the section, such as the featured-work diagram at opacity 0.4, is not this row's subject).
    test(`${what} glitches with no text at a partial opacity and offsets at AA in the ${colorScheme} theme`, async ({
      page,
    }) => {
      // The Gauntlet's headline waits for its pipeline, about eight seconds after the entrance.
      test.setTimeout(60_000);
      await openAnimatedText(page, colorScheme, text);
      const { played, dimmed, colours } = await sampleWhileHovered(page, text);
      recordContrast(colours);

      expect(played, 'the hover did not glitch, so this measured nothing').toBe(true);
      // Both offsets, drawn: a `var()` that resolved to nothing would drop the whole shadow.
      expect(
        colours.filter((sample) => sample.shadow).map((sample) => sample.color),
        'the glitch drew fewer than its two offset colours',
      ).toHaveLength(2);
      expect(
        dimmed,
        'the glitch must draw its offsets with no opacity modifier: CLAUDE.md forbids dimming ' +
          'text that way even when it is aria-hidden, because axe measures it anyway.',
      ).toEqual([]);
      expect(
        colours.filter((sample) => !passesAA(sample)).map(describeSample),
        'the glitch offsets are drawn in theme tokens that reach AA as text (ADR 0010, 0011), ' +
          'not palette classes such as text-cyan-400.',
      ).toEqual([]);
    });
  }

  test(`the PHASE 4 label's rainbow draws every letter at AA in the ${colorScheme} theme`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openAnimatedText(page, colorScheme, 'PHASE 4');
    const { played, dimmed, colours } = await sampleWhileHovered(page, 'PHASE 4');
    recordContrast(colours);

    expect(played, 'the hover did not play, so this measured nothing').toBe(true);
    const letterColours = new Set(colours.filter((c) => !c.shadow).map((c) => c.color));
    expect(
      letterColours.size,
      `the letters were only drawn in ${[...letterColours].join(', ')}: the rainbow never recoloured them`,
    ).toBeGreaterThan(2);
    expect(dimmed).toEqual([]);
    expect(
      colours.filter((sample) => !passesAA(sample)).map(describeSample),
      'the rainbow recolours its letters through theme tokens that reach AA as text on the accent ' +
        'pill, not hard-coded hexes.',
    ).toEqual([]);
  });
}

test('the hero island, its skill tags and the colour probe are all working', async ({ page }) => {
  // Green, and the guard for every row above. A hero that stopped rendering its island would leave
  // the partial-alpha sweep passing with nothing measured, and a probe that silently returned
  // nonsense could pass every row. The white headline on the island is the control: it is the one
  // hero colour that is unambiguously fine, so the probe has to agree.
  await openHero(page, 'light');
  await expect(island(page)).toBeVisible();
  await expect(skillTags(page)).toHaveCount(8);
  await expect(scrollLabel(page)).toHaveCount(1);

  const headline = await sampleColor(page.getByRole('heading', { level: 1 }), 'the h1');
  expect(headline.alpha).toBe(1);
  expect(passesAA(headline), describeSample(headline)).toBe(true);
  // And the sweep sees the whole island, not one element: 14 was the measured count on 2026-09-12.
  expect((await sampleHeroText(page)).length).toBeGreaterThan(8);
});
