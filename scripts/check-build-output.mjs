#!/usr/bin/env node
// Checks that the web build stays function-free: every App Router route was prerendered, its body
// file is on disk, nothing else in the build runs per request, and the only routes that need a
// server function are the ones on an explicit allowlist, which is empty.
//
// The failure this catches is silent. Since Next 15 a `GET` route handler is dynamic unless it says
// otherwise, so a handler that forgets `export const dynamic = 'force-static'` still serves the right
// bytes; it just becomes a function, and every crawl of it an invocation on the Hobby plan. Measured
// in this repository on 2026-09-12 (Next 16.3.4): the same handler built as `○ /llms.txt` with
// `force-static` and as `ƒ /llms-full.txt` without it. Issue #55 lands this gate before the first of
// the epic's handlers (#59 to #62), and #62 adds `/mcp`, the one function the site is meant to have.
//
// It reads what `next build` wrote, not the route table it printed, because Next 16 redesigned its
// terminal output and a grep over it breaks on a minor upgrade. The manifest shapes below are the
// ones Next 16.3.6 writes (checked against a build of this repository and Next's own
// `PrerenderManifestRoute` type on 2026-09-28):
//
// - `app-path-routes-manifest.json`: every App Router entry and the route it serves. An entry ending
//   in `/page` is a page, one ending in `/route` a route handler or a metadata route (`robots.txt`,
//   `opengraph-image`, `icon`, ...).
// - `prerender-manifest.json`: `routes` holds every prerendered path with its `srcRoute`, `compute`
//   and `initialRevalidateSeconds`, and `dynamicRoutes` every dynamic route with its `fallback`,
//   which is `false` when params the build did not produce are a 404 rather than an on-demand render
//   (ADR 0015).
// - `server/app/`: the prerendered bodies, `<path>.html` for a page (`index.html` for `/`) and
//   `<path>.body` for a handler.
// - Four manifests of what runs outside the App Router's routes, each empty in a function-free
//   build: `server/functions-config-manifest.json` (a `proxy.ts` or Node.js middleware appears as
//   `/_middleware`), `server/middleware-manifest.json` (Edge middleware), `server/server-reference-
//   manifest.json` (Server Actions, which run in a function when a form posts to them even from a
//   prerendered page), and `server/pages-manifest.json` (a Pages Router entry, where only the static
//   `.html` error pages are expected). Probed on 2026-09-28: a `src/proxy.ts` and a page with a
//   `'use server'` action both built with every route `○` and passed a check that read only the two
//   App Router manifests.
//
// A route needs a function when it has no prerendered path at all (a handler that exports `POST` or
// any other method beside `GET` builds as `ƒ` even with `force-static`, probed the same day), when it
// is a dynamic route whose `fallback` is not `false`, when a prerendered path revalidates
// (`initialRevalidateSeconds` is a number: ISR regenerates in a function), or when Next classified a
// path's `compute` as anything but `static` (a partially prerendered page resumes in a function).
// Each of those fails unless the route is in ALLOWED_FUNCTIONS, and a route in ALLOWED_FUNCTIONS
// that is not a function fails too, so the list stays exactly the set of functions. Every prerendered
// path must also have its body file, allowlisted routes included.
//
// All of that judges the routes the build has, so an endpoint whose handler vanished outright (its
// folder renamed or deleted) would pass it. REQUIRED_ROUTES names handlers that must be in every
// build: each must be an App Router route handler, not allowlisted as a function, with at least one
// prerendered path (for a dynamic one, the params of the route above its last dynamic segment when
// that is a route), and each path's body file is then required like any other.
//
// Usage: `pnpm check:build-output`, after `pnpm --filter web build`, or
// `node scripts/check-build-output.mjs [<distDir>]`, which defaults to apps/web/.next. Prints what it
// checked, with the build's BUILD_ID and when it was written, and exits 0; prints every problem and
// exits 1; or exits 2 when it could not run: no finished build, a manifest missing, unreadable or in
// a shape it does not know, or any other error.
//
// The rule this file shares with check-allowbuilds-drift.mjs: never exit 0 because it could not see.
// A manifest it cannot read, a field it depends on that is missing or holds a value it does not know,
// an entry it cannot classify, a prerendered path it cannot attribute to a route, or a build with no
// routes is a failure with a message, not a skip.

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

/**
 * Route handlers every build must contain, prerendered, as `app-path-routes-manifest.json` names
 * them. It lists the machine-readable endpoints from #60 on, and not yet #59's Markdown twins. A
 * dynamic one's paths come from its `generateStaticParams`: it must prerender at least one, and when
 * the route above its last dynamic segment is a route too, exactly that route's params, so
 * `/work/[slug]/index.json` needs one body per `/work/<slug>` page without this list naming a
 * slug. A required route is never a function, so it cannot be in `ALLOWED_FUNCTIONS` as well.
 * #60 adds the case-study JSON; each later endpoint adds its own route.
 *
 * @type {readonly string[]}
 */
export const REQUIRED_ROUTES = Object.freeze(['/case-studies.json', '/work/[slug]/index.json']);

/** Next's `PrerenderCompute`; every value but `static` finishes the response in a function. */
const COMPUTE_VALUES = new Set(['static', 'blocking', 'resuming']);

/**
 * The Pages Router entries a build without a `pages/` directory still writes, as static files.
 * Any other entry, or one of these mapped to something other than its `.html` file, renders in a
 * function.
 */
const STATIC_PAGES_ENTRIES = new Set(['/404', '/500']);

/** A failure that stops the check outright, as opposed to a finding about a route. */
export class CheckError extends Error {}

/** @typedef {'page' | 'route'} RouteKind */

/**
 * One entry of `app-path-routes-manifest.json`: the entry (`/about/page`), the route it serves
 * (`/about`), and whether it is a page or a handler.
 *
 * @typedef {{ entry: string, route: string, kind: RouteKind }} AppRoute
 */

/**
 * The parts of `prerender-manifest.json` this check reads. `readPrerender` has checked that every
 * `routes` entry carries `srcRoute`, `compute` and `initialRevalidateSeconds` with a value it knows,
 * and that every `dynamicRoutes` entry carries `fallback`; the rest is left `unknown`.
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
 * @param {Record<string, unknown>} manifest
 * @param {string} key
 * @param {string} name the manifest's file name, for the message
 * @returns {Record<string, unknown>}
 */
function objectField(manifest, key, name) {
  const value = manifest[key];
  if (!isObject(value)) throw new CheckError(`${name} has no \`${key}\` object`);
  return value;
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
 * Reads the two maps of `prerender-manifest.json`, refusing any `routes` entry that lacks a field
 * the check decides on, or holds a value it does not know: a renamed or dropped field must stop the
 * check, not read as "static".
 *
 * @param {string} source the file's text
 * @returns {PrerenderManifest}
 */
export function readPrerender(source) {
  const name = 'prerender-manifest.json';
  const manifest = parseObject(source, name);
  const routes = objectField(manifest, 'routes', name);
  const dynamicRoutes = objectField(manifest, 'dynamicRoutes', name);

  for (const [path, entry] of Object.entries(routes)) {
    if (!isObject(entry))
      throw new CheckError(`${name}: \`routes\` entry ${path} is not an object`);
    const where = `${name}: \`routes\` entry ${path}`;
    if (!('srcRoute' in entry) || (entry.srcRoute !== null && typeof entry.srcRoute !== 'string')) {
      throw new CheckError(`${where} has no \`srcRoute\` string or null`);
    }
    if (typeof entry.compute !== 'string' || !COMPUTE_VALUES.has(entry.compute)) {
      throw new CheckError(
        `${where} has \`compute\` ${JSON.stringify(entry.compute)}, not one of ` +
          `${[...COMPUTE_VALUES].join(', ')}, so this check cannot tell whether it runs in a ` +
          'function. Update the check for the new manifest shape.',
      );
    }
    const revalidate = entry.initialRevalidateSeconds;
    if (revalidate !== false && !(typeof revalidate === 'number' && revalidate >= 0)) {
      throw new CheckError(
        `${where} has \`initialRevalidateSeconds\` ${JSON.stringify(revalidate)}, neither false ` +
          'nor a number of seconds. Update the check for the new manifest shape.',
      );
    }
    if (
      'routeType' in entry &&
      entry.routeType !== undefined &&
      entry.routeType !== 'page' &&
      entry.routeType !== 'route'
    ) {
      throw new CheckError(`${where} has \`routeType\` ${JSON.stringify(entry.routeType)}`);
    }
  }
  for (const [path, entry] of Object.entries(dynamicRoutes)) {
    if (!isObject(entry)) {
      throw new CheckError(`${name}: \`dynamicRoutes\` entry ${path} is not an object`);
    }
    if (!('fallback' in entry)) {
      throw new CheckError(`${name}: \`dynamicRoutes\` entry ${path} has no \`fallback\``);
    }
  }

  return {
    routes: /** @type {Record<string, Record<string, unknown>>} */ (routes),
    dynamicRoutes: /** @type {Record<string, Record<string, unknown>>} */ (dynamicRoutes),
  };
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
 * The route a prerendered path belongs to: its `srcRoute`, or the path itself when Next wrote
 * `srcRoute: null` (a static route, in the Next releases that did so).
 *
 * @param {string} path
 * @param {Record<string, unknown>} entry
 */
const ownerOf = (path, entry) => (typeof entry.srcRoute === 'string' ? entry.srcRoute : path);

/**
 * The route a dynamic route's params must match: its own path up to its last dynamic segment, when
 * static segments follow it (`/work/[slug]` for `/work/[slug]/index.json`), and `null` otherwise.
 *
 * @param {string} route
 * @returns {string | null}
 */
export function paramsSibling(route) {
  const segments = route.split('/');
  const last = segments.findLastIndex((segment) => segment.startsWith('['));
  return last === -1 || last === segments.length - 1 ? null : segments.slice(0, last + 1).join('/');
}

/**
 * Every problem with the App Router routes of the build, and what was checked.
 *
 * @param {{
 *   appRoutes: AppRoute[],
 *   prerender: PrerenderManifest,
 *   allowed: readonly string[],
 *   required: readonly string[],
 *   hasBody: (file: string) => boolean,
 * }} build `hasBody` answers whether a file exists under `server/app`
 * @returns {{ problems: string[], routes: number, bodies: number, functions: string[] }}
 * @throws {CheckError} when a prerendered path or dynamic route matches no App Router route, or a
 *   path's `routeType` disagrees with its entry's name
 */
export function collectProblems({ appRoutes, prerender, allowed, required, hasBody }) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const functions = [];
  let bodies = 0;

  const allowedSet = new Set(allowed);
  const known = new Set(appRoutes.map(({ route }) => route));
  const prerenderedPaths = Object.entries(prerender.routes);

  for (const [path, entry] of prerenderedPaths) {
    if (!known.has(ownerOf(path, entry))) {
      throw new CheckError(
        `prerender-manifest.json: ${path} is prerendered for ${ownerOf(path, entry)}, which ` +
          'app-path-routes-manifest.json does not list, so this check cannot say what serves it. ' +
          'Update the check for the new manifest shape.',
      );
    }
  }
  for (const route of Object.keys(prerender.dynamicRoutes)) {
    if (!known.has(route)) {
      throw new CheckError(
        `prerender-manifest.json: the dynamic route ${route} is not in ` +
          'app-path-routes-manifest.json. Update the check for the new manifest shape.',
      );
    }
  }

  for (const { entry: appEntry, route, kind } of appRoutes) {
    const dynamic = prerender.dynamicRoutes[route];
    const instances = prerenderedPaths.filter(([path, entry]) => ownerOf(path, entry) === route);

    /** @type {string[]} why this route needs a function, if it does, each a whole message */
    const needs = [];
    if (dynamic === undefined && instances.length === 0) {
      needs.push(
        kind === 'route'
          ? `${route}: is not prerendered, so it runs as a server function on every request. A GET ` +
              "handler is dynamic by default: add `export const dynamic = 'force-static'`. A " +
              'handler that exports any method other than GET builds as a function even so'
          : `${route}: is not prerendered, so it renders in a server function on every request. ` +
              'Remove what makes it dynamic (a request API such as `headers()`, or `dynamic` set ' +
              'to force it)',
      );
    }
    if (dynamic !== undefined && dynamic.fallback !== false) {
      needs.push(
        `${route}: renders params the build did not produce on demand (fallback ` +
          `${JSON.stringify(dynamic.fallback)}), which needs a server function. Export ` +
          '`dynamicParams = false` (ADR 0015)',
      );
    }

    for (const [path, entry] of instances) {
      if (entry.routeType !== undefined && entry.routeType !== kind) {
        throw new CheckError(
          `prerender-manifest.json: ${path} is a ${JSON.stringify(entry.routeType)}, but ` +
            `app-path-routes-manifest.json names its entry ${appEntry}, a ${kind}. Update the ` +
            'check for the new manifest shape.',
        );
      }
      if (entry.initialRevalidateSeconds !== false) {
        needs.push(
          `${path} (${route}): revalidates every ${JSON.stringify(entry.initialRevalidateSeconds)} ` +
            's, and regeneration runs in a server function. Remove `revalidate` from the route',
        );
      }
      if (entry.compute !== 'static') {
        needs.push(
          `${path} (${route}): Next classified its compute as ${JSON.stringify(entry.compute)}, ` +
            'so part of every response is rendered in a server function',
        );
      }
      const file = bodyFile(path, kind);
      if (hasBody(file)) {
        bodies += 1;
      } else {
        problems.push(`${path} (${route}): no prerendered body at server/app/${file}.`);
      }
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
    } else {
      for (const need of needs) problems.push(`${need}.`);
    }
  }

  for (const route of allowedSet) {
    if (!known.has(route)) {
      problems.push(
        `${route}: is in ALLOWED_FUNCTIONS but the build has no such route. Drop it from the list.`,
      );
    }
  }

  /** @param {string} route */
  const pathsOf = (route) =>
    prerenderedPaths
      .filter(([path, entry]) => ownerOf(path, entry) === route)
      .map(([path]) => path);

  for (const route of new Set(required)) {
    const kind = appRoutes.find((appRoute) => appRoute.route === route)?.kind;
    const paths = pathsOf(route);
    if (kind === undefined) {
      problems.push(
        `${route}: is in REQUIRED_ROUTES but the build has no such route. Restore its handler, or ` +
          'drop it from the list in the change that retires the endpoint.',
      );
      continue;
    }
    if (kind !== 'route') {
      problems.push(
        `${route}: is in REQUIRED_ROUTES but is built as a ${kind}, not a route handler, so it ` +
          'serves HTML. Restore its `route.ts`.',
      );
    }
    if (allowedSet.has(route)) {
      // The allowlist would otherwise turn its function findings into an accepted function.
      problems.push(
        `${route}: is in both REQUIRED_ROUTES and ALLOWED_FUNCTIONS, but a required route must be ` +
          'prerendered. Take it out of one list.',
      );
    }
    if (prerender.dynamicRoutes[route] === undefined) continue;
    if (paths.length === 0) {
      // A static route with no path is already a finding above; a dynamic one with fixed params and
      // none passes it, and serves nothing but 404s.
      problems.push(
        `${route}: is in REQUIRED_ROUTES but prerendered no path, so every URL under it is a 404. ` +
          'Its `generateStaticParams` returned nothing.',
      );
      continue;
    }
    const sibling = paramsSibling(route);
    if (sibling === null || !known.has(sibling)) continue;
    const depth = route.split('/').length - sibling.split('/').length;
    const own = new Set(paths.map((path) => path.split('/').slice(0, -depth).join('/')));
    const theirs = new Set(pathsOf(sibling));
    const missing = [...theirs].filter((path) => !own.has(path)).sort();
    const extra = [...own].filter((path) => !theirs.has(path)).sort();
    if (missing.length > 0) {
      problems.push(
        `${route}: is in REQUIRED_ROUTES but prerendered nothing for ${missing.join(', ')}, which ` +
          `${sibling} serves, so those URLs are 404s. Its \`generateStaticParams\` has drifted ` +
          "from the page's.",
      );
    }
    if (extra.length > 0) {
      problems.push(
        `${route}: is in REQUIRED_ROUTES and prerendered ${extra.join(', ')}, which ${sibling} ` +
          "does not serve. Its `generateStaticParams` has drifted from the page's.",
      );
    }
  }

  return { problems, routes: appRoutes.length, bodies, functions };
}

/**
 * Every problem in the four manifests of what runs outside the App Router's routes: a proxy or
 * middleware, a Server Action, a Pages Router entry, or a function Next configured for a route the
 * allowlist does not name.
 *
 * @param {{
 *   functionsConfig: string,
 *   middleware: string,
 *   serverReference: string,
 *   pages: string,
 *   allowed: readonly string[],
 * }} sources each manifest's text, and the allowlist
 * @returns {string[]}
 */
export function collectOtherFunctions({
  functionsConfig,
  middleware,
  serverReference,
  pages,
  allowed,
}) {
  /** @type {string[]} */
  const problems = [];
  const allowedSet = new Set(allowed);

  const configName = 'server/functions-config-manifest.json';
  for (const key of Object.keys(
    objectField(parseObject(functionsConfig, configName), 'functions', configName),
  )) {
    if (key === '/_middleware') {
      problems.push(
        `${key}: a \`proxy.ts\` (or Node.js middleware) runs in a server function on every request ` +
          `it matches (${configName}). Remove it.`,
      );
    } else if (!allowedSet.has(key)) {
      problems.push(`${key}: Next configured it as a server function (${configName}).`);
    }
  }

  const middlewareName = 'server/middleware-manifest.json';
  const middlewareManifest = parseObject(middleware, middlewareName);
  for (const field of ['middleware', 'functions']) {
    for (const key of Object.keys(objectField(middlewareManifest, field, middlewareName))) {
      problems.push(
        `${key}: Edge middleware or an Edge function runs on every request it matches ` +
          `(${middlewareName} \`${field}\`). Remove it.`,
      );
    }
  }

  const referenceName = 'server/server-reference-manifest.json';
  const references = parseObject(serverReference, referenceName);
  for (const runtime of ['node', 'edge']) {
    const actions = Object.keys(objectField(references, runtime, referenceName)).length;
    if (actions > 0) {
      problems.push(
        `${actions} Server Action${actions === 1 ? '' : 's'} (${referenceName} \`${runtime}\`): ` +
          'each runs in a server function when a form posts to it, even from a prerendered page. ' +
          "Remove the `'use server'` functions.",
      );
    }
  }

  const pagesName = 'server/pages-manifest.json';
  for (const [key, file] of Object.entries(parseObject(pages, pagesName))) {
    if (typeof file !== 'string') throw new CheckError(`${pagesName}: ${key} is not a string`);
    if (!(STATIC_PAGES_ENTRIES.has(key) && file === `pages${key}.html`)) {
      problems.push(
        `${key}: a Pages Router entry (${pagesName}, ${file}), which renders in a server function. ` +
          'This site is App Router only.',
      );
    }
  }

  return problems;
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
  if (args.length > 1 || args[0] === '') {
    console.error('Usage: node scripts/check-build-output.mjs [<distDir>]');
    process.exitCode = 2;
    return;
  }
  const dist = args[0] === undefined ? DEFAULT_DIST : resolve(args[0]);

  let result;
  let other;
  let build;
  try {
    const noBuild = `Run \`pnpm --filter web build\` first.`;
    if (!existsSync(dist)) throw new CheckError(`there is no build at ${dist}. ${noBuild}`);
    if (!statSync(dist).isDirectory()) throw new CheckError(`${dist} is not a directory.`);
    const buildIdFile = join(dist, 'BUILD_ID');
    if (!existsSync(buildIdFile)) {
      throw new CheckError(
        `${dist} has no BUILD_ID, so it is not a finished \`next build\`. ${noBuild}`,
      );
    }
    const buildId = read(buildIdFile).trim();
    if (buildId === '') throw new CheckError(`${buildIdFile} is empty.`);
    build = { id: buildId, at: statSync(buildIdFile).mtime.toISOString() };

    const appRoutes = readAppRoutes(read(join(dist, 'app-path-routes-manifest.json')));
    const prerender = readPrerender(read(join(dist, 'prerender-manifest.json')));
    const server = join(dist, 'server');
    const app = join(server, 'app');
    result = collectProblems({
      appRoutes,
      prerender,
      allowed: ALLOWED_FUNCTIONS,
      required: REQUIRED_ROUTES,
      hasBody: (file) => {
        try {
          return statSync(join(app, file)).isFile();
        } catch {
          return false;
        }
      },
    });
    other = collectOtherFunctions({
      functionsConfig: read(join(server, 'functions-config-manifest.json')),
      middleware: read(join(server, 'middleware-manifest.json')),
      serverReference: read(join(server, 'server-reference-manifest.json')),
      pages: read(join(server, 'pages-manifest.json')),
      allowed: ALLOWED_FUNCTIONS,
    });
  } catch (error) {
    // Anything that stops the check is a could-not-run, never exit 1 (a finding) and never 0.
    const message =
      error instanceof CheckError
        ? error.message
        : error instanceof Error
          ? (error.stack ?? error.message)
          : String(error);
    console.error(`build-output check could not run: ${message}`);
    process.exitCode = 2;
    return;
  }

  const { routes, bodies, functions } = result;
  const problems = [...result.problems, ...other];
  if (problems.length > 0) {
    console.error(
      `\nThe build at ${dist} (BUILD_ID ${build.id}) is not function-free ` +
        '(scripts/check-build-output.mjs):\n',
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  const allowedNote =
    functions.length === 0 ? 'no server function' : `server functions: ${functions.join(', ')}`;
  console.log(
    `build output: ${routes} routes, ${bodies} prerendered bodies, ${allowedNote} ` +
      `(BUILD_ID ${build.id}, written ${build.at}).`,
  );
}

/**
 * Whether this module was started as the command, as opposed to imported by its tests. Both sides go
 * through `realpathSync`, for the reason check-allowbuilds-drift.mjs gives at its copy of this guard:
 * a script reached through a symlinked directory otherwise skips `main()` and exits 0 having checked
 * nothing. An `argv[1]` that no longer resolves (a loader, or an importer that is gone) is not this
 * file, so importing the module never throws here.
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (startedAsCommand()) main(process.argv.slice(2));
