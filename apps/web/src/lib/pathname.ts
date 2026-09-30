/**
 * A route's pathname, and the path of its Markdown twin (#59). No imports, on purpose: `metadata.ts`
 * (every page's head), `serialise.ts` (every twin's body) and the e2e helpers all read these, and
 * none of them should pull in the content modules to get a regular expression and a template.
 */

// A pathname and nothing else: a leading slash, no trailing one (the root aside), no query, no
// fragment, no origin, no dot. A canonical naming any other URL than the route's own is worse than
// none, and a twin exists for exactly the paths a canonical can name.
const PATHNAME = /^\/(?:[\w-]+(?:\/[\w-]+)*)?$/;

/** Throws unless `path` is a clean pathname such as `/work` or `/`, naming `caller`. */
export function assertPathname(path: string, caller: string): void {
  if (!PATHNAME.test(path)) {
    throw new Error(`${caller}: "${path}" is not a clean pathname such as /work or /`);
  }
}

/** Where a route's twin is served: `/` → `/index.md`, `/about` → `/about/index.md`. */
export function markdownTwinPath(routePath: string): string {
  assertPathname(routePath, 'markdownTwinPath');
  return routePath === '/' ? '/index.md' : `${routePath}/index.md`;
}
