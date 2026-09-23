import { afterEach, describe, expect, it, vi } from 'vitest';
import { gsap } from '../use-gsap-scroll';
import { gsapCssConflicts, tweenedElements } from './gsap-css-conflicts';

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and use-gsap-scroll registers it
// at import time, so the stub must exist before the imports above are evaluated.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

/**
 * The checks behind the phase assertions in `story-phases.test.tsx`, run on bare elements. They are
 * what keeps those assertions able to fail: if the checker stopped recognising a transition, say
 * because Tailwind changed the CSS it generates, every phase would pass while checking nothing.
 */

const mounted: HTMLElement[] = [];

/** A span carrying `className` and one paused tween, so nothing plays or completes. */
function tweened(className: string, vars: gsap.TweenVars, from?: gsap.TweenVars, style = '') {
  const el = document.createElement('span');
  el.className = className;
  if (style) el.setAttribute('style', style);
  document.body.append(el);
  mounted.push(el);
  if (from) gsap.fromTo(el, from, { ...vars, duration: 1, paused: true });
  else gsap.to(el, { ...vars, duration: 1, paused: true });
  return el;
}

afterEach(() => {
  for (const el of mounted.splice(0)) {
    gsap.killTweensOf(el);
    el.remove();
  }
});

describe('gsapCssConflicts', () => {
  it.each([
    ['transition-all', { opacity: 0 }, 'GSAP tweens opacity, which .transition-all transitions'],
    // Tailwind's default list, for a bare `transition`, includes transform, opacity and box-shadow.
    ['transition', { x: 10 }, 'GSAP tweens transform, which .transition transitions'],
    ['transition-opacity duration-300', { opacity: 0 }, 'GSAP tweens opacity'],
    ['transition-transform', { scale: 0.5 }, 'GSAP tweens transform'],
    ['transition-shadow', { boxShadow: '0 0 4px red' }, 'GSAP tweens box-shadow'],
    // `transition-property` starts as `all`, so a duration alone transitions every property.
    ['duration-300', { opacity: 0 }, 'GSAP tweens opacity, which .duration-300 transitions'],
    ['transition-[opacity,box-shadow]', { boxShadow: '0 0 4px red' }, 'GSAP tweens box-shadow'],
    ['hover:transition-all', { opacity: 0 }, 'GSAP tweens opacity'],
  ])('flags %s on an element GSAP tweens %o', async (className, vars, message) => {
    tweened(className, vars);
    expect(await gsapCssConflicts(document.body)).toEqual([expect.stringContaining(message)]);
  });

  it("reads a fromTo's from values as well as its to values", async () => {
    tweened('transition-opacity', { x: 10 }, { opacity: 0 });
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining('GSAP tweens opacity'),
    ]);
  });

  it('reads a transition from the style attribute', async () => {
    tweened('', { opacity: 0 }, undefined, 'transition: opacity 0.2s ease');
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining('GSAP tweens opacity, which style attribute transitions'),
    ]);
  });

  it('flags a hover transform on an element GSAP transforms, and only there', async () => {
    tweened('hover:scale-105', { x: 10 });
    tweened('hover:scale-105', { opacity: 0 });
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining(
        ".hover:scale-105:hover sets scale, which GSAP's inline transform overrides",
      ),
    ]);
  });

  it('compiles with the theme, so a spacing-based hover transform is seen too', async () => {
    tweened('hover:-translate-y-1', { x: 10 });
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining('.hover:-translate-y-1:hover sets translate'),
    ]);
  });

  it("does not hand a child's group-hover rule to the group it names", async () => {
    const group = tweened('group', { x: 10 });
    const child = document.createElement('span');
    child.className = 'group-hover:translate-x-1 group-hover:scale-125';
    group.append(child);
    expect(await gsapCssConflicts(document.body)).toEqual([]);
  });

  it("reads a plain class's transition and its hover transform from globals.css", async () => {
    tweened('hover-lift', { y: 10 });
    const conflicts = await gsapCssConflicts(document.body);
    expect(conflicts).toContainEqual(
      expect.stringContaining('GSAP tweens transform, which .hover-lift transitions'),
    );
    expect(conflicts).toContainEqual(
      expect.stringContaining(".hover-lift:hover sets transform, which GSAP's inline transform"),
    );
  });

  it.each([
    ['transition-colors duration-500', { opacity: 0, x: 10, boxShadow: '0 0 4px red' }],
    // What the discovery tags' hover child carries: `scale` is the individual property, not transform.
    ['transition-[scale,background-color,box-shadow] duration-300', { opacity: 0, x: 10 }],
    ['transition-none duration-300', { opacity: 0 }],
    ['transition-opacity duration-0', { opacity: 0 }],
    ['hover:bg-red-500 hover:shadow-lg transition-colors', { x: 10 }],
  ])('passes %s on an element GSAP tweens %o', async (className, vars) => {
    tweened(className, vars);
    expect(await gsapCssConflicts(document.body)).toEqual([]);
  });

  it('ignores a transition on an element no tween targets', async () => {
    const el = document.createElement('span');
    el.className = 'transition-all hover:scale-105';
    document.body.append(el);
    mounted.push(el);
    expect(await gsapCssConflicts(document.body)).toEqual([]);
  });
});

describe('tweenedElements', () => {
  it("maps each tweened element to the CSS properties its tweens write, GSAP's own keys left out", () => {
    const el = tweened(
      '',
      { x: 10, scale: 1, boxShadow: '0 0 4px red', ease: 'power1.out', stagger: 0.1 },
      { opacity: 0, rotation: 5 },
    );
    expect(tweenedElements(document.body).get(el)).toEqual(
      new Set(['transform', 'box-shadow', 'opacity']),
    );
  });
});
