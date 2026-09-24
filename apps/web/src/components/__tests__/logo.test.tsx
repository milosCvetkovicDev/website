/**
 * The wordmark: what it renders, and the colour and motion rules its cursor has to keep.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from '../logo';

describe('Logo', () => {
  it('draws "mc" with a cursor bar, hidden from assistive technology as a whole', () => {
    const { container } = render(<Logo size={32} />);
    const mark = container.firstElementChild as HTMLElement;

    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark.textContent).toBe('mc');
    expect(mark.style.fontSize).toBe('32px');

    const cursor = mark.lastElementChild as HTMLElement;
    // A filled bar, not an "_" glyph: --accent may paint a surface but not text (ADR 0011).
    expect(cursor.textContent).toBe('');
    expect(cursor.className).toContain('bg-[var(--accent)]');
    expect(cursor.className).not.toMatch(/\btext-\[var\(--accent\)\]/);
  });

  it('blinks a bounded number of times, and only when motion is welcome', () => {
    const { container } = render(<Logo />);
    const cursor = container.firstElementChild?.lastElementChild as HTMLElement;
    const blink = cursor.className.split(/\s+/).find((c) => c.includes('mc-blink'));

    expect(blink).toBeDefined();
    // motion-safe: skips it under prefers-reduced-motion.
    expect(blink).toMatch(/^motion-safe:/);
    // A finite count keeps the blinking under five seconds (WCAG 2.2.2): 1.2 s × 4.
    const [, duration, , count] = blink!.replace(/^motion-safe:animate-\[|\]$/g, '').split('_');
    expect(count).not.toBe('infinite');
    expect(parseFloat(duration) * Number(count)).toBeLessThan(5);
  });

  it('keeps the cursor at least 2px tall and offsets it in layout, not with a transform', () => {
    const { container } = render(<Logo size={14} />);
    const cursor = container.firstElementChild?.lastElementChild as HTMLElement;
    const classes = cursor.className.split(/\s+/);

    // 0.1em of the footer's 14px is 1.4px, which WebKit paints 1px tall at 1x density.
    expect(classes).toContain('h-[max(0.1em,2px)]');
    // Layout offsets are rounded to whole pixels before painting; a translate is not, and blurs.
    expect(classes).toEqual(expect.arrayContaining(['relative', 'top-[0.12em]']));
    expect(classes.filter((c) => /(^|:)-?translate-/.test(c))).toEqual([]);
  });

  it('defaults to 20px and passes a className through', () => {
    const { container } = render(<Logo className="text-[var(--foreground)]" />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark.style.fontSize).toBe('20px');
    expect(mark.className).toContain('text-[var(--foreground)]');
  });
});
