/**
 * The helper the phase tests pick their tweens with, run against a stand-in spy. What matters is
 * that it refuses to guess: a helper that quietly fell back to the first call would bring back the
 * call-order dependence it replaces. It needs no DOM and no GSAP, so it runs outside jsdom.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import type { gsap } from '../gsap-runtime';
import {
  countTweens,
  fromToOf,
  type FromToCall,
  pickFromToTween,
  pickTween,
  progressDriver,
} from './gsap-tweens';

/** A `gsap.to` stand-in that records its calls and returns a distinct token for each. */
function toSpy() {
  let made = 0;
  return vi.fn<typeof gsap.to>(() => ({ made: ++made }) as unknown as gsap.core.Tween);
}

/** A `gsap.fromTo` stand-in, the same way. */
function fromToSpy() {
  let made = 0;
  return vi.fn<FromToCall>(() => ({ made: ++made }) as unknown as gsap.core.Tween);
}

const onUpdate = () => {};

describe('pickTween', () => {
  it('returns the target and tween of the one matching call, wherever it falls', () => {
    const to = toSpy();
    const panel = new (class Panel {})();
    const counter = {};
    to(panel, { opacity: 1, duration: 0.5 });
    const counted = to(counter, { duration: 3, onUpdate });

    const picked = pickTween(to, progressDriver(3));

    expect(picked.target).toBe(counter);
    expect(picked.tween).toBe(counted);
  });

  it('fails, naming what it looked for and every call it saw, when no call matches', () => {
    const to = toSpy();
    to({}, { duration: 0.4, onUpdate });

    expect(() => pickTween(to, progressDriver(0.5))).toThrow(
      /No gsap\.to call is a 0\.5 s tween of a plain object driven through onUpdate\. The spy saw 1 call: #0 a plain object \{ duration: 0\.4, onUpdate \}/,
    );
  });

  it('fails when nothing was called at all', () => {
    expect(() => pickTween(toSpy(), progressDriver(3))).toThrow(/The spy saw no call\./);
  });

  it('fails when several calls match and the test did not ask for the latest', () => {
    const to = toSpy();
    to({}, { duration: 3, onUpdate });
    to({}, { duration: 3, onUpdate });

    expect(() => pickTween(to, progressDriver(3))).toThrow(/2 gsap\.to calls \(#0, #1\) are a 3 s/);
  });

  it('returns the last of several matching calls when asked for the latest', () => {
    const to = toSpy();
    const first = {};
    const second = {};
    to(first, { duration: 3, onUpdate });
    to(new (class Span {})(), { opacity: 0 });
    const restarted = to(second, { duration: 3, onUpdate });

    const picked = pickTween(to, progressDriver(3), { latest: true });

    expect(picked.target).toBe(second);
    expect(picked.tween).toBe(restarted);
  });

  it('fails when the matching call threw instead of returning a tween', () => {
    const to = toSpy();
    to.mockImplementationOnce(() => {
      throw new Error('bad target');
    });
    expect(() => to({}, { duration: 3, onUpdate })).toThrow('bad target');

    expect(() => pickTween(to, progressDriver(3))).toThrow(
      /call #0, .* threw instead of returning a tween/,
    );
  });

  it('says a matching call has not returned yet, rather than that it threw', () => {
    const to = toSpy();
    let message = '';
    to.mockImplementationOnce(() => {
      try {
        pickTween(to, progressDriver(3));
      } catch (error) {
        message = (error as Error).message;
      }
      return {} as gsap.core.Tween;
    });
    to({}, { duration: 3, onUpdate });

    expect(message).toMatch(/call #0, .* has not returned yet/);
  });

  it('with latest, still fails when no call matches, and when the last match threw', () => {
    const to = toSpy();
    to({}, { duration: 1, onUpdate });
    expect(() => pickTween(to, progressDriver(3), { latest: true })).toThrow(/No gsap\.to call/);

    to({}, { duration: 3, onUpdate });
    to.mockImplementationOnce(() => {
      throw new Error('bad target');
    });
    expect(() => to({}, { duration: 3, onUpdate })).toThrow('bad target');
    expect(() => pickTween(to, progressDriver(3), { latest: true })).toThrow(
      /call #2, .* threw instead of returning a tween/,
    );
  });

  it('lists a call whose vars are missing instead of failing on them', () => {
    const to = toSpy();
    (to as unknown as (target: unknown) => void)({});

    expect(() => pickTween(to, progressDriver(3))).toThrow(
      /The spy saw 1 call: #0 a plain object \(vars: undefined\)\./,
    );
  });

  it('describes each kind of target and every primitive value in the failure message', () => {
    class Panel {}
    const nodeList = new (class NodeList {
      readonly length = 3;
    })();
    const to = toSpy();
    to(Object.create(null) as object, { duration: Number.NaN });
    to(new Panel(), { duration: Number.POSITIVE_INFINITY, ease: 'power2.out', paused: true });
    to(nodeList as unknown as gsap.TweenTarget, { opacity: 0 });
    to([{}, {}], { opacity: 1 });
    to('.stage', { opacity: 1 });

    expect(() => pickTween(to, progressDriver(3))).toThrow(
      'The spy saw 5 calls: ' +
        '#0 a null-prototype object { duration: NaN }; ' +
        '#1 a Panel instance { duration: Infinity, ease: "power2.out", paused: true }; ' +
        '#2 a NodeList of 3 { opacity: 0 }; ' +
        '#3 an array of 2 { opacity: 1 }; ' +
        '#4 ".stage" { opacity: 1 }.',
    );
  });

  it('describes an element by its tag', () => {
    class FakeElement {
      readonly tagName = 'DIV';
    }
    vi.stubGlobal('Element', FakeElement);
    try {
      const to = toSpy();
      to(new FakeElement() as unknown as gsap.TweenTarget, { opacity: 1 });

      expect(() => pickTween(to, progressDriver(3))).toThrow(/#0 <div> \{ opacity: 1 \}/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('pickFromToTween', () => {
  it('returns the target and tween of the call on that element, wherever it falls', () => {
    const fromTo = fromToSpy();
    const toast = new (class Toast {})();
    const alert = new (class Alert {})();
    fromTo(toast, { opacity: 0 }, { opacity: 1 });
    const revealed = fromTo(alert, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 });
    fromTo(toast, { y: 20 }, { y: 0 });

    const picked = pickFromToTween(fromTo, fromToOf(alert, 'the alert reveal'));

    expect(picked.target).toBe(alert);
    expect(picked.tween).toBe(revealed);
  });

  it('fails, naming the method and both vars of every call, when no call matches', () => {
    const fromTo = fromToSpy();
    fromTo({}, { opacity: 0, scale: 0.9 }, { opacity: 1, duration: 0.3 });

    expect(() => pickFromToTween(fromTo, fromToOf({}, 'the alert reveal'))).toThrow(
      'No gsap.fromTo call is the alert reveal. The spy saw 1 call: ' +
        '#0 a plain object { opacity: 0, scale: 0.9 } -> { opacity: 1, duration: 0.3 }.',
    );
  });

  it('refuses several matches unless asked for the latest, and then returns the last', () => {
    const fromTo = fromToSpy();
    const alert = {};
    fromTo(alert, { opacity: 0 }, { opacity: 1 });
    const again = fromTo(alert, { opacity: 0 }, { opacity: 1 });

    expect(() => pickFromToTween(fromTo, fromToOf(alert, 'the alert reveal'))).toThrow(
      /2 gsap\.fromTo calls \(#0, #1\) are the alert reveal; pass \{ latest: true \}/,
    );
    expect(
      pickFromToTween(fromTo, fromToOf(alert, 'the alert reveal'), { latest: true }).tween,
    ).toBe(again);
  });

  it('passes the target and both vars to the query', () => {
    const fromTo = fromToSpy();
    fromTo('.a', { opacity: 0 }, { opacity: 1, duration: 0.5 });
    const slow = fromTo('.a', { opacity: 0 }, { opacity: 1, duration: 2 });

    const picked = pickFromToTween(fromTo, {
      what: 'the slow fade of .a',
      matches: (target, from, to) => target === '.a' && from.opacity === 0 && to.duration === 2,
    });

    expect(picked.tween).toBe(slow);
  });

  it('fails when the matching call threw instead of returning a tween', () => {
    const fromTo = fromToSpy();
    fromTo.mockImplementationOnce(() => {
      throw new Error('bad target');
    });
    const alert = {};
    expect(() => fromTo(alert, {}, {})).toThrow('bad target');

    expect(() => pickFromToTween(fromTo, fromToOf(alert, 'the alert reveal'))).toThrow(
      'gsap.fromTo call #0, the alert reveal, threw instead of returning a tween.',
    );
  });

  it('never hands a query a call whose vars are not both objects, and lists each argument', () => {
    const fromTo = fromToSpy();
    const alert = {};
    // GSAP 2's form, (target, duration, fromVars, toVars), and a call with its vars left out.
    (fromTo as unknown as (...args: unknown[]) => void)(alert, 0.6, { opacity: 0 }, { opacity: 1 });
    (fromTo as unknown as (target: unknown) => void)(alert);
    const matches = vi.fn(() => true);

    expect(() => pickFromToTween(fromTo, { what: 'the alert reveal', matches })).toThrow(
      'No gsap.fromTo call is the alert reveal. The spy saw 2 calls: ' +
        '#0 a plain object (vars: 0.6) -> { opacity: 0 } -> { opacity: 1 }; ' +
        '#1 a plain object (vars: undefined).',
    );
    expect(matches).not.toHaveBeenCalled();
  });
});

describe('fromToOf', () => {
  it('matches the very target it was given, not an equal one', () => {
    const element = {};
    const { matches } = fromToOf(element, 'it');
    expect(matches(element, {}, {})).toBe(true);
    expect(matches({}, {}, {})).toBe(false);
    expect(matches([element], {}, {})).toBe(false);
  });

  it('refuses a missing element, which would match any call made with an unmounted ref', () => {
    expect(() => fromToOf(null, 'the alert reveal')).toThrow(
      'fromToOf was given null for the alert reveal: find the element first.',
    );
    expect(() => fromToOf(undefined, 'the alert reveal')).toThrow(/given undefined/);
  });
});

describe('countTweens', () => {
  it('counts the matching calls only', () => {
    const to = toSpy();
    expect(countTweens(to, progressDriver(3))).toBe(0);
    to({}, { duration: 3, onUpdate });
    to(new (class Span {})(), { opacity: 0 });
    to({}, { duration: 3, onUpdate });

    expect(countTweens(to, progressDriver(3))).toBe(2);
  });
});

describe('progressDriver', () => {
  const { matches } = progressDriver(0.5);

  it('matches a plain object tweened for that long with an onUpdate', () => {
    expect(matches({}, { duration: 0.5, onUpdate })).toBe(true);
    expect(matches(Object.create(null), { duration: 0.5, onUpdate })).toBe(true);
  });

  it('does not match, and does not throw on, a call with no vars object', () => {
    const loose = matches as (target: unknown, vars: unknown) => boolean;
    expect(loose({}, undefined)).toBe(false);
    expect(loose({}, null)).toBe(false);
    expect(loose({}, 0.5)).toBe(false);
  });

  it('does not match a tween that leaves its duration to GSAP', () => {
    expect(matches({}, { onUpdate })).toBe(false);
  });

  it('does not match a tween of anything but a plain object', () => {
    class Box {}
    expect(matches(new Box(), { duration: 0.5, onUpdate })).toBe(false);
    expect(matches([{}], { duration: 0.5, onUpdate })).toBe(false);
    expect(matches('.stage', { duration: 0.5, onUpdate })).toBe(false);
    expect(matches(null, { duration: 0.5, onUpdate })).toBe(false);
  });

  it('does not match another duration, or a tween with no onUpdate', () => {
    expect(matches({}, { duration: 0.6, onUpdate })).toBe(false);
    expect(matches({}, { duration: 0.5 })).toBe(false);
  });
});
