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
      <span className="ml-[0.04em] inline-block h-[0.1em] w-[0.55em] translate-y-[0.12em] bg-[var(--accent)] motion-safe:animate-[mc-blink_1.2s_steps(1)_4] forced-colors:bg-[CanvasText]" />
    </span>
  );
}
