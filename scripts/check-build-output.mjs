#!/usr/bin/env node
// Checks that the web build stays function-free: every App Router route was prerendered, its body
// file is on disk, and the only routes that need a server function are the ones on an explicit
// allowlist, which is empty.
//
// The failure this catches is silent. Since Next 15 a `GET` route handler is dynamic unless it says
// otherwise, so a handler that forgets `export const dynamic = 'force-static'` still serves the right
// bytes; it just becomes a function, and every crawl of it an invocation on the Hobby plan. Measured
// in this repository on 2026-09-12 (Next 16.3.4): the same handler built as `○ /llms.txt` with
// `force-static` and as `ƒ /llms-full.txt` without it. Issue #55 lands this gate before the first of
// the epic's handlers (#59 to #62), and #62 adds `/mcp`, the one function the site is meant to have.
//
// It reads what `next build` wrote, not the route table it printed, because Next 16 redesigned its
// terminal output and a grep over it breaks on a minor upgrade:
//
// - `app-path-routes-manifest.json`: every App Router entry and the route it serves. An entry ending
//   in `/page` is a page, one ending in `/route` a route handler or a metadata route (`robots.txt`,
//   `opengraph-image`, `icon`, ...).
// - `prerender-manifest.json`: `routes` holds every prerendered path with its `srcRoute`, and
//   `dynamicRoutes` every dynamic route with its `fallback`, which is `false` when params the build
//   did not produce are a 404 rather than an on-demand render (ADR 0015).
// - `server/app/`: the prerendered bodies, `<path>.html` for a page (`index.html` for `/`) and
//   `<path>.body` for a handler.
//
// A route needs a function when it has no prerendered path at all, when it is a dynamic route whose
// `fallback` is not `false`, when a prerendered path revalidates (`initialRevalidateSeconds` is a
// number: ISR regenerates in a function), or when Next classified a path's `compute` as anything but
// `static` (a partially prerendered page resumes in a function). Each of those fails unless the route
// is in ALLOWED_FUNCTIONS, and a route in ALLOWED_FUNCTIONS that is not a function fails too, so the
// list stays exactly the set of functions. Every prerendered path must also have its body file.
//
// Usage: `pnpm check:build-output`, after `pnpm --filter web build`, or
// `node scripts/check-build-output.mjs [<distDir>]`, which defaults to apps/web/.next. Prints what it
// checked and exits 0, prints every problem and exits 1, or exits 2 when it could not run: no build,
// or a manifest missing, unreadable or in a shape it does not know.
//
// The rule this file shares with check-allowbuilds-drift.mjs: never exit 0 because it could not see.
// A manifest it cannot read, an entry it cannot classify or a build with no routes is a failure with a
// message, not a skip.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIST = join(repoRoot, 'apps', 'web', '.next');

/**
 * The routes permitted to need a server function, as `app-path-routes-manifest.json` names them.
 * Empty: nothing on this site renders per request. #62 adds '/mcp' and nothing else.
 *
 * @type {readonly string[]}
 */
export const ALLOWED_FUNCTIONS = Object.freeze([]);

/** A failure that stops the check outright, as opposed to a finding about a route. */
class CheckError extends Error {}

/** @typedef {'page' | 'route'} RouteKind */

/**
 * One entry of `app-path-routes-manifest.json`: the entry (`/about/page`), the route it serves
 * (`/about`), and whether it is a page or a handler.
 *
 * @typedef {{ entry: string, route: string, kind: RouteKind }} AppRoute
 */

/**
 * The parts of `prerender-manifest.json` this check reads. Values are left `unknown` where Next may
 * change them; the check inspects each one before relying on it.
 *
 * @typedef {{
 *   routes: Record<string, Record<string, unknown>>,
 *   dynamicRoutes: Record<string, Record<string, unknown>>,
 * }} PrerenderManifest
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {string} source
 * @param {string} name the manifest's file name, for the message
 * @returns {Record<string, unknown>}
 */
function parseObject(source, name) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new CheckError(`${name} is not JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (!isObject(parsed)) throw new CheckError(`${name} is not an object`);
  return parsed;
}

/**
 * Reads `app-path-routes-manifest.json`.
 *
 * @param {string} source the file's text
 * @returns {AppRoute[]}
 */
export function readAppRoutes(source) {
  const name = 'app-path-routes-manifest.json';
  const manifest = parseObject(source, name);

  /** @type {AppRoute[]} */
  const routes = [];
  for (const [entry, route] of Object.entries(manifest)) {
    if (typeof route !== 'string') {
      throw new CheckError(`${name}: the route of ${entry} is not a string`);
    }
    /** @type {RouteKind | null} */
    const kind = entry.endsWith('/page') ? 'page' : entry.endsWith('/route') ? 'route' : null;
    if (kind === null) {
      throw new CheckError(
        `${name}: cannot tell whether ${entry} is a page or a route handler, so this check cannot ` +
          `say which body file it should have. Update the check for the new entry shape.`,
      );
    }
    routes.push({ entry, route, kind });
  }

  if (routes.length === 0) {
    throw new CheckError(`${name} lists no routes, so there is nothing to check.`);
  }
  return routes;
}

/**
 * Reads the two maps of `prerender-manifest.json`.
 *
 * @param {string} source the file's text
 * @returns {PrerenderManifest}
 */
export function readPrerender(source) {
  const name = 'prerender-manifest.json';
  const manifest = parseObject(source, name);
  /** @type {Record<string, Record<string, Record<string, unknown>>>} */
  const maps = {};
  for (const key of ['routes', 'dynamicRoutes']) {
    const map = manifest[key];
    if (!isObject(map)) throw new CheckError(`${name} has no \`${key}\` object`);
    for (const [path, value] of Object.entries(map)) {
      if (!isObject(value))
        throw new CheckError(`${name}: \`${key}\` entry ${path} is not an object`);
    }
    maps[key] = /** @type {Record<string, Record<string, unknown>>} */ (map);
  }
  return { routes: maps.routes, dynamicRoutes: maps.dynamicRoutes };
}

/**
 * Where `next build` writes a prerendered path's body, relative to `server/app`.
 *
 * @param {string} path a concrete path, `/` or `/work/self-healing-agent`
 * @param {RouteKind} kind
 * @returns {string}
 */
export function bodyFile(path, kind) {
  return `${path === '/' ? 'index' : path.slice(1)}.${kind === 'page' ? 'html' : 'body'}`;
}

/**
 * Every problem with the build, and what was checked.
 *
 * @param {{
 *   appRoutes: AppRoute[],
 *   prerender: PrerenderManifest,
 *   allowed: readonly string[],
 *   hasBody: (file: string) => boolean,
 * }} build `hasBody` answers whether a file exists under `server/app`
 * @returns {{ problems: string[], routes: number, bodies: number, functions: string[] }}
 */
export function collectProblems({ appRoutes, prerender, allowed, hasBody }) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const functions = [];
  let bodies = 0;

  const allowedSet = new Set(allowed);
  const known = new Set(appRoutes.map(({ route }) => route));
  const prerenderedPaths = Object.entries(prerender.routes);

  for (const { route, kind } of appRoutes) {
    const dynamic = prerender.dynamicRoutes[route];
    const instances = prerenderedPaths.filter(
      ([path, entry]) => (typeof entry.srcRoute === 'string' ? entry.srcRoute : path) === route,
    );

    /** @type {string[]} why this route needs a function, if it does */
    const needs = [];
    if (dynamic === undefined && instances.length === 0) {
      needs.push(
        kind === 'route'
          ? 'is not prerendered, so it runs as a server function on every request. A GET handler ' +
              "is dynamic by default: add `export const dynamic = 'force-static'`"
          : 'is not prerendered, so it renders in a server function on every request. Remove what ' +
              'makes it dynamic (a request API such as `headers()`, or `dynamic` set to force it)',
      );
    }
    if (dynamic !== undefined && dynamic.fallback !== false) {
      needs.push(
        `renders params the build did not produce on demand (fallback ${JSON.stringify(dynamic.fallback)}), ` +
          'which needs a server function. Export `dynamicParams = false` (ADR 0015)',
      );
    }

    if (allowedSet.has(route)) {
      if (needs.length === 0) {
        problems.push(
          `${route}: is in ALLOWED_FUNCTIONS but was built static. Drop it from the list, which ` +
            'must name exactly the routes that need a function.',
        );
      } else {
        functions.push(route);
      }
      continue;
    }
    for (const reason of needs) problems.push(`${route}: ${reason}.`);

    for (const [path, entry] of instances) {
      const revalidate = entry.initialRevalidateSeconds;
      if (revalidate !== false && revalidate !== undefined) {
        problems.push(
          `${path} (${route}): revalidates every ${JSON.stringify(revalidate)} s, and ` +
            'regeneration runs in a server function. Remove `revalidate` from the route.',
        );
      }
      if (entry.compute !== undefined && entry.compute !== 'static') {
        problems.push(
          `${path} (${route}): Next classified its compute as ${JSON.stringify(entry.compute)}, ` +
            'so part of every response is rendered in a server function.',
        );
      }
      const file = bodyFile(path, kind);
      if (hasBody(file)) {
        bodies += 1;
      } else {
        problems.push(`${path} (${route}): no prerendered body at server/app/${file}.`);
      }
    }
  }

  for (const route of allowedSet) {
    if (!known.has(route)) {
      problems.push(
        `${route}: is in ALLOWED_FUNCTIONS but the build has no such route. Drop it from the list.`,
      );
    }
  }

  return { problems, routes: appRoutes.length, bodies, functions };
}

/**
 * @param {string} path
 * @returns {string}
 */
function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new CheckError(
      `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** @param {string[]} args */
function main(args) {
  if (args.length > 1) {
    console.error('Usage: node scripts/check-build-output.mjs [<distDir>]');
    process.exitCode = 2;
    return;
  }
  const dist = args[0] === undefined ? DEFAULT_DIST : resolve(args[0]);

  let result;
  try {
    if (!existsSync(dist)) {
      throw new CheckError(`there is no build at ${dist}. Run \`pnpm --filter web build\` first.`);
    }
    const appRoutes = readAppRoutes(read(join(dist, 'app-path-routes-manifest.json')));
    const prerender = readPrerender(read(join(dist, 'prerender-manifest.json')));
    const app = join(dist, 'server', 'app');
    result = collectProblems({
      appRoutes,
      prerender,
      allowed: ALLOWED_FUNCTIONS,
      hasBody: (file) => {
        try {
          return statSync(join(app, file)).isFile();
        } catch {
          return false;
        }
      },
    });
  } catch (error) {
    if (!(error instanceof CheckError)) throw error;
    console.error(`build-output check could not run: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const { problems, routes, bodies, functions } = result;
  if (problems.length > 0) {
    console.error(
      `\nThe build at ${dist} is not function-free (scripts/check-build-output.mjs):\n`,
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  const allowedNote =
    functions.length === 0 ? 'no server function' : `server functions: ${functions.join(', ')}`;
  console.log(`build output: ${routes} routes, ${bodies} prerendered bodies, ${allowedNote}.`);
}

/**
 * Whether this module was started as the command, as opposed to imported by its tests. Both sides go
 * through `realpathSync`, for the reason check-allowbuilds-drift.mjs gives at its copy of this guard:
 * a script reached through a symlinked directory otherwise skips `main()` and exits 0 having checked
 * nothing.
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (startedAsCommand()) main(process.argv.slice(2));
