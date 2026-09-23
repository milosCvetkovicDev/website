import { afterEach, describe, expect, it, vi } from 'vitest';
import { gsap } from '../use-gsap-scroll';
import { cssTransitions, gsapCssConflicts, tweenedElements } from './gsap-css-conflicts';

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
  it.each<[string, gsap.TweenVars, string]>([
    ['transition-all', { opacity: 0 }, 'GSAP tweens opacity, which .transition-all transitions'],
    // Tailwind's default list, for a bare `transition`, includes transform, opacity and box-shadow.
    ['transition', { x: 10 }, 'GSAP tweens transform, which .transition transitions'],
    ['transition-opacity duration-300', { opacity: 0 }, 'GSAP tweens opacity'],
    ['transition-transform', { scale: 0.5 }, 'GSAP tweens transform'],
    ['transition-shadow', { boxShadow: '0 0 4px red' }, 'GSAP tweens box-shadow'],
    // `transition-property` starts as `all`, so a duration alone transitions every property.
    ['duration-300', { opacity: 0 }, 'GSAP tweens opacity, which .duration-300 transitions'],
    // A delay alone starts a transition too: the duration plus the delay is above zero.
    ['duration-0 delay-300', { opacity: 0 }, 'GSAP tweens opacity'],
    ['transition-[opacity,box-shadow]', { boxShadow: '0 0 4px red' }, 'GSAP tweens box-shadow'],
    ['transition-opacity!', { opacity: 0 }, 'GSAP tweens opacity'],
    ['hover:transition-all', { opacity: 0 }, 'GSAP tweens opacity'],
    // A state rule cannot hide the transition the element has at rest.
    ['transition-opacity hover:duration-0', { opacity: 0 }, 'GSAP tweens opacity'],
    ['hover:transition-colors duration-300', { opacity: 0 }, 'GSAP tweens opacity'],
    ['transition-all motion-reduce:duration-0', { opacity: 0 }, 'GSAP tweens opacity'],
    // A class that starts with a digit is escaped as a hex code and a space in the selector.
    ['2xl:transition-all', { opacity: 0 }, 'GSAP tweens opacity'],
    // A longhand in the list covers part of the shorthand GSAP writes.
    ['transition-[padding-left]', { padding: 4 }, 'GSAP tweens padding'],
  ])('flags %s on an element GSAP tweens %o', async (className, vars, message) => {
    tweened(className, vars);
    expect(await gsapCssConflicts(document.body)).toEqual([expect.stringContaining(message)]);
  });

  it.each<[string, gsap.TweenVars, string]>([
    ['transition-opacity', { alpha: 0 }, 'GSAP tweens opacity'],
    ['transition-opacity', { css: { opacity: 0 } }, 'GSAP tweens opacity'],
    ['transition-opacity', { keyframes: [{ opacity: 0 }, { opacity: 1 }] }, 'GSAP tweens opacity'],
    ['transition-opacity', { keyframes: { opacity: [0, 1] } }, 'GSAP tweens opacity'],
  ])('reads %s against the keys GSAP spells differently: %o', async (className, vars, message) => {
    tweened(className, vars);
    expect(await gsapCssConflicts(document.body)).toEqual([expect.stringContaining(message)]);
  });

  it("reads a fromTo's from values as well as its to values", async () => {
    tweened('transition-opacity', { x: 10 }, { opacity: 0 });
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining('GSAP tweens opacity'),
    ]);
  });

  it('reads a transition from the style attribute, and lets it beat every class', async () => {
    tweened('', { opacity: 0 }, undefined, 'transition: opacity 0.2s ease');
    tweened('transition-all', { opacity: 0 }, undefined, 'transition: none');
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining('GSAP tweens opacity, which style attribute transitions'),
    ]);
  });

  it.each<[string, gsap.TweenVars, string]>([
    ['hover:scale-105', { x: 10 }, ".hover:scale-105:hover sets scale, which GSAP's inline value"],
    // Tailwind's spacing scale comes from the theme, which is compiled in.
    ['hover:-translate-y-1', { x: 10 }, '.hover:-translate-y-1:hover sets translate'],
    ['data-[state=open]:scale-105', { x: 10 }, 'sets scale'],
    // An origin or a rendering option alone still makes GSAP pin the element's transform.
    ['hover:scale-105', { transformOrigin: 'center' }, 'sets scale'],
    ['hover:scale-105', { force3D: true }, 'sets scale'],
    ['hover:opacity-100', { opacity: 0 }, '.hover:opacity-100:hover sets opacity'],
    ['hover:shadow-lg', { boxShadow: '0 0 4px red' }, 'sets box-shadow'],
  ])('flags %s, a state rule GSAP overrides inline, under %o', async (className, vars, message) => {
    tweened(className, vars);
    expect(await gsapCssConflicts(document.body)).toEqual([expect.stringContaining(message)]);
  });

  it('leaves a hover transform alone on an element GSAP does not transform', async () => {
    tweened('hover:scale-105', { opacity: 0 });
    expect(await gsapCssConflicts(document.body)).toEqual([]);
  });

  it("reads a plain class's transition and its hover transform from globals.css", async () => {
    tweened('hover-lift', { y: 10 });
    const conflicts = await gsapCssConflicts(document.body);
    expect(conflicts).toContainEqual(
      expect.stringContaining('GSAP tweens transform, which .hover-lift transitions'),
    );
    expect(conflicts).toContainEqual(
      expect.stringContaining(".hover-lift:hover sets transform, which GSAP's inline value"),
    );
  });

  it('flags a CSS animation on an element GSAP tweens', async () => {
    tweened('animate-pulse', { opacity: 0 });
    expect(await gsapCssConflicts(document.body)).toEqual([
      expect.stringContaining('.animate-pulse runs a CSS animation'),
    ]);
  });

  it.each<[string, gsap.TweenVars]>([
    ['transition-colors duration-500', { opacity: 0, x: 10, boxShadow: '0 0 4px red' }],
    // What the discovery tags' hover child carries: `scale` is the individual property, not transform.
    [
      'transition-[scale,color,background-color,border-color,box-shadow] duration-300',
      { opacity: 0, x: 10 },
    ],
    ['transition-none duration-300', { opacity: 0 }],
    ['transition-opacity duration-0', { opacity: 0 }],
    ['hover:bg-red-500 hover:shadow-lg transition-colors', { x: 10 }],
    // An origin is not the transform: transition-transform leaves transform-origin alone.
    ['transition-transform', { transformOrigin: 'left' }],
    // A name that starts like a shorthand is not its longhand.
    ['transition-[border]', { borderRadius: 4 }],
    ['animate-none', { opacity: 0 }],
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

  it("does not hand a child's group-hover rule to the group it names", async () => {
    const group = tweened('group', { x: 10 });
    const child = document.createElement('span');
    child.className = 'group-hover:translate-x-1 group-hover:scale-125';
    group.append(child);
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

describe('cssTransitions', () => {
  it.each<[string, string[]]>([
    ['transition-all duration-500', ['all']],
    ['transition-colors duration-500', ['color', 'background-color', 'border-color']],
    ['h-full rounded-full', []],
  ])('reads what %s transitions', async (className, expected) => {
    const el = document.createElement('div');
    el.className = className;
    const transitioned = await cssTransitions(el);
    for (const name of expected) expect(transitioned).toContain(name);
    if (!expected.length) expect(transitioned.size).toBe(0);
  });
});
