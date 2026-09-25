/**
 * The site's wordmark, mc_: "mc" in Geist Mono semibold, tracked in by 5%, and an underscore cursor
 * in the accent.
 *
 * The cursor is a filled bar, not an "_" glyph, the way `TypingCursor` draws its caret. `--accent`
 * paints surfaces and misses AA as text in the dark theme (ADR 0011), and a blinking glyph would
 * spend half of every blink as dimmed text, which the colour rules forbid even when it is
 * aria-hidden. The cursor blinks four times when the page loads, 4.8 s in all, then holds: anything
 * that blinks for longer than five seconds needs a way to stop it (WCAG 2.2.2), and a mark in the
 * header of every page has none. Under reduced motion it does not blink at all. In forced-colors
 * mode, which drops background colours, the bar is painted CanvasText so the cursor stays.
 *
 * The cursor stays at every size, and it is never thinner than 2px: at 0.1em, the footer's 14px
 * mark would get a 1.4px bar, which WebKit paints 1px tall at 1x density, split across two rows
 * and never at full colour. It is offset below the baseline with `top`, not a transform: the
 * browser rounds a box's layout position to whole pixels before painting it, but applies a
 * transform after that, so a 0.12em translate blurred the bar into partial pixel rows at 1x.
 *
 * The mark is aria-hidden, so give whatever wraps it the accessible name, as the navigation's home
 * link does. Raster icons (the favicon, the touch icon) come from `markImage()` in
 * `lib/brand-mark.tsx` instead.
 */
export function Logo({ className = '', size = 20 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-baseline font-mono leading-none font-semibold tracking-[-0.05em] ${className}`}
      style={{ fontSize: size }}
    >
      mc
      <span className="relative top-[0.12em] ml-[0.04em] inline-block h-[max(0.1em,2px)] w-[0.55em] bg-[var(--accent)] motion-safe:animate-[mc-blink_1.2s_steps(1)_4] forced-colors:bg-[CanvasText]" />
    </span>
  );
}
