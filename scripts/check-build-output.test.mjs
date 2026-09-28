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
  bodyFile,
  collectProblems,
  readAppRoutes,
  readPrerender,
} from './check-build-output.mjs';

/** @typedef {import('./check-build-output.mjs').PrerenderManifest} PrerenderManifest */

const thisScript = join(dirname(fileURLToPath(import.meta.url)), 'check-build-output.mjs');

/**
 * `app-path-routes-manifest.json` for a small site shaped like this one: static pages, metadata
 * routes, a force-static handler, and a dynamic page and handler with fixed params (ADR 0015).
 */
const APP_ROUTES = {
  '/page': '/',
  '/_not-found/page': '/_not-found',
  '/about/page': '/about',
  '/robots.txt/route': '/robots.txt',
  '/opengraph-image/route': '/opengraph-image',
  '/work/[slug]/page': '/work/[slug]',
  '/work/[slug]/og-image.png/route': '/work/[slug]/og-image.png',
};

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

/** @returns {PrerenderManifest} the prerender manifest that matches `APP_ROUTES`, all static */
const cleanPrerender = () => ({
  routes: {
    '/': prerendered('/'),
    '/_not-found': prerendered('/_not-found', { initialStatus: 404 }),
    '/about': prerendered('/about'),
    '/robots.txt': prerendered('/robots.txt'),
    '/opengraph-image': prerendered('/opengraph-image'),
    '/work/a': prerendered('/work/[slug]'),
    '/work/b': prerendered('/work/[slug]'),
    '/work/a/og-image.png': prerendered('/work/[slug]/og-image.png'),
    '/work/b/og-image.png': prerendered('/work/[slug]/og-image.png'),
  },
  dynamicRoutes: {
    '/work/[slug]': { fallback: false },
    '/work/[slug]/og-image.png': { fallback: false },
  },
});

/** Every body file the clean tree above emits, relative to `server/app`. */
const CLEAN_BODIES = [
  'index.html',
  '_not-found.html',
  'about.html',
  'robots.txt.body',
  'opengraph-image.body',
  'work/a.html',
  'work/b.html',
  'work/a/og-image.png.body',
  'work/b/og-image.png.body',
];

/**
 * @param {{
 *   appRoutes?: Record<string, string>,
 *   prerender?: PrerenderManifest,
 *   bodies?: string[],
 *   allowed?: readonly string[],
 * }} [overrides]
 */
function check({
  appRoutes = APP_ROUTES,
  prerender = cleanPrerender(),
  bodies = CLEAN_BODIES,
  allowed = [],
} = {}) {
  const present = new Set(bodies);
  return collectProblems({
    appRoutes: readAppRoutes(JSON.stringify(appRoutes)),
    prerender: readPrerender(JSON.stringify(prerender)),
    allowed,
    hasBody: (file) => present.has(file),
  });
}

describe('bodyFile', () => {
  for (const [route, kind, file] of [
    ['/', 'page', 'index.html'],
    ['/about', 'page', 'about.html'],
    ['/work/a', 'page', 'work/a.html'],
    ['/robots.txt', 'route', 'robots.txt.body'],
    ['/work/a/og-image.png', 'route', 'work/a/og-image.png.body'],
    ['/index.md', 'route', 'index.md.body'],
    ['/about/index.md', 'route', 'about/index.md.body'],
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
  it('refuses a manifest with no `routes` or `dynamicRoutes` object', () => {
    assert.throws(() => readPrerender(JSON.stringify({ dynamicRoutes: {} })), /`routes`/);
    assert.throws(() => readPrerender(JSON.stringify({ routes: {} })), /`dynamicRoutes`/);
  });

  it('refuses a manifest that is not JSON', () => {
    assert.throws(() => readPrerender(''), /not JSON/);
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
});

describe('ALLOWED_FUNCTIONS', () => {
  it('is empty: nothing in this site needs a server function until #62 adds /mcp', () => {
    assert.deepEqual([...ALLOWED_FUNCTIONS], []);
  });
});

/**
 * Writes an artifact tree to a temporary directory: the two manifests and the body files.
 *
 * @param {{ appRoutes?: Record<string, string> | string | null, prerender?: PrerenderManifest | string | null, bodies?: string[] }} [tree]
 *   a string is written as the file's text as it is, and `null` leaves the file out
 */
function writeTree({
  appRoutes = APP_ROUTES,
  prerender = cleanPrerender(),
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
  manifest('app-path-routes-manifest.json', appRoutes);
  manifest('prerender-manifest.json', prerender);
  for (const body of bodies) {
    const path = join(dist, 'server', 'app', body);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'body');
  }
  return { root, dist };
}

/** @param {string[]} args @param {string} [script] */
const run = (args, script = thisScript) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env } });

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

  it('exits 0 on a clean tree and says what it checked', () => {
    withTree({}, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /7 routes, 9 prerendered bodies, no server function/);
    });
  });

  it('exits 1 on an unlisted function, naming the route', () => {
    withTree({ appRoutes: { ...APP_ROUTES, '/llms-full.txt/route': '/llms-full.txt' } }, (dist) => {
      const result = run([dist]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /\/llms-full\.txt/);
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
    ['an unparseable prerender manifest', { prerender: 'null' }, /not an object/],
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

  it('exits 2 on more than one argument', () => {
    const result = run(['a', 'b']);
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
});
