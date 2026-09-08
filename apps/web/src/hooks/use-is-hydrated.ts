'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` while server-rendering and hydrating, `true` once React has mounted on the client.
 * Replaces the `useEffect(() => setMounted(true), [])` pattern, which causes a cascading render
 * and is rejected by react-hooks/set-state-in-effect.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
