'use client';

import { useIsHydrated } from '@/hooks/use-is-hydrated';
import { HYDRATION_MARKER_ID } from '@/lib/hydration-marker';

/**
 * A hidden element whose `data-hydrated` is `false` in the served HTML and `true` once React has
 * hydrated the root layout, so an e2e spec can wait for hydration on any route. What that wait
 * cannot see is documented in `e2e/support/hydration.ts`. The value comes from `useIsHydrated`, so
 * the flip needs no effect of its own and causes no mismatch (ADR 0006). `hidden` computes to
 * `display: none`: no box, no accessibility-tree node.
 */
export function HydrationMarker() {
  const hydrated = useIsHydrated();
  return <span id={HYDRATION_MARKER_ID} hidden data-hydrated={hydrated ? 'true' : 'false'} />;
}
