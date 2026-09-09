'use client';

import { useEffect } from 'react';

type Loader = () => Promise<unknown>;

// Intent listeners are armed after a grace period so a pointer that is already over the page when
// it hydrates does not count: the boot loader and the hero entrance own that first second.
const INTENT_ARM_DELAY_MS = 1000;
// With no intent at all the chunks are still warmed after a few idle seconds.
const IDLE_PREFETCH_DELAY_MS = 3000;
const INTENT_EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];

/**
 * Warms the given chunks once without mounting anything: on the first sign of intent, or after a
 * few idle seconds, and never under Data Saver. Evaluating the shared GSAP chunk takes about 30 ms
 * on a laptop and four times that on the phones Lighthouse models, and nothing below the hero can
 * be seen before the visitor scrolls, so none of it belongs in the first paint's window.
 */
export function usePrefetchPhases(loaders: readonly Loader[]) {
  useEffect(() => {
    const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (connection?.saveData) return;

    let done = false;
    let armed = false;
    let idleHandle: number | undefined;

    const removeListeners = () => {
      if (!armed) return;
      armed = false;
      INTENT_EVENTS.forEach((type) => window.removeEventListener(type, prefetch));
    };
    function prefetch() {
      if (done) return;
      done = true;
      removeListeners();
      // A failed prefetch is not an error: the same import runs again when the section mounts.
      for (const load of loaders) load().catch(() => {});
    }

    const armTimer = setTimeout(() => {
      armed = true;
      INTENT_EVENTS.forEach((type) => window.addEventListener(type, prefetch, { passive: true }));
    }, INTENT_ARM_DELAY_MS);
    const idleTimer = setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(prefetch, { timeout: 2000 });
      } else {
        prefetch();
      }
    }, IDLE_PREFETCH_DELAY_MS);

    return () => {
      done = true;
      removeListeners();
      clearTimeout(armTimer);
      clearTimeout(idleTimer);
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [loaders]);
}
