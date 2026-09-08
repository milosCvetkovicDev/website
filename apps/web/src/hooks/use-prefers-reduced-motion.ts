'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const canQuery = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function subscribe(onChange: () => void) {
  if (!canQuery()) return () => {};
  const mediaQueryList = window.matchMedia(QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

const getSnapshot = () => canQuery() && window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/** Live value of the user's reduced-motion preference; `false` on the server or without matchMedia. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
