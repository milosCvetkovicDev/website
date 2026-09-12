import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The hero's own text colours, measured by computed style rather than by axe.
 *
 * Rows R12, R13 and R17 of the RED manifest, all fixed by #47.
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
 * Measured on 2026-09-12 against the shipped hero, which is what these rows are RED for:
 *
 *   Scroll label      2.56:1 light   2.84:1 dark    (`hero-section.tsx:103`, alpha 0.7)
 *   skill tags        2.69:1 light   3.21:1 dark    (`hero-content.tsx:99`, alpha 0.7 / 0.6)
 *   skill tag hover   2.70:1 light                  (`hover:text-[#a78bfa]`, opaque but too light)
 *
 * All of them at 9-10px, where AA asks for 4.5:1. Those agree with the numbers recorded in the task's
 * manifest to within 0.03, which is the rounding in the composite.
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

    (window as unknown as Record<string, unknown>).__contrastProbe = (el: HTMLElement) => {
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
      const color = parse(style.color);
      return {
        color: style.color,
        alpha: color[3],
        rgb: over(color, base),
        background: base,
        fontSizePx: parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 700,
        chain,
      };
    };
  });
}

type ProbeResult = Omit<Sample, 'what'>;
type ProbeWindow = { __contrastProbe: (el: HTMLElement) => ProbeResult };

/** One element's colour and the background it is painted over. */
async function sampleColor(locator: Locator, what: string): Promise<Sample> {
  const raw = await locator.evaluate((el) =>
    (window as unknown as ProbeWindow).__contrastProbe(el as HTMLElement),
  );
  return { what, ...raw };
}

/** Every element inside the hero section that carries text of its own, in one round trip. */
async function sampleHeroText(page: Page): Promise<Sample[]> {
  return page.locator('section[aria-label^="Hero"]').evaluate((section) => {
    const probe = (window as unknown as ProbeWindow).__contrastProbe;
    const samples = [];
    for (const el of section.querySelectorAll<HTMLElement>('*')) {
      const ownText = [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      if (!ownText) continue;
      samples.push({
        what: `${el.tagName.toLowerCase()} "${ownText.slice(0, 32)}"`,
        ...probe(el),
      });
    }
    return samples;
  }) as Promise<Sample[]>;
}

/** Navigates to `/` in one scheme with the probe installed, and waits for hydration. */
async function openHero(page: Page, colorScheme: (typeof colorSchemes)[number]) {
  await installColorProbe(page);
  await page.emulateMedia({ colorScheme });
  await page.goto('/');
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  // Playwright ignores an unknown emulation option silently: prove the scheme reached the page, or a
  // "dark" run would be measuring the light palette twice.
  await expect(page.locator('html')).toContainClass(colorScheme);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const skillTags = (page: Page) =>
  page.getByRole('list', { name: 'Technical skills' }).getByRole('listitem');
const scrollLabel = (page: Page) => page.getByText('Scroll', { exact: true });
/** The hero island: the blurred card holding the player card, the headline and the skill tags. */
const island = (page: Page) =>
  page.locator('section[aria-label^="Hero"] div[class*="max-w-[600px]"]').first();

for (const colorScheme of colorSchemes) {
  test(`no hero text is painted at a partial alpha in the ${colorScheme} theme`, async ({
    page,
  }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R12, #47' });
    await openHero(page, colorScheme);

    const dimmed = (await sampleHeroText(page)).filter((sample) => sample.alpha < 1);

    expect(
      dimmed.map((sample) => `${sample.what} color=${sample.color}`),
      'a hero text colour with an alpha below 1 cannot be checked by axe (the blurred island makes ' +
        'its background undecidable) and cannot pass AA at 9-10px. Use a token at full alpha and ' +
        '--muted for secondary text: docs/adr/0011-colour-roles-on-scoped-surfaces.md.',
    ).toEqual([]);
  });

  test(`the Scroll label and every skill tag reach AA at rest and hovered in the ${colorScheme} theme`, async ({
    page,
  }) => {
    test.fail();
    test.info().annotations.push({ type: 'fixed-by', description: 'R13, #47' });
    await openHero(page, colorScheme);

    const samples: Sample[] = [await sampleColor(scrollLabel(page), 'the Scroll label')];
    // Resolved once and iterated, as CLAUDE.md's query-cost note asks: `getByRole(..., { name })`
    // inside the loop would recompute every candidate's accessible name on each call.
    const tags = await skillTags(page).all();
    expect(tags.length, 'the skill tags must be on the page to be measured').toBeGreaterThan(0);
    for (const [index, tag] of tags.entries()) {
      samples.push(await sampleColor(tag, `skill tag ${index + 1} "${await tag.innerText()}"`));
    }

    // Hovered, which is a second colour entirely and the only state `hover:text-[#a78bfa]` is
    // reachable in. The tag carries `transition-all duration-200`, so 400 ms is twice the transition:
    // sampling mid-transition would read a blend of the two colours and prove nothing either way.
    const [firstTag] = tags;
    await firstTag.hover();
    await page.waitForTimeout(400);
    samples.push(
      await sampleColor(firstTag, `hovered skill tag 1 "${await firstTag.innerText()}"`),
    );

    expect(
      samples.filter((sample) => !passesAA(sample)).map(describeSample),
      `${colorScheme} theme. The Scroll label is rgba(139,92,246,0.7) (hero-section.tsx:103); the ` +
        'tags are rgba(99,102,241,0.7) / dark rgba(167,139,250,0.6) and hover to #a78bfa ' +
        '(hero-content.tsx:99). All at 9-10px, where AA asks for 4.5:1.',
    ).toEqual([]);
  });
}

test('no hero text sits at a resting partial opacity while hovered', async ({ page }) => {
  test.fail();
  test.info().annotations.push({ type: 'fixed-by', description: 'R17, #47' });

  // Under `reduce` every phase renders its finished state on mount and builds no timeline (ADR 0009),
  // so nothing is mid-reveal and a sample below 1 can only be a resting value. The glitch handler has
  // no reduced-motion reference at all (`animated-text.tsx`), so it still fires — which is the point.
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'this case needs reduced motion, or a reveal mid-tween would be indistinguishable from a ' +
      'resting partial opacity',
  ).toBe(true);

  // `PHASE 3` uses `AnimatedText animation="glitch"` (`execution-phase.tsx:254`). Its duplicates only
  // exist while the glitch timeline runs — five 0.05 s bursts and a 0.1 s settle, about 350 ms — so the
  // opacities are sampled every frame from before the hover rather than read once afterwards. A single
  // read would race the timeline and could report a clean page, and for an expected failure a lucky
  // pass fails the whole run.
  await page.getByText('PHASE 3', { exact: true }).first().scrollIntoViewIfNeeded();

  const offenders = await page.evaluate(async () => {
    const main = document.querySelector('main');
    if (!main) throw new Error('no <main> to sample');
    const label = [...main.querySelectorAll<HTMLElement>('*')].find(
      (el) => el.textContent?.trim() === 'PHASE 3' && el.children.length === 0,
    );
    const target = label?.closest<HTMLElement>('[class*="cursor-pointer"]') ?? label;
    if (!target) throw new Error('the PHASE 3 label is not on the page');

    const worst = new Map<string, number>();
    const sample = () => {
      for (const el of main.querySelectorAll<HTMLElement>('*')) {
        const opacity = Number(getComputedStyle(el).opacity);
        // 0 exactly is a hidden element, which is allowed and is how every reveal starts; anything
        // between is dimmed text on screen, which CLAUDE.md forbids even when `aria-hidden`.
        if (!(opacity > 0 && opacity < 1)) continue;
        if (!el.textContent?.trim()) continue;
        const cls = typeof el.className === 'string' ? el.className.slice(0, 60).trim() : '';
        const key = `${el.tagName.toLowerCase()}.${cls} "${el.textContent.trim().slice(0, 24)}"`;
        worst.set(key, Math.min(worst.get(key) ?? 1, opacity));
      }
    };

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    // 45 frames is about 750 ms at 60 Hz, twice the glitch timeline.
    for (let frame = 0; frame < 45; frame += 1) {
      sample();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return [...worst].map(([key, opacity]) => `${key} at opacity ${opacity}`);
  });

  expect(
    offenders,
    'the glitch variant paints aria-hidden duplicates at `opacity-70` ' +
      '(animated-text.tsx:384, :394). CLAUDE.md forbids dimming text with an opacity modifier even ' +
      'when it is aria-hidden, because axe measures it anyway.',
  ).toEqual([]);
});

test('the hero island, its skill tags and the colour probe are all working', async ({ page }) => {
  // Green, and the guard for every row above. A hero that stopped rendering its island would make
  // three RED rows start passing, which fails the run for a reason that looks like a fix; and a probe
  // that silently returned nonsense would do the same. The white headline on the island is the
  // control: it is the one hero colour that is unambiguously fine, so the probe has to agree.
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
