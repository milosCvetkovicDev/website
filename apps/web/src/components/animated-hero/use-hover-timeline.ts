import { useCallback, useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import type { Gsap } from './load-gsap';
import { useWithGsap } from './use-with-gsap';

type Animation = gsap.core.Animation;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The preference as the browser reports it at this moment. `usePrefersReducedMotion` reads `false`
 * until hydration has finished (ADR 0006), so a hover in that window would otherwise play for a
 * visitor who asked for less motion. Read in handlers only, never in render.
 */
const reducedMotionNow = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;

/** Still playing: GSAP takes an animation off its timeline once it has completed or been killed. */
const isPlaying = (animation: Animation | null): animation is Animation =>
  Boolean(animation?.parent);

/**
 * What every hover effect in `animated-text.tsx` shares around `build`, which makes one hover as a
 * single timeline or tween from GSAP and the argument `play` was given.
 *
 * - `play(arg, restart)` builds it through `useWithGsap`: GSAP loads after hydration, and a hover
 *   that lands before it plays once it arrives, unless a leave has called `cancelPending` first.
 *   While the last hover is still playing, a new one is ignored, or with `restart` replaces it.
 * - `finish()` jumps what is playing to its end, callbacks included, and kills it. Only an
 *   animation still on GSAP's timeline is jumped: one that finished or was killed has left it, and
 *   would replay its callbacks.
 * - Unmounting kills what is playing.
 * - Under `prefers-reduced-motion: reduce`, `play` returns before it asks for GSAP, so a hover or a
 *   pointer move creates no tween and changes nothing drawn (WCAG 2.3.3). Switched on mid-hover,
 *   the preference finishes that hover at once, and `rest` then puts back whatever its end leaves
 *   out of place. Nothing rendered may depend on the preference: it reads `false` during hydration
 *   (ADR 0006), so markup that did would be rewritten right after it.
 */
export function useHoverTimeline<Arg>(
  build: (gsap: Gsap, arg: Arg) => Animation | null,
  rest?: (gsap: Gsap) => void,
) {
  const reduceMotion = usePrefersReducedMotion();
  const { withGsap, cancelPending } = useWithGsap();
  const playing = useRef<Animation | null>(null);
  // GSAP, once this component has played anything. Before that `rest` has nothing to put back, and
  // asking for GSAP would arm its load for a visitor whose hovers cannot use it.
  const played = useRef<Gsap | null>(null);

  const finish = useCallback(() => {
    const animation = playing.current;
    if (isPlaying(animation)) animation.progress(1);
    animation?.kill();
  }, []);

  useEffect(() => () => void playing.current?.kill(), []);

  useEffect(() => {
    if (!reduceMotion) return;
    cancelPending();
    finish();
    if (played.current) rest?.(played.current);
  }, [reduceMotion, cancelPending, finish, rest]);

  const play = useCallback(
    (arg: Arg, restart: boolean) => {
      if (reduceMotion || reducedMotionNow()) return;
      withGsap((gsap) => {
        played.current = gsap;
        if (!restart && isPlaying(playing.current)) return;
        playing.current?.kill();
        playing.current = build(gsap, arg);
      });
    },
    [reduceMotion, withGsap, build],
  );

  return { play, finish, cancelPending };
}
