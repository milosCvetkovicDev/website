/**
 * The helper the phase tests pick their tweens with, run against a stand-in spy. What matters is
 * that it refuses to guess: a helper that quietly fell back to the first call would bring back the
 * call-order dependence it replaces. It needs no DOM and no GSAP, so it runs outside jsdom.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import type { gsap } from '../gsap-runtime';
import { pickTween, progressDriver } from './gsap-tweens';

/** A `gsap.to` stand-in that records its calls and returns a distinct token for each. */
function toSpy() {
  let made = 0;
  return vi.fn<typeof gsap.to>(() => ({ made: ++made }) as unknown as gsap.core.Tween);
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
});

describe('progressDriver', () => {
  const { matches } = progressDriver(0.5);

  it('matches a plain object tweened for that long with an onUpdate', () => {
    expect(matches({}, { duration: 0.5, onUpdate })).toBe(true);
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
