/**
 * The id of the element the root layout renders so that a test can tell the page has hydrated.
 *
 * Shared by `HydrationMarker` and by `e2e/support/hydration.ts`, which imports this file directly
 * from Playwright's loader. It therefore imports nothing, like `theme.ts` beside it, which the e2e
 * specs import the same way.
 */
export const HYDRATION_MARKER_ID = 'hydration-marker';
