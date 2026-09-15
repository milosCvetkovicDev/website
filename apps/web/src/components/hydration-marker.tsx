'use client';

import { useIsHydrated } from '@/hooks/use-is-hydrated';
import { HYDRATION_MARKER_ID } from '@/lib/hydration-marker';

/**
 * A hidden element whose `data-hydrated` reads `false` in the served HTML and `true` once React has
 * hydrated the page. The root layout renders it on every route, so an e2e spec can wait for
 * hydration anywhere, not only on `/` (see `e2e/support/hydration.ts`).
 *
 * The value is `useIsHydrated`'s. Its server snapshot is what both the server render and the hydration
 * render read, and React re-renders from the client snapshot straight after the hydration commit, so
 * the attribute changes with no effect and no mismatch (ADR 0006).
 *
 * `hidden` keeps it out of layout, out of the accessibility tree and out of the tab order. It hydrates
 * with the layout, so content a page wraps in `<Suspense>`, or puts under a `loading.tsx`, would
 * hydrate after it flips.
 */
export function HydrationMarker() {
  const hydrated = useIsHydrated();
  return <span id={HYDRATION_MARKER_ID} hidden data-hydrated={hydrated ? 'true' : 'false'} />;
}
