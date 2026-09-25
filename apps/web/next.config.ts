import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
// Its own module rather than a constant here, so that the Playwright spec proving the header on
// the wire can import it: Playwright loads TypeScript as CommonJS, where this file's
// `import.meta.url` is a syntax error.
import { PRODUCTION_ALIAS_HOST } from './production-alias';

/**
 * The nearest ancestor of `startDir` that holds a `pnpm-workspace.yaml`, or null if there is none.
 * Exported so `src/test/next-config.test.ts` can pin the behaviour this file depends on.
 */
export function findWorkspaceRoot(startDir: string): string | null {
  let dir = startDir;

  while (!existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }

  return dir;
}

// Next.js infers the workspace root from the OUTERMOST lockfile above the app, which is the wrong
// directory whenever one checkout sits below another that has a lockfile: a git worktree under
// .claude/worktrees/ gets built against the parent checkout. Searching upward for the workspace
// file takes the innermost match instead, which is always the checkout being built.
//
// Search rather than counting directories. Under Next's default loader this file is compiled to
// CommonJS and evaluated as <projectDir>/next.config.compiled.js, so import.meta.url reports the
// directory Next was invoked on, not this file. A fixed '..', '..' hop is therefore wrong whenever
// those differ, as they do for `next info` run from a subdirectory of the app.
const workspaceRoot = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));

/** The two variables the security headers depend on. `process.env` in the config itself. */
export type HeaderEnv = { NODE_ENV?: string; VERCEL_ENV?: string };

/**
 * Every path, `/` included: pages, prerendered case studies, `/_next/static` assets, metadata
 * routes, RSC payloads and the 404 all answer under it. `:path*` matches zero or more segments.
 * A few answers leave Next's router before it applies `headers()` and carry none of them: the 308s
 * that strip a trailing slash (`/about/`) or collapse repeated slashes (`//about`), and the plain
 * 500 for a malformed percent-encoding. No browser renders or frames either body (ADR 0023).
 */
export const SECURITY_HEADERS_SOURCE = '/:path*';

/** Where the Vercel Toolbar loads from, on preview deployments only. */
const VERCEL_LIVE = 'https://vercel.live';

/**
 * The Content-Security-Policy, as one header value. ADR 0023 records why each directive says what
 * it says; the short version:
 *
 * - `'unsafe-inline'` in `script-src` is unavoidable without a per-request token, which ADR 0017
 *   refuses because it would turn every static route into a request-time render: the App Router
 *   writes the RSC payload as inline scripts, and the root layout inlines the theme script that
 *   stops a flash of the wrong scheme. So this policy does not stop an injected inline script. Its
 *   value is `frame-ancestors`, `object-src`, `base-uri` and `form-action`, and limiting where
 *   scripts, styles, fonts, images and connections may come from to this origin.
 * - `'unsafe-inline'` in `style-src` covers the `style` attributes React renders (over a hundred
 *   on `/`). Every image, font, stylesheet, script and fetch the pages make is same-origin, so each
 *   of those directives is `'self'` alone: no `data:`, no `blob:`, no third party.
 * - `next dev` alone gets `'unsafe-eval'`, without which React's development build logs an eval
 *   error on every page, and `ws:` for the HMR socket. CSP Level 3 lets `'self'` match a
 *   same-origin `ws:` URL, and Chromium and WebKit do; `ws:` keeps HMR up in an engine that still
 *   applies Level 2's same-scheme rule. Both key on NODE_ENV=development, which `next dev` sets and
 *   `next build` defaults to production.
 * - A Vercel preview build alone allows the Vercel Toolbar, the origins Vercel's toolbar docs list.
 *   Previews sit behind Vercel Authentication, and promoting one to production rebuilds it with
 *   production variables, so no production response carries these.
 * - No `upgrade-insecure-requests`: the e2e suite serves plain http://localhost, and WebKit (the
 *   mobile-safari project) upgrades subresources there too, to an https:// that nothing answers;
 *   Chromium exempts localhost. HSTS covers production.
 */
export function contentSecurityPolicy({ NODE_ENV, VERCEL_ENV }: HeaderEnv): string {
  const dev = NODE_ENV === 'development';
  const toolbar = VERCEL_ENV === 'preview';
  const when = (on: boolean, ...sources: string[]) => (on ? sources : []);

  const directives: string[][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      "'unsafe-inline'",
      ...when(dev, "'unsafe-eval'"),
      ...when(toolbar, VERCEL_LIVE),
    ],
    ['style-src', "'self'", "'unsafe-inline'", ...when(toolbar, VERCEL_LIVE)],
    ['img-src', "'self'", ...when(toolbar, VERCEL_LIVE, 'https://vercel.com', 'data:', 'blob:')],
    ['font-src', "'self'", ...when(toolbar, VERCEL_LIVE, 'https://assets.vercel.com')],
    [
      'connect-src',
      "'self'",
      ...when(dev, 'ws:'),
      ...when(toolbar, VERCEL_LIVE, 'wss://ws-us3.pusher.com'),
    ],
    ...(toolbar ? [['frame-src', VERCEL_LIVE]] : []),
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];

  return directives.map((directive) => directive.join(' ')).join('; ');
}

/**
 * The Cross-Origin-Opener-Policy. `same-origin` gives the site a browsing context group of its own,
 * so a cross-origin page that opens it keeps no handle on its window. The site itself opens no
 * window that needs an opener: every external link is `rel="noopener noreferrer"`. A Vercel preview
 * build alone sends `same-origin-allow-popups`, so that a window the injected Toolbar opens, such as
 * a sign-in, keeps its opener; like the Toolbar's CSP origins, no production response carries it.
 */
export function crossOriginOpenerPolicy({ VERCEL_ENV }: HeaderEnv): string {
  return VERCEL_ENV === 'preview' ? 'same-origin-allow-popups' : 'same-origin';
}

/**
 * The six static security headers every page, asset and 404 carries (row R30 and live-8, #48).
 * HSTS is not among them: Vercel sets it on every production response, and over the plain HTTP the
 * e2e suite serves it means nothing.
 */
export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // The site is never framed. frame-ancestors says the same to every browser that reads CSP;
    // this is for the ones that do not.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(env) },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: crossOriginOpenerPolicy(env) },
  ];
}

/**
 * What the production alias alone sends on top of the security headers (ADR 0025): `noindex`, and
 * nothing more. Every page's canonical already names the apex, so a crawler that reaches the alias
 * is pointed at the copy to index as well as told not to index this one.
 */
export const PRODUCTION_ALIAS_HEADERS = [{ key: 'X-Robots-Tag', value: 'noindex' }];

const nextConfig: NextConfig = {
  // Outside a pnpm workspace there is no nested-lockfile problem to solve, so leave the root to
  // Next's own inference rather than failing the build or refusing to boot the server.
  ...(workspaceRoot ? { turbopack: { root: workspaceRoot } } : {}),
  // Playwright's local web server sets NEXT_DIST_DIR (apps/web/playwright.config.ts) so that the
  // `next dev` it starts never shares apps/web/.next with a `pnpm dev` running from this same
  // checkout: two dev servers writing one build directory race over the manifests and chunks.
  // Unset everywhere else, CI included, where `next build` and `next start` have to agree on it.
  // `||`, not `??`: an empty value (an unset variable expanded by a shell) must fall back too.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The security headers in one entry for every path, so no surface can be left out by a narrower
  // pattern (ADR 0023). The second entry adds `X-Robots-Tag: noindex` on every path of the
  // production alias and on no other host (ADR 0025). It is keyed on the alias being present,
  // never on the apex being absent (`missing`): a typo in an apex value would noindex production,
  // where a typo in the alias only fails to noindex the alias, which the check after the deploy in
  // ADR 0025 finds (the tests read the same constant, so they cannot).
  // `next build` evaluates this once and bakes the result into the routes manifest that
  // `next start` and Vercel serve from; `next dev` evaluates it with NODE_ENV=development.
  async headers() {
    return [
      { source: SECURITY_HEADERS_SOURCE, headers: securityHeaders(process.env) },
      {
        source: SECURITY_HEADERS_SOURCE,
        has: [{ type: 'host', value: PRODUCTION_ALIAS_HOST }],
        headers: PRODUCTION_ALIAS_HEADERS,
      },
    ];
  },
};

export default nextConfig;
