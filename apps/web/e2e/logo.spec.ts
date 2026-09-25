import { expect, test } from '@playwright/test';

/**
 * The mc_ cursor in the header (20px) and the footer (14px) after the compiled CSS has applied:
 * max(0.1em, 2px) tall, offset 0.12em below the baseline with `top`, and not transformed.
 *
 * `src/components/__tests__/logo.test.tsx` pins the class names, but jsdom never compiles Tailwind,
 * so only a browser shows that the arbitrary values became rules. The defect this guards against
 * was measured by hand in Chromium and WebKit at 1x, 2x and 3x density: a transform applies after
 * the browser rounds the box to whole pixels, so the translated bar blurred into partial pixel rows
 * at 1x in both engines, and the 1.4px bar of the 14px mark painted 1px tall in WebKit. Offset in
 * layout and 2px tall, it fills exactly two full rows at 1x in both.
 *
 * This spec runs in the desktop chromium project only, and reads layout (the box and the computed
 * style), not paint. That is enough: the old bar failed it in Chromium on both counts, a 2.4px
 * translate and a 1.39px box, the same box height WebKit measured, so running it in WebKit would
 * catch nothing more.
 */
test.describe('the mc_ cursor', () => {
  for (const where of ['header', 'footer'] as const) {
    test(`in the ${where} is max(0.1em, 2px) tall and offset in layout, not transformed`, async ({
      page,
    }) => {
      await page.goto('/about');
      // No .first(): if a second element ever matches, strict mode fails the evaluate below.
      const cursor = page.locator(`${where} [aria-hidden="true"].font-mono > span`);
      await expect(cursor).toHaveCount(1);

      const { height, top, fontSize, position, ...motion } = await cursor.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          height: el.getBoundingClientRect().height,
          top: parseFloat(style.top),
          fontSize: parseFloat(getComputedStyle(el.parentElement!).fontSize),
          position: style.position,
          transform: style.transform,
          translate: style.translate,
          scale: style.scale,
          rotate: style.rotate,
        };
      });

      expect(height).toBeCloseTo(Math.max(0.1 * fontSize, 2), 1);
      expect(position).toBe('relative');
      expect(top).toBeCloseTo(0.12 * fontSize, 2);
      // Tailwind 4's translate-*, scale-* and rotate-* utilities set the `translate`, `scale` and
      // `rotate` properties, which leave `transform` at none: checking `transform` alone passes on
      // the translated bar too.
      expect(motion).toEqual({
        transform: 'none',
        translate: 'none',
        scale: 'none',
        rotate: 'none',
      });
    });
  }
});
