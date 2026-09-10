import { expect, test } from '@playwright/test';
import { THEME_INIT_SCRIPT } from '../src/lib/theme';

/**
 * Both 404 routes must be server-rendered through the root layout.
 *
 * A render-time `notFound()` throws, and React error boundaries do not run during SSR, so the throw
 * unwinds past the root layout and Next answers with its bare `<html id="__next_error__">` recovery
 * shell instead. The layout's <head> never reaches the HTML, so the theme init script is absent and
 * the client re-creates it — a React-created <script> never executes, leaving a dark-theme visitor
 * with a flash of the light theme. `dynamicParams = false` on /work/[slug] keeps unknown slugs at
 * the routing layer, where they render through the layout like any other 404.
 *
 * `console-clean.spec.ts` only catches this locally: React's "Encountered a script tag" warning is
 * dev-only and CI serves the production build, where it is stripped. This spec is the CI-visible
 * guard, so it asserts on the server HTML rather than on the console.
 */

/** Paths that must answer 404 while still rendering the full layout. */
const NOT_FOUND_PATHS = ['/no-such-page', '/work/does-not-exist'];

for (const path of NOT_FOUND_PATHS) {
  test(`${path} is server-rendered through the root layout`, async ({ request }) => {
    const response = await request.get(path);
    const html = await response.text();

    expect(response.status(), `${path} should still answer 404`).toBe(404);

    // Match the script verbatim, and never loosen this to a fragment such as 'classList.add'. The
    // RSC flight payload embedded further down the document describes the same <head>, so every
    // fragment of the script is present in the HTML even when the recovery shell dropped the real
    // tag — a fragment match passes on exactly the broken page this spec exists to catch. The
    // payload is JSON-escaped, so its copy of the script reads `\u0026\u0026` where the source
    // has `&&`, and only the real inline tag matches the source string.
    expect(
      html.includes(THEME_INIT_SCRIPT),
      `${path} must render the root layout's <head>: the theme init script has to be in the ` +
        'server HTML so it runs before first paint. Missing it means the route threw during SSR ' +
        'and Next served its <html id="__next_error__"> recovery shell, which drops the layout ' +
        'and leaves a dark-theme visitor with a flash of the light theme.',
    ).toBe(true);
  });
}
