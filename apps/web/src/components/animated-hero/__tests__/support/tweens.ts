import type { MockInstance } from 'vitest';
import { expect } from 'vitest';

/**
 * Finding the counter tweens in a `gsap.to` spy by what they are, rather than by the order they were
 * created in.
 *
 * `toSpy.mock.calls[0]` was how the phase tests reached these, and it says nothing about which tween
 * it picked: add a tween anywhere earlier in a phase's effect and the assertions silently move to
 * it, still green, now measuring something else.
 *
 * Neither counter animates a property. Both drive a plain object through `onUpdate` and write the
 * numbers into the DOM themselves, so "the tween that animates width" has nothing to match on: what
 * identifies them is the pair of a non-element target and an `onUpdate` callback. Every other tween
 * in the hero animates a real element.
 */

/** A `gsap.to` call that drives a counter, with the tween it returned. */
export interface CounterTween {
  /** The plain object the tween mutates; `gsap.getTweensOf` takes this. */
  target: object;
  tween: gsap.core.Tween;
}

type ToSpy = MockInstance<typeof gsap.to>;

/** Every counter tween the spy has seen, oldest first. */
export function counterTweens(toSpy: ToSpy): CounterTween[] {
  return toSpy.mock.calls.flatMap((call, index) => {
    const [target, vars] = call as [unknown, gsap.TweenVars | undefined];
    if (typeof vars?.onUpdate !== 'function') return [];
    if (target === null || typeof target !== 'object' || target instanceof Node) return [];
    return [{ target, tween: toSpy.mock.results[index].value as gsap.core.Tween }];
  });
}

/** The one counter tween the spy has seen, asserting that there is exactly one. */
export function onlyCounterTween(toSpy: ToSpy): CounterTween {
  const tweens = counterTweens(toSpy);
  expect(tweens, 'expected exactly one counter tween (a plain-object target with an onUpdate)') //
    .toHaveLength(1);
  return tweens[0];
}

/** The most recent counter tween, for the tests that restart a count and assert on the new one. */
export function latestCounterTween(toSpy: ToSpy): CounterTween {
  const tweens = counterTweens(toSpy);
  expect(tweens.length, 'expected at least one counter tween').toBeGreaterThan(0);
  return tweens[tweens.length - 1];
}
