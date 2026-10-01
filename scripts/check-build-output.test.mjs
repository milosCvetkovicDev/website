// Tests for the build-output gate. Run with `pnpm test:scripts` (node:test, no dependency, no build).
//
// The gate reads the manifests `next build` writes, so these tests hand it artifact trees built here
// in a temporary directory, shaped like the real one (Next 16.3.6, 2026-09-28): a clean tree must
// pass, and each way a route can come to need a server function, or lose its prerendered body, must
// fail. Most cases call `collectProblems` directly; the command itself is spawned for the exit codes,
// because an exit code is what CI reads.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_FUNCTIONS,
  CheckError,
  REQUIRED_ROUTES,
  bodyFile,
  collectOtherFunctions,
  collectProblems,
  paramsSibling,
  readAppRoutes,
  readPrerender,
} from './check-build-output.mjs';

/** @typedef {import('./check-build-output.mjs').PrerenderManifest} PrerenderManifest */

const thisScript = join(dirname(fileURLToPath(import.meta.url)), 'check-build-output.mjs');

/**
 * `app-path-routes-manifest.json` for a small site shaped like this one: static pages, metadata
 * routes, force-static handlers, and a dynamic page and handlers with fixed params (ADR 0015),
 * the routes in `REQUIRED_ROUTES` among them.
 */
const APP_ROUTES = {
  '/page': '/',
  '/_not-found/page': '/_not-found',
  '/about/page': '/about',
  '/robots.txt/route': '/robots.txt',
  '/opengraph-image/route': '/opengraph-image',
  '/case-studies.json/route': '/case-studies.json',
  '/feed.xml/route': '/feed.xml',
  '/work/[slug]/page': '/work/[slug]',
  '/work/[slug]/og-image.png/route': '/work/[slug]/og-image.png',
  '/work/[slug]/index.json/route': '/work/[slug]/index.json',
};

/**
 * `APP_ROUTES` with the site's one server function, the MCP server's `POST` handler (#62), as a
 * build of this repository lists it: an app route with no prerendered path. The command checks
 * against the real `ALLOWED_FUNCTIONS`, so the trees it is handed carry it.
 */
const BUILT_ROUTES = { ...APP_ROUTES, '/mcp/route': '/mcp' };

/**
 * One `routes` entry of `prerender-manifest.json`, with the fields the gate reads.
 *
 * @param {string} srcRoute
 * @param {Record<string, unknown>} [extra]
 */
const prerendered = (srcRoute, extra = {}) => ({
  compute: 'static',
  initialRevalidateSeconds: false,
  srcRoute,
  ...extra,
});

/**
 * The four manifests of what runs outside the App Router's routes, as a function-free Next 16.3.6
 * build writes them (the encryption key left out, which the check does not read).
 */
const CLEAN_OTHER = {
  functionsConfig: { version: 1, functions: {} },
  middleware: { version: 3, middleware: {}, sortedMiddleware: [], functions: {} },
  serverReference: { node: {}, edge: {} },
  pages: { '/404': 'pages/404.html', '/500': 'pages/500.html' },
};

/** @param {Partial<Record<keyof typeof CLEAN_OTHER, unknown>>} [overrides] */
const otherFunctions = (overrides = {}, allowed = /** @type {readonly string[]} */ ([])) => {
  const manifests = { ...CLEAN_OTHER, ...overrides };
  return collectOtherFunctions({
    functionsConfig: JSON.stringify(manifests.functionsConfig),
    middleware: JSON.stringify(manifests.middleware),
    serverReference: JSON.stringify(manifests.serverReference),
    pages: JSON.stringify(manifests.pages),
    allowed,
  });
};

/** @returns {PrerenderManifest} the prerender manifest that matches `APP_ROUTES`, all static */
const cleanPrerender = () => ({
  routes: {
    '/': prerendered('/'),
    '/_not-found': prerendered('/_not-found', { initialStatus: 404 }),
    '/about': prerendered('/about'),
    '/robots.txt': prerendered('/robots.txt'),
    '/opengraph-image': prerendered('/opengraph-image'),
    '/case-studies.json': prerendered('/case-studies.json'),
    '/feed.xml': prerendered('/feed.xml'),
    '/work/a': prerendered('/work/[slug]'),
    '/work/b': prerendered('/work/[slug]'),
    '/work/a/og-image.png': prerendered('/work/[slug]/og-image.png'),
    '/work/b/og-image.png': prerendered('/work/[slug]/og-image.png'),
    '/work/a/index.json': prerendered('/work/[slug]/index.json'),
    '/work/b/index.json': prerendered('/work/[slug]/index.json'),
  },
  dynamicRoutes: {
    '/work/[slug]': { fallback: false },
    '/work/[slug]/og-image.png': { fallback: false },
    '/work/[slug]/index.json': { fallback: false },
  },
});

/** Every body file the clean tree above emits, relative to `server/app`. */
const CLEAN_BODIES = [
  'index.html',
  '_not-found.html',
  'about.html',
  'robots.txt.body',
  'opengraph-image.body',
  'case-studies.json.body',
  'feed.xml.body',
  'work/a.html',
  'work/b.html',
  'work/a/og-image.png.body',
  'work/b/og-image.png.body',
  'work/a/index.json.body',
  'work/b/index.json.body',
];

/**
 * @param {{
 *   appRoutes?: Record<string, string>,
 *   prerender?: PrerenderManifest,
 *   bodies?: string[],
 *   allowed?: readonly string[],
 *   required?: readonly string[],
 * }} [overrides]
 */
function check({
  appRoutes = APP_ROUTES,
  prerender = cleanPrerender(),
  bodies = CLEAN_BODIES,
  allowed = [],
  required = REQUIRED_ROUTES,
} = {}) {
  const present = new Set(bodies);
  return collectProblems({
    appRoutes: readAppRoutes(JSON.stringify(appRoutes)),
    prerender: readPrerender(JSON.stringify(prerender)),
    allowed,
    required,
    hasBody: (file) => present.has(file),
  });
}

/**
 * The clean tree without one route: its app-manifest entry, its prerendered paths, its dynamic
 * entry and its bodies, as a build without that route's folder would write it.
 *
 * @param {string} route
 */
function without(route) {
  const appRoutes = Object.fromEntries(Object.entries(APP_ROUTES).filter(([, r]) => r !== route));
  const prerender = cleanPrerender();
  for (const [path, entry] of Object.entries(prerender.routes)) {
    if ((entry.srcRoute ?? path) === route) delete prerender.routes[path];
  }
  delete prerender.dynamicRoutes[route];
  // A static handler's one body is its path plus `.body`; the dynamic one's are every slug's.
  const gone = (/** @type {string} */ body) =>
    route === '/work/[slug]/index.json'
      ? body.endsWith('/index.json.body')
      : body === `${route.slice(1)}.body`;
  return { appRoutes, prerender, bodies: CLEAN_BODIES.filter((b) => !gone(b)) };
}

describe('bodyFile', () => {
  for (const [route, kind, file] of [
    ['/', 'page', 'index.html'],
    ['/about', 'page', 'about.html'],
    ['/work/a', 'page', 'work/a.html'],
    ['/robots.txt', 'route', 'robots.txt.body'],
    ['/work/a/og-image.png', 'route', 'work/a/og-image.png.body'],
    ['/feed.xml', 'route', 'feed.xml.body'],
    ['/index.md', 'route', 'index.md.body'],
    ['/about/index.md', 'route', 'about/index.md.body'],
    ['/case-studies.json', 'route', 'case-studies.json.body'],
    ['/work/a/index.json', 'route', 'work/a/index.json.body'],
  ]) {
    it(`finds ${route} (${kind}) at server/app/${file}`, () => {
      assert.equal(bodyFile(route, /** @type {'page' | 'route'} */ (kind)), file);
    });
  }
});

describe('readAppRoutes', () => {
  it('tells pages from handlers by the entry name', () => {
    assert.deepEqual(
      readAppRoutes(
        JSON.stringify({ '/about/page': '/about', '/robots.txt/route': '/robots.txt' }),
      ),
      [
        { entry: '/about/page', route: '/about', kind: 'page' },
        { entry: '/robots.txt/route', route: '/robots.txt', kind: 'route' },
      ],
    );
  });

  it('refuses an entry it cannot classify rather than skipping it', () => {
    assert.throws(
      () => readAppRoutes(JSON.stringify({ '/about/layout': '/about' })),
      /cannot tell whether .*\/about\/layout/,
    );
  });

  it('refuses a manifest that is not JSON', () => {
    assert.throws(() => readAppRoutes('{ not json'), /not JSON/);
  });

  it('refuses a manifest that is not an object of strings', () => {
    assert.throws(() => readAppRoutes('[]'), /not an object/);
    assert.throws(() => readAppRoutes(JSON.stringify({ '/page': 1 })), /not a string/);
  });

  it('refuses a manifest with no routes, which would check nothing', () => {
    assert.throws(() => readAppRoutes('{}'), /no routes/);
  });
});

describe('readPrerender', () => {
  /** @param {Record<string, unknown>} entry one `routes` entry, under `/a` */
  const withRoute = (entry) => JSON.stringify({ routes: { '/a': entry }, dynamicRoutes: {} });

  it('refuses a manifest with no `routes` or `dynamicRoutes` object', () => {
    assert.throws(() => readPrerender(JSON.stringify({ dynamicRoutes: {} })), /`routes`/);
    assert.throws(() => readPrerender(JSON.stringify({ routes: {} })), /`dynamicRoutes`/);
    assert.throws(
      () => readPrerender(JSON.stringify({ routes: [], dynamicRoutes: {} })),
      /no `routes` object/,
    );
  });

  it('refuses a manifest that is not JSON', () => {
    assert.throws(() => readPrerender(''), /not JSON/);
  });

  it('refuses a `routes` or `dynamicRoutes` entry that is not an object', () => {
    assert.throws(
      () => readPrerender(JSON.stringify({ routes: { '/a': 1 }, dynamicRoutes: {} })),
      /`routes` entry \/a is not an object/,
    );
    assert.throws(
      () => readPrerender(JSON.stringify({ routes: {}, dynamicRoutes: { '/b/[x]': null } })),
      /`dynamicRoutes` entry \/b\/\[x\] is not an object/,
    );
  });

  // A renamed or dropped field must stop the check: read as absent, each would pass a function.
  it('refuses a path with no `compute`, or one it does not know, rather than calling it static', () => {
    const { compute: _dropped, ...noCompute } = prerendered('/a');
    assert.throws(() => readPrerender(withRoute(noCompute)), CheckError);
    assert.throws(() => readPrerender(withRoute(noCompute)), /`compute` undefined/);
    assert.throws(
      () => readPrerender(withRoute(prerendered('/a', { compute: 'partial' }))),
      /`compute` "partial"/,
    );
  });

  it('accepts each compute value Next 16 writes', () => {
    for (const compute of ['static', 'blocking', 'resuming']) {
      assert.doesNotThrow(() => readPrerender(withRoute(prerendered('/a', { compute }))));
    }
  });

  it('refuses a path with no `initialRevalidateSeconds`, or a value that is not false or seconds', () => {
    const { initialRevalidateSeconds: _dropped, ...noRevalidate } = prerendered('/a');
    assert.throws(() => readPrerender(withRoute(noRevalidate)), /`initialRevalidateSeconds`/);
    for (const initialRevalidateSeconds of [true, '60', -1, null]) {
      assert.throws(
        () => readPrerender(withRoute(prerendered('/a', { initialRevalidateSeconds }))),
        /`initialRevalidateSeconds`/,
      );
    }
  });

  it('refuses a path with no `srcRoute` key, and accepts null', () => {
    const { srcRoute: _dropped, ...noSrcRoute } = prerendered('/a');
    assert.throws(() => readPrerender(withRoute(noSrcRoute)), /`srcRoute`/);
    assert.doesNotThrow(() => readPrerender(withRoute(prerendered('/a', { srcRoute: null }))));
  });

  it('refuses a `routeType` it does not know', () => {
    assert.throws(
      () => readPrerender(withRoute(prerendered('/a', { routeType: 'shell' }))),
      /`routeType` "shell"/,
    );
  });

  it('refuses a dynamic route with no `fallback`', () => {
    assert.throws(
      () => readPrerender(JSON.stringify({ routes: {}, dynamicRoutes: { '/b/[x]': {} } })),
      /no `fallback`/,
    );
  });
});

describe('collectProblems', () => {
  it('passes a tree where every route is prerendered with its body', () => {
    const result = check();
    assert.deepEqual(result.problems, []);
    assert.equal(result.routes, Object.keys(APP_ROUTES).length);
    assert.equal(result.bodies, CLEAN_BODIES.length);
  });

  it('fails a handler that was not prerendered, naming it', () => {
    // What `app/llms-full.txt/route.ts` without `export const dynamic = 'force-static'` builds to:
    // an app route with no prerender entry, `ƒ` in the terminal table.
    const { problems } = check({
      appRoutes: { ...APP_ROUTES, '/llms-full.txt/route': '/llms-full.txt' },
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/llms-full\.txt: .*function/);
    assert.match(problems[0], /force-static/);
  });

  it('fails a page that was not prerendered', () => {
    const prerender = cleanPrerender();
    delete prerender.routes['/about'];
    const { problems } = check({
      prerender,
      bodies: CLEAN_BODIES.filter((b) => b !== 'about.html'),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/about: /);
  });

  it('fails a prerendered route whose body file is missing, naming the file', () => {
    const { problems } = check({ bodies: CLEAN_BODIES.filter((b) => b !== 'robots.txt.body') });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /server\/app\/robots\.txt\.body/);
  });

  it('fails a missing body of one instance of a dynamic route', () => {
    const { problems } = check({ bodies: CLEAN_BODIES.filter((b) => b !== 'work/b.html') });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/work\/b .*server\/app\/work\/b\.html/);
  });

  it('fails a missing JSON body of one case study, naming the file', () => {
    const { problems } = check({
      bodies: CLEAN_BODIES.filter((b) => b !== 'work/b/index.json.body'),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/work\/b\/index\.json .*server\/app\/work\/b\/index\.json\.body/);
  });

  it('fails a required handler built without force-static once, as a function', () => {
    // `app/case-studies.json/route.ts` without its `dynamic` export: in the app manifest, not
    // prerendered. The function finding names it; being required adds no second one.
    const prerender = cleanPrerender();
    delete prerender.routes['/case-studies.json'];
    const { problems } = check({
      prerender,
      bodies: CLEAN_BODIES.filter((b) => b !== 'case-studies.json.body'),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/case-studies\.json: .*function.*force-static/);
  });

  for (const route of ['/case-studies.json', '/feed.xml', '/work/[slug]/index.json']) {
    it(`fails a build without the required ${route}, naming it`, () => {
      const { problems } = check(without(route));
      assert.equal(problems.length, 1);
      assert.ok(problems[0].startsWith(`${route}: is in REQUIRED_ROUTES`), problems[0]);
      assert.match(problems[0], /no such route/);
    });
  }

  it('passes the same tree when nothing is required', () => {
    assert.deepEqual(check({ ...without('/case-studies.json'), required: [] }).problems, []);
  });

  it('fails a required dynamic route whose params produced no path', () => {
    // Passes the function check (fixed params, nothing on demand) but serves only 404s.
    const prerender = cleanPrerender();
    delete prerender.routes['/work/a/index.json'];
    delete prerender.routes['/work/b/index.json'];
    const { problems } = check({
      prerender,
      bodies: CLEAN_BODIES.filter((b) => !b.endsWith('/index.json.body')),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/work\/\[slug\]\/index\.json: .*REQUIRED_ROUTES.*no path/);
  });

  it('fails a required dynamic route that drops a param its page serves, naming the path', () => {
    // `/work/b` answers 200 while its JSON would be a 404: at least one path is not enough.
    const prerender = cleanPrerender();
    delete prerender.routes['/work/b/index.json'];
    const { problems } = check({
      prerender,
      bodies: CLEAN_BODIES.filter((b) => b !== 'work/b/index.json.body'),
    });
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^\/work\/\[slug\]\/index\.json: .*nothing for \/work\/b, which \/work\/\[slug\] serves/,
    );
  });

  it('fails a required dynamic route that prerenders a param its page does not serve', () => {
    const prerender = cleanPrerender();
    prerender.routes['/work/c/index.json'] = prerendered('/work/[slug]/index.json');
    const { problems } = check({ prerender, bodies: [...CLEAN_BODIES, 'work/c/index.json.body'] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/work\/\[slug\]\/index\.json: .*prerendered \/work\/c, which/);
  });

  it('fails a required route rebuilt as a page, which serves HTML', () => {
    const appRoutes = Object.fromEntries(
      Object.entries(APP_ROUTES).map(([entry, route]) =>
        route === '/case-studies.json' ? ['/case-studies.json/page', route] : [entry, route],
      ),
    );
    const { problems } = check({
      appRoutes,
      bodies: [
        ...CLEAN_BODIES.filter((b) => b !== 'case-studies.json.body'),
        'case-studies.json.html',
      ],
    });
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^\/case-studies\.json: .*REQUIRED_ROUTES.*a page, not a route handler/,
    );
  });

  it('fails a required route that is also allowlisted as a function, even with no path', () => {
    // The allowlist would accept its function finding, and the required check must not.
    const prerender = cleanPrerender();
    delete prerender.routes['/case-studies.json'];
    const { problems, functions } = check({
      prerender,
      bodies: CLEAN_BODIES.filter((b) => b !== 'case-studies.json.body'),
      allowed: ['/case-studies.json'],
    });
    assert.deepEqual(functions, ['/case-studies.json']);
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^\/case-studies\.json: .*both REQUIRED_ROUTES and ALLOWED_FUNCTIONS/,
    );
  });

  it('fails a dynamic route that renders unknown params on demand', () => {
    const prerender = cleanPrerender();
    prerender.dynamicRoutes['/work/[slug]'] = { fallback: null };
    const { problems } = check({ prerender });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/work\/\[slug\]: .*fallback/);
  });

  it('fails a route that revalidates, because revalidation runs in a function', () => {
    const prerender = cleanPrerender();
    prerender.routes['/about'] = prerendered('/about', { initialRevalidateSeconds: 3600 });
    const { problems } = check({ prerender });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/about .*3600/);
  });

  it('fails a route Next classified as needing compute to finish its response', () => {
    const prerender = cleanPrerender();
    prerender.routes['/'] = prerendered('/', { compute: 'resuming' });
    const { problems } = check({ prerender });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/ .*resuming/);
  });

  it('passes a dynamic route with fixed params and no instances', () => {
    // A `generateStaticParams` that returns nothing (a blog with no published post yet) builds no
    // page and no function: every URL under it is the static 404.
    const { problems } = check({
      appRoutes: { ...APP_ROUTES, '/blog/[slug]/page': '/blog/[slug]' },
      prerender: {
        ...cleanPrerender(),
        dynamicRoutes: { ...cleanPrerender().dynamicRoutes, '/blog/[slug]': { fallback: false } },
      },
    });
    assert.deepEqual(problems, []);
  });

  it('passes a function that is on the allowlist', () => {
    const { problems, functions } = check({
      appRoutes: { ...APP_ROUTES, '/mcp/route': '/mcp' },
      allowed: ['/mcp'],
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(functions, ['/mcp']);
  });

  it('fails an allowlisted route that was built static, since the list must be exact', () => {
    const { problems } = check({ allowed: ['/robots.txt'] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/robots\.txt: .*ALLOWED_FUNCTIONS/);
  });

  it('fails an allowlisted route the build does not have', () => {
    const { problems } = check({ allowed: ['/mcp'] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/mcp: .*ALLOWED_FUNCTIONS/);
  });

  it('passes the site as built, with ALLOWED_FUNCTIONS, reporting /mcp as its one function', () => {
    const { problems, functions } = check({ appRoutes: BUILT_ROUTES, allowed: ALLOWED_FUNCTIONS });
    assert.deepEqual(problems, []);
    assert.deepEqual(functions, ['/mcp']);
  });

  it('fails a second function beside /mcp under ALLOWED_FUNCTIONS, naming only the second', () => {
    const { problems, functions } = check({
      appRoutes: { ...BUILT_ROUTES, '/llms-full.txt/route': '/llms-full.txt' },
      allowed: ALLOWED_FUNCTIONS,
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/llms-full\.txt: .*function/);
    assert.deepEqual(functions, ['/mcp']);
  });

  it('fails a page that became a function beside /mcp under ALLOWED_FUNCTIONS', () => {
    const prerender = cleanPrerender();
    delete prerender.routes['/about'];
    const { problems } = check({
      appRoutes: BUILT_ROUTES,
      prerender,
      bodies: CLEAN_BODIES.filter((b) => b !== 'about.html'),
      allowed: ALLOWED_FUNCTIONS,
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/about: is not prerendered/);
  });

  it('fails a route that revalidates every 0 s too', () => {
    const prerender = cleanPrerender();
    prerender.routes['/about'] = prerendered('/about', { initialRevalidateSeconds: 0 });
    const { problems } = check({ prerender });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/about .*every 0 s/);
  });

  it('counts an allowlisted route that revalidates as a function, not as built static', () => {
    const prerender = cleanPrerender();
    prerender.routes['/about'] = prerendered('/about', { initialRevalidateSeconds: 60 });
    const { problems, functions } = check({ prerender, allowed: ['/about'] });
    assert.deepEqual(problems, []);
    assert.deepEqual(functions, ['/about']);
  });

  it('counts an allowlisted route that resumes in a function as one', () => {
    const prerender = cleanPrerender();
    prerender.routes['/about'] = prerendered('/about', { compute: 'resuming' });
    const { problems, functions } = check({ prerender, allowed: ['/about'] });
    assert.deepEqual(problems, []);
    assert.deepEqual(functions, ['/about']);
  });

  it('still requires the prerendered bodies of an allowlisted route', () => {
    const prerender = cleanPrerender();
    prerender.routes['/about'] = prerendered('/about', { initialRevalidateSeconds: 60 });
    const { problems } = check({
      prerender,
      allowed: ['/about'],
      bodies: CLEAN_BODIES.filter((b) => b !== 'about.html'),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/about .*server\/app\/about\.html/);
  });

  it('attributes a path whose `srcRoute` is null to the route of the same name', () => {
    // Earlier Next releases wrote null for a static route; 16.3.6 writes the path itself.
    const prerender = cleanPrerender();
    prerender.routes['/about'] = prerendered('/about', { srcRoute: null });
    assert.deepEqual(check({ prerender }).problems, []);
  });

  it('refuses a prerendered path that belongs to no App Router route', () => {
    const prerender = cleanPrerender();
    prerender.routes['/legacy'] = prerendered('/legacy', { srcRoute: null });
    assert.throws(() => check({ prerender }), /\/legacy is prerendered for \/legacy/);
  });

  it('refuses instances whose `srcRoute` names a route the app manifest does not have', () => {
    // A change in how Next writes `srcRoute` would otherwise leave every instance unclaimed and the
    // dynamic route, with no instance to check, passing.
    const prerender = cleanPrerender();
    prerender.routes['/work/a'] = prerendered('/work/:slug');
    assert.throws(() => check({ prerender }), /\/work\/a is prerendered for \/work\/:slug/);
  });

  it('refuses a dynamic route the app manifest does not have', () => {
    const prerender = cleanPrerender();
    prerender.dynamicRoutes['/blog/[slug]'] = { fallback: false };
    assert.throws(() => check({ prerender }), /dynamic route \/blog\/\[slug\] is not in/);
  });

  it('refuses a path whose `routeType` disagrees with its entry name', () => {
    const prerender = cleanPrerender();
    prerender.routes['/robots.txt'] = prerendered('/robots.txt', { routeType: 'page' });
    assert.throws(() => check({ prerender }), /\/robots\.txt is a "page".*\/robots\.txt\/route/);
  });
});

describe('the Atom feed (#61)', () => {
  // `app/feed.xml/route.ts` as `next build` writes it, part of the clean tree above: a static
  // handler whose body is `server/app/feed.xml.body`, prerendered even with no post published (an
  // empty feed). It is in REQUIRED_ROUTES, so a build without it fails with the other required
  // routes in `collectProblems`.
  const withoutBody = CLEAN_BODIES.filter((b) => b !== 'feed.xml.body');

  it('passes the feed prerendered with its body', () => {
    assert.ok(CLEAN_BODIES.includes('feed.xml.body'));
    assert.deepEqual(check().problems, []);
  });

  it('fails the feed without its body, naming server/app/feed.xml.body', () => {
    const { problems } = check({ bodies: withoutBody });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/feed\.xml \(\/feed\.xml\): .*server\/app\/feed\.xml\.body/);
  });

  it('fails the feed built without force-static once, as a function', () => {
    // The handler without `export const dynamic = 'force-static'`: in the app manifest, never
    // prerendered, so no body either. The function finding names it, and being required adds no
    // second one. The feed must not be on the allowlist (#62 adds only /mcp).
    const prerender = cleanPrerender();
    delete prerender.routes['/feed.xml'];
    const { problems } = check({ prerender, bodies: withoutBody });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/feed\.xml: .*function.*force-static/);
    assert.equal(ALLOWED_FUNCTIONS.includes('/feed.xml'), false);
  });
});

describe('collectOtherFunctions', () => {
  it('passes the four manifests of a function-free build', () => {
    assert.deepEqual(otherFunctions(), []);
  });

  it('fails a proxy.ts, which Next 16 records as the /_middleware function', () => {
    const problems = otherFunctions({
      functionsConfig: {
        version: 1,
        functions: { '/_middleware': { runtime: 'nodejs', matchers: [{ regexp: '^.*$' }] } },
      },
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^\/_middleware: a `proxy\.ts`/);
  });

  it('fails a function Next configured for a route, unless the route is allowlisted', () => {
    const functionsConfig = { version: 1, functions: { '/mcp': { maxDuration: 10 } } };
    assert.match(otherFunctions({ functionsConfig }).join('\n'), /^\/mcp: Next configured it/);
    assert.deepEqual(otherFunctions({ functionsConfig }, ['/mcp']), []);
  });

  it('fails Edge middleware and Edge functions', () => {
    const problems = otherFunctions({
      middleware: {
        version: 3,
        middleware: { '/': { name: 'middleware' } },
        sortedMiddleware: ['/'],
        functions: { '/edge': { name: 'edge' } },
      },
    });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /`middleware`/);
    assert.match(problems[1], /^\/edge: .*`functions`/);
  });

  it('fails a Server Action, which runs in a function even from a prerendered page', () => {
    const problems = otherFunctions({ serverReference: { node: { abc123: {} }, edge: {} } });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^1 Server Action \(.*`node`\)/);
  });

  it('fails a Pages Router entry other than the static 404 and 500 pages', () => {
    const problems = otherFunctions({
      pages: {
        '/404': 'pages/404.html',
        '/500': 'pages/500.js',
        '/api/hello': 'pages/api/hello.js',
      },
    });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^\/500: a Pages Router entry/);
    assert.match(problems[1], /^\/api\/hello: a Pages Router entry/);
  });

  it('refuses a manifest without the maps it reads', () => {
    assert.throws(() => otherFunctions({ functionsConfig: { version: 1 } }), /`functions` object/);
    assert.throws(() => otherFunctions({ middleware: { functions: {} } }), /`middleware` object/);
    assert.throws(() => otherFunctions({ serverReference: { node: {} } }), /`edge` object/);
    assert.throws(() => otherFunctions({ pages: { '/404': 1 } }), /\/404 is not a string/);
    assert.throws(() => otherFunctions({ pages: [] }), /not an object/);
  });
});

describe('ALLOWED_FUNCTIONS', () => {
  it('is exactly /mcp, the MCP server (#62): the one route on this site that runs per request', () => {
    assert.deepEqual([...ALLOWED_FUNCTIONS], ['/mcp']);
  });
});

describe('paramsSibling', () => {
  for (const [route, sibling] of [
    ['/work/[slug]/index.json', '/work/[slug]'],
    ['/work/[slug]/og-image.png', '/work/[slug]'],
    ['/a/[x]/b/[y]/c/d', '/a/[x]/b/[y]'],
    ['/work/[slug]', null],
    ['/case-studies.json', null],
    ['/', null],
  ]) {
    it(`gives ${JSON.stringify(sibling)} for ${route}`, () => {
      assert.equal(paramsSibling(/** @type {string} */ (route)), sibling);
    });
  }
});

describe('REQUIRED_ROUTES', () => {
  it('names the case-study JSON #60 serves and the feed #61 serves, and no function', () => {
    assert.deepEqual(
      [...REQUIRED_ROUTES],
      ['/case-studies.json', '/feed.xml', '/work/[slug]/index.json'],
    );
    assert.deepEqual(
      REQUIRED_ROUTES.filter((route) => ALLOWED_FUNCTIONS.includes(route)),
      [],
    );
  });
});

/**
 * Writes an artifact tree to a temporary directory: BUILD_ID, the six manifests and the body files.
 *
 * @param {{
 *   appRoutes?: Record<string, string> | string | null,
 *   prerender?: PrerenderManifest | string | null,
 *   other?: Partial<Record<keyof typeof CLEAN_OTHER, unknown>>,
 *   buildId?: string | null,
 *   bodies?: string[],
 * }} [tree]
 *   a string is written as the file's text as it is, and `null` leaves the file out
 */
function writeTree({
  appRoutes = BUILT_ROUTES,
  prerender = cleanPrerender(),
  other = {},
  buildId = 'test-build-id',
  bodies = CLEAN_BODIES,
} = {}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'build-output-')));
  const dist = join(root, '.next');
  mkdirSync(join(dist, 'server', 'app'), { recursive: true });
  /** @param {string} name @param {unknown} value */
  const manifest = (name, value) => {
    if (value === null) return;
    writeFileSync(join(dist, name), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const others = { ...CLEAN_OTHER, ...other };
  manifest('BUILD_ID', buildId);
  manifest('app-path-routes-manifest.json', appRoutes);
  manifest('prerender-manifest.json', prerender);
  manifest('server/functions-config-manifest.json', others.functionsConfig);
  manifest('server/middleware-manifest.json', others.middleware);
  manifest('server/server-reference-manifest.json', others.serverReference);
  manifest('server/pages-manifest.json', others.pages);
  for (const body of bodies) {
    const path = join(dist, 'server', 'app', body);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'body');
  }
  return { root, dist };
}

/**
 * Runs the command, with a deadline so that a child that hangs fails its test instead of holding
 * `pnpm test:scripts` until the CI job's own timeout.
 *
 * @param {string[]} args @param {string} [script]
 */
const run = (args, script = thisScript) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 30_000,
  });
  assert.equal(result.signal, null, `the command was killed (${result.signal}): ${result.stderr}`);
  return result;
};

describe('the command', () => {
  /** @param {Parameters<typeof writeTree>[0]} tree @param {(dist: string) => void} body */
  const withTree = (tree, body) => {
    const { root, dist } = writeTree(tree);
    try {
      body(dist);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('exits 0 on a clean tree and says what it checked, and which build', () => {
    withTree({}, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /11 routes, 13 prerendered bodies, server functions: \/mcp /);
      assert.match(result.stdout, /\(BUILD_ID test-build-id, written \d{4}-\d\d-\d\dT[\d:.]+Z\)/);
    });
  });

  it('exits 1 on a proxy.ts, which the App Router manifests do not show', () => {
    const functionsConfig = { version: 1, functions: { '/_middleware': { runtime: 'nodejs' } } };
    withTree({ other: { functionsConfig } }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\/_middleware: a `proxy\.ts`/);
    });
  });

  it('exits 1 on a Server Action', () => {
    withTree({ other: { serverReference: { node: { abc: {} }, edge: {} } } }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /1 Server Action/);
    });
  });

  it('exits 1 on a second function beside /mcp, naming only the second', () => {
    // #62's AC 10: the allowlist is one entry long, so a handler that forgot `force-static` fails
    // the build even though a function is now allowed.
    withTree(
      { appRoutes: { ...BUILT_ROUTES, '/llms-full.txt/route': '/llms-full.txt' } },
      (dist) => {
        const result = run([dist]);
        assert.equal(result.status, 1);
        const problems = result.stderr.split('\n').filter((line) => line.startsWith('  - '));
        assert.equal(problems.length, 1, result.stderr);
        assert.match(problems[0], /^ {2}- \/llms-full\.txt: .*function/);
      },
    );
  });

  it('exits 1 when a page route quietly became a function beside /mcp', () => {
    const prerender = cleanPrerender();
    delete prerender.routes['/about'];
    const bodies = CLEAN_BODIES.filter((b) => b !== 'about.html');
    withTree({ prerender, bodies }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\/about: is not prerendered/);
      assert.doesNotMatch(result.stderr, /- \/mcp/);
    });
  });

  it('exits 1 on a function Next configured for a route other than /mcp', () => {
    const functionsConfig = { version: 1, functions: { '/mcp': {}, '/about': {} } };
    withTree({ other: { functionsConfig } }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\/about: Next configured it/);
      assert.doesNotMatch(result.stderr, /- \/mcp/);
    });
  });

  it('exits 1 when the build has no /mcp, since the allowlist must be exact', () => {
    withTree({ appRoutes: APP_ROUTES }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\/mcp: is in ALLOWED_FUNCTIONS but the build has no such route/);
    });
  });

  it('exits 1 when a required route is gone, naming it', () => {
    const tree = without('/work/[slug]/index.json');
    withTree({ ...tree, appRoutes: { ...tree.appRoutes, '/mcp/route': '/mcp' } }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\/work\/\[slug\]\/index\.json: is in REQUIRED_ROUTES/);
      assert.doesNotMatch(result.stderr, /- \/mcp/);
    });
  });

  it('exits 1 on a missing body, naming the file', () => {
    withTree({ bodies: CLEAN_BODIES.filter((b) => b !== 'index.html') }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /server\/app\/index\.html/);
    });
  });

  for (const [label, tree, message] of [
    ['a missing routes manifest', { appRoutes: null }, /app-path-routes-manifest\.json/],
    ['a missing prerender manifest', { prerender: null }, /prerender-manifest\.json/],
    ['an unparseable routes manifest', { appRoutes: '{"/page": ' }, /not JSON/],
    [
      'an unparseable prerender manifest',
      { prerender: '{"routes":' },
      /prerender-manifest\.json is not JSON/,
    ],
    ['a prerender manifest that is not an object', { prerender: 'null' }, /not an object/],
    [
      'a prerender entry without `compute`',
      {
        prerender: {
          routes: { '/': { srcRoute: '/', initialRevalidateSeconds: false } },
          dynamicRoutes: {},
        },
      },
      /`compute` undefined/,
    ],
    [
      'a missing functions-config manifest',
      { other: { functionsConfig: null } },
      /functions-config-manifest\.json/,
    ],
    ['a missing middleware manifest', { other: { middleware: null } }, /middleware-manifest\.json/],
    [
      'a missing server-reference manifest',
      { other: { serverReference: null } },
      /server-reference-manifest\.json/,
    ],
    ['a missing pages manifest', { other: { pages: null } }, /pages-manifest\.json/],
    [
      'a tree with no BUILD_ID, not a finished build',
      { buildId: null },
      /no BUILD_ID.*pnpm --filter web build/,
    ],
    ['an empty BUILD_ID', { buildId: '\n' }, /BUILD_ID is empty/],
  ]) {
    it(`exits 2 on ${label}, with a message`, () => {
      withTree(/** @type {Parameters<typeof writeTree>[0]} */ (tree), (dist) => {
        const result = run([dist]);
        assert.equal(result.status, 2, result.stdout);
        assert.match(result.stderr, /could not run/);
        assert.match(result.stderr, /** @type {RegExp} */ (message));
      });
    });
  }

  it('exits 2 when there is no build at all, and says how to make one', () => {
    const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'build-output-')));
    try {
      const result = run([join(root, '.next')]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /pnpm --filter web build/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 2 when the build path is a file, not a directory', () => {
    withTree({}, (dist) => {
      const result = run([join(dist, 'BUILD_ID')]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /is not a directory/);
    });
  });

  it('exits 2 on more than one argument', () => {
    const result = run(['a', 'b']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage/);
  });

  it('exits 2 on an empty argument rather than checking the current directory', () => {
    // An unset shell variable passed through: `resolve('')` would be the working directory.
    const result = run(['']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage/);
  });

  // The entry guard, as check-allowbuilds-drift.test.mjs tests it: a script reached through a
  // symlinked directory once skipped main() and exited 0 having checked nothing.
  it('runs the check when started through a symlinked directory', () => {
    withTree({ bodies: [] }, (dist) => {
      const root = dirname(dist);
      symlinkSync(dirname(thisScript), join(root, 'linked-scripts'), 'dir');
      const result = run([dist], join(root, 'linked-scripts', 'check-build-output.mjs'));
      assert.equal(result.status, 1, 'a tree with no bodies must fail, via a symlink too');
    });
  });

  it('does not run the check when the module is imported rather than started', () => {
    const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'build-output-')));
    try {
      const importer = join(root, 'importer.mjs');
      writeFileSync(
        importer,
        `await import(${JSON.stringify(thisScript)});\nconsole.log('imported');\n`,
      );
      const result = run([], importer);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), 'imported');
      assert.equal(result.stderr, '');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('imports cleanly when the process was started from a path that no longer resolves', () => {
    // `realpathSync(process.argv[1])` throws ENOENT here; the guard must treat it as "not started".
    const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'build-output-')));
    try {
      const importer = join(root, 'importer.mjs');
      writeFileSync(
        importer,
        "import { rmSync } from 'node:fs';\n" +
          'rmSync(process.argv[1]);\n' +
          `await import(${JSON.stringify(thisScript)});\n` +
          "console.log('imported');\n",
      );
      const result = run([], importer);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), 'imported');
      assert.equal(result.stderr, '');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
