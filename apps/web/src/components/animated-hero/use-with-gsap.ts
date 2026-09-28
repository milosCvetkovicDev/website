import { useCallback, useEffect, useRef } from 'react';
import { requestGsap, runWithGsap, type Gsap } from './load-gsap';

const noop = () => {};

/**
 * For event handlers that drive GSAP, such as the hover effects in `animated-text.tsx`.
 *
 * Returns a stable `withGsap(callback)` and `cancelPending()`. Once GSAP has loaded, the callback
 * runs synchronously inside the handler, as it did when GSAP was imported statically, and neither
 * function changes anything else.
 *
 * An event handler asking for GSAP is the visitor's intent, so the first call starts the load if
 * nothing has yet (`requestGsap`): a hover before any scroll still plays, once GSAP has arrived.
 * Effects do not do this; they wait, through `runWithGsap`, for the first scroll, tap or key.
 *
 * Before the load a callback waits for it, and at most one waits per component: each call replaces
 * the one still waiting, and `cancelPending` drops it. So a hover that lands before GSAP and is
 * still there when GSAP arrives plays then; a leave replaces the enter it follows, so the enter
 * never starts after the pointer has gone; an enter-only effect cancels on leave, so nothing
 * animates with nobody pointing at it; and a burst of pointer moves plays only its last one.
 * Whatever a handler reads to decide what to do (an `isActive()` check, a busy flag) belongs inside
 * the callback, where it is read when the tween is built rather than when the event fired.
 *
 * A callback still waiting when the component unmounts never runs: the component's own cleanup
 * has already killed the tweens it knew about, and nothing would kill one started afterwards.
 */
export function useWithGsap(): {
  withGsap: (callback: (gsap: Gsap) => void) => void;
  cancelPending: () => void;
} {
  const cancelRef = useRef<() => void>(noop);

  const cancelPending = useCallback(() => {
    cancelRef.current();
    cancelRef.current = noop;
  }, []);

  const withGsap = useCallback(
    (callback: (gsap: Gsap) => void) => {
      cancelPending();
      void requestGsap();
      cancelRef.current = runWithGsap(({ gsap }) => callback(gsap));
    },
    [cancelPending],
  );

  // Unmounting drops a callback that is still waiting. StrictMode's simulated unmount in
  // development runs this too, but at mount, before any event can have queued one.
  useEffect(() => cancelPending, [cancelPending]);

  return { withGsap, cancelPending };
}
