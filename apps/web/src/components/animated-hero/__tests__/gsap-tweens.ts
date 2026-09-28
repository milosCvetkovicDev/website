import type { MockInstance } from 'vitest';
import type { gsap } from '../gsap-runtime';

/**
 * Picks the `gsap.to` tween a test is about by what the tween is, never by when it was created.
 *
 * `toSpy.mock.calls[0]` names whichever tween happened to be created first. Once a phase creates
 * another tween ahead of the one under test (a reveal, a hover, a text effect), that one silently
 * becomes the subject, and the test goes on asserting about the wrong tween. Here the test states
 * what the tween is, as a predicate over the `target` and `vars` that `gsap.to` was called with,
 * and gets back that call's target and the tween it returned, to assert on through
 * `gsap.getTweensOf(target)`.
 *
 * It refuses to guess. It throws when no call matches, and when several do and the test did not
 * ask for the latest (a section entered again restarts its count, and the test wants the new one).
 * The message lists every call the spy saw, so a changed duration or a missing `onUpdate` reads
 * straight off the failure.
 */

type GsapTo = typeof gsap.to;

/** What a test is looking for among the `gsap.to` calls. */
export interface TweenQuery {
  /** The tween, in words, for the failure message: "No gsap.to call is <what>". */
  readonly what: string;
  /** Whether the call `gsap.to(target, vars)` created the tween. */
  readonly matches: (target: unknown, vars: gsap.TweenVars) => boolean;
}

export interface PickedTween {
  /** What the call tweened, for `gsap.getTweensOf`. */
  readonly target: gsap.TweenTarget;
  /** The tween the call returned. */
  readonly tween: gsap.core.Tween;
}

export function pickTween(
  toSpy: MockInstance<GsapTo>,
  query: TweenQuery,
  { latest = false }: { latest?: boolean } = {},
): PickedTween {
  const calls = toSpy.mock.calls;
  const matching = calls.flatMap(([target, vars], index) =>
    query.matches(target, vars) ? [index] : [],
  );
  if (matching.length === 0) {
    throw new Error(`No gsap.to call is ${query.what}. ${describeCalls(calls)}`);
  }
  if (matching.length > 1 && !latest) {
    const which = matching.map((index) => `#${index}`).join(', ');
    throw new Error(
      `${matching.length} gsap.to calls (${which}) are ${query.what}; pass { latest: true } ` +
        `if the test wants the last of them. ${describeCalls(calls)}`,
    );
  }
  const index = matching[matching.length - 1];
  const result = toSpy.mock.results[index];
  if (result.type !== 'return') {
    throw new Error(`gsap.to call #${index}, ${query.what}, threw instead of returning a tween.`);
  }
  return { target: calls[index][0], tween: result.value };
}

/**
 * A tween that animates no element: it runs a plain object for `seconds`, and its `onUpdate` reads
 * the tween's progress and drives the component with it, as the Gauntlet's stage progress and the
 * Execution phase's stats count do. The duration tells one such tween from another.
 */
export function progressDriver(seconds: number): TweenQuery {
  return {
    what: `a ${seconds} s tween of a plain object driven through onUpdate`,
    matches: (target, vars) =>
      isPlainObject(target) && typeof vars.onUpdate === 'function' && vars.duration === seconds,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function describeCalls(calls: Parameters<GsapTo>[]): string {
  if (calls.length === 0) return 'The spy saw no call.';
  const described = calls.map(
    ([target, vars], index) => `#${index} ${describeTarget(target)} ${describeVars(vars)}`,
  );
  return `The spy saw ${calls.length} call${calls.length === 1 ? '' : 's'}: ${described.join('; ')}.`;
}

function describeTarget(target: unknown): string {
  if (typeof Element !== 'undefined' && target instanceof Element) {
    return `<${target.tagName.toLowerCase()}>`;
  }
  if (Array.isArray(target)) return `an array of ${target.length}`;
  if (isPlainObject(target)) return 'a plain object';
  if (typeof target === 'string') return JSON.stringify(target);
  return String(target);
}

/** The vars' keys, with the value of each number, string or boolean: `{ duration: 0.5, onUpdate }`. */
function describeVars(vars: gsap.TweenVars | undefined): string {
  const entries = Object.entries(vars ?? {}).map(([key, value]) =>
    ['number', 'string', 'boolean'].includes(typeof value)
      ? `${key}: ${JSON.stringify(value)}`
      : key,
  );
  return `{ ${entries.join(', ')} }`;
}
