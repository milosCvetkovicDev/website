import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { request, type FullConfig } from '@playwright/test';

import { STATIC_PARAMS_ROUTES, warmUpPath } from './static-params-routes';

/**
 * Requests every route with `generateStaticParams` once, one at a time, before any worker starts,
 * so `next dev` has written them all into `prerender-manifest.json` before parallel traffic
 * arrives (#264). `playwright.config.ts` sets it for the dev server only: the production build CI
 * serves never writes the manifest.
 *
 * `next dev` (Next.js 16.3.8) adds such a route to that manifest on the route's first request with
 * a read, edit and plain `writeFile`, no lock and no rename (`next-dev-server.js:656-691`). Any
 * request that loads the manifest meanwhile can read it empty and answer 500 with
 * `SyntaxError: Unexpected end of JSON input` (vercel/next.js#96259), and parallel workers also
 * met 404s on the case studies' `index.md`, `index.json` and `og-image.png`. The step rewrites the
 * file only when its content changes, and one request records every slug of the route, so once
 * each route has been requested the file is no longer written. Measured on #182's five specs: 6 of
 * 10 dev-server runs failed on the race without this, none of 20 with it.
 *
 * Each request is for a slug no route serves (`WARM_UP_SLUG`), which must answer 404: the dev
 * server writes the static params before it can refuse the slug. Afterwards the manifest itself is
 * read back, so a Next.js upgrade that records static params elsewhere fails here, naming the
 * routes, instead of letting the race come back unnoticed. Playwright starts the web server before
 * global setup, so the server is up when this runs.
 */

/** How long one first request may take locally: a cold compile plus the static-params worker. */
const FIRST_REQUEST_TIMEOUT_MS = 30_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURLs = [...new Set(config.projects.map(({ use }) => use.baseURL))];
  const [baseURL] = baseURLs;
  if (baseURLs.length !== 1 || !baseURL) {
    throw new Error(
      `global setup warms one server, but the projects name ${baseURLs.length} base URLs: ${baseURLs.join(', ')}`,
    );
  }
  const distDir = config.webServer?.env?.NEXT_DIST_DIR;
  if (!distDir || !config.configFile) {
    throw new Error('global setup needs the webServer NEXT_DIST_DIR and the config file path.');
  }

  const context = await request.newContext({ baseURL });
  try {
    for (const pattern of STATIC_PARAMS_ROUTES) {
      const path = warmUpPath(pattern);
      const response = await context
        .get(path, { maxRedirects: 0, timeout: FIRST_REQUEST_TIMEOUT_MS })
        .catch((error: unknown) => {
          throw new Error(`global setup: GET ${path} failed`, { cause: error });
        });
      if (response.status() !== 404) {
        throw new Error(
          `global setup: GET ${path} answered ${response.status()}, not the 404 of an unknown slug`,
        );
      }
    }
  } finally {
    await context.dispose();
  }

  // `next dev` keeps its build under `<distDir>/dev`, beside the config (the server's cwd).
  const manifestPath = join(dirname(config.configFile), distDir, 'dev', 'prerender-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    dynamicRoutes?: Record<string, unknown>;
  };
  const missing = STATIC_PARAMS_ROUTES.filter((pattern) => !manifest.dynamicRoutes?.[pattern]);
  if (missing.length > 0) {
    throw new Error(
      `global setup: ${manifestPath} lacks ${missing.join(', ')} after the warm-up. Next.js no ` +
        'longer records static params there, so re-measure #264 before trusting a parallel run.',
    );
  }
}
