/**
 * These assertions read a configuration module and the filesystem and run git, with no DOM in
 * them, and building a jsdom window is the most expensive thing in a test file that does not need
 * one.
 *
 * @vitest-environment node
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getRewrittenUrl,
  isRewrite,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig, {
  ACCEPTS_MARKDOWN,
  contentSecurityPolicy,
  crossOriginOpenerPolicy,
  findWorkspaceRoot,
  MARKDOWN_ROUTES,
  markdownRewrites,
  PRODUCTION_ALIAS_HEADERS,
  SECURITY_HEADERS_SOURCE,
  securityHeaders,
  varyOnAccept,
  type HeaderEnv,
} from '../../next.config';
import { PRODUCTION_ALIAS_HOST } from '../../production-alias';
import { caseStudies } from '../data/case-studies';
import { STATIC_ROUTE_UPDATED } from '../data/static-routes';
import { markdownTwinPath } from '../lib/pathname';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, '../..');
const repoRoot = path.resolve(appDir, '../..');

/** Every temp tree this file builds, removed in afterAll so a run leaves the OS temp dir as is. */
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Loads next.config.ts fresh under the current environment. The module reads variables such as
 * VERCEL_ENV and NEXT_DIST_DIR from `process.env` while it is evaluated, so each case that stubs
 * one needs its own module instance.
 */
async function loadFreshConfig() {
  vi.resetModules();
  return (await import('../../next.config')).default;
}

describe('findWorkspaceRoot', () => {
  it('finds the repository root from the app directory', () => {
    expect(findWorkspaceRoot(appDir)).toBe(repoRoot);
  });

  // Next's default loader evaluates the config as <projectDir>/next.config.compiled.js, so the
  // starting directory is whatever Next was invoked on. `next info` run from a subdirectory of the
  // app used to resolve two levels up from there and land outside the repository.
  it('finds the repository root from a subdirectory of the app', () => {
    expect(findWorkspaceRoot(path.join(appDir, 'src'))).toBe(repoRoot);
    expect(findWorkspaceRoot(testDir)).toBe(repoRoot);
  });

  it('finds the repository root from the repository root itself', () => {
    expect(findWorkspaceRoot(repoRoot)).toBe(repoRoot);
  });

  it('takes the innermost workspace when checkouts are nested, as in a git worktree', () => {
    const outer = makeTempDir('workspace-root-');
    const inner = path.join(outer, '.claude', 'worktrees', 'nested');
    const innerApp = path.join(inner, 'apps', 'web');
    mkdirSync(innerApp, { recursive: true });
    writeFileSync(path.join(outer, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(path.join(inner, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");

    expect(findWorkspaceRoot(innerApp)).toBe(inner);
    expect(findWorkspaceRoot(path.join(innerApp, 'src'))).toBe(inner);
  });

  it('returns null when no workspace file is above the starting directory', () => {
    const orphan = makeTempDir('no-workspace-');
    // The walk stops at the filesystem root, so the null case means something only while no
    // ancestor of the OS temp directory holds a workspace file. Assert that rather than assume it.
    for (let dir = orphan; ; dir = path.dirname(dir)) {
      expect(
        existsSync(path.join(dir, 'pnpm-workspace.yaml')),
        `${dir} holds a pnpm-workspace.yaml, so ${orphan} is not workspace-free`,
      ).toBe(false);
      if (path.dirname(dir) === dir) break;
    }

    expect(findWorkspaceRoot(orphan)).toBeNull();
  });
});

// Row R30 of the e2e RED manifest (#48), and ADR 0023. The e2e spec proves the headers reach a
// page, a prerendered case study, a static chunk and a 404 under both servers; these tests pin the
// values, so a loosened policy fails here before it ships.
describe('security headers', () => {
  const production: HeaderEnv = { NODE_ENV: 'production' };
  const development: HeaderEnv = { NODE_ENV: 'development' };
  const preview: HeaderEnv = { NODE_ENV: 'production', VERCEL_ENV: 'preview' };
  const vercelProduction: HeaderEnv = { NODE_ENV: 'production', VERCEL_ENV: 'production' };
  const everyEnv = { production, development, preview, vercelProduction };

  /** A policy as a map of directive to its sources, so a test can name the directive it means. */
  const directivesOf = (env: HeaderEnv) =>
    new Map(
      contentSecurityPolicy(env)
        .split('; ')
        .map((directive) => {
          const [name, ...sources] = directive.split(' ');
          return [name, sources] as const;
        }),
    );

  const PRODUCTION_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends exactly the six static headers, with these values', () => {
    expect(securityHeaders(production)).toEqual([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Content-Security-Policy', value: PRODUCTION_POLICY },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ]);
  });

  // live-8 and AC 14 of #48, re-checked live by #52: COOP same-origin on every surface. A preview
  // build alone lets the windows the injected Vercel Toolbar opens keep their opener.
  it('sends COOP same-origin everywhere but a preview build', () => {
    for (const env of [production, development, vercelProduction, {}]) {
      expect(crossOriginOpenerPolicy(env)).toBe('same-origin');
      expect(securityHeaders(env)).toContainEqual({
        key: 'Cross-Origin-Opener-Policy',
        value: 'same-origin',
      });
    }
    expect(crossOriginOpenerPolicy(preview)).toBe('same-origin-allow-popups');
    expect(securityHeaders(preview)).toContainEqual({
      key: 'Cross-Origin-Opener-Policy',
      value: 'same-origin-allow-popups',
    });
  });

  it('serves the production policy on Vercel production exactly as under next start', () => {
    expect(contentSecurityPolicy(vercelProduction)).toBe(PRODUCTION_POLICY);
    expect(contentSecurityPolicy({})).toBe(PRODUCTION_POLICY);
    // Vitest itself runs with NODE_ENV=test, which is not development.
    expect(contentSecurityPolicy({ NODE_ENV: 'test' })).toBe(PRODUCTION_POLICY);
  });

  it('declares the security headers in one entry whose source covers every path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');

    // `:path*` is zero or more segments, so `/` matches as well as `/_next/static/...` and any 404.
    // `/(.*)` would do the same; a narrower pattern is how a surface gets left out, and the e2e
    // spec (e2e/security-headers.spec.ts) is what proves all four surfaces under both servers.
    // The second entry is the production alias's noindex (ADR 0025), and the entries after it
    // send `Vary: Accept` on the routes that negotiate a Markdown twin (#59); both pinned below.
    expect(SECURITY_HEADERS_SOURCE).toBe('/:path*');
    const [security, alias, ...rest] = (await nextConfig.headers?.()) ?? [];
    expect(security).toEqual({
      source: SECURITY_HEADERS_SOURCE,
      headers: securityHeaders(production),
    });
    expect(alias?.has).toEqual([{ type: 'host', value: PRODUCTION_ALIAS_HOST }]);
    expect(rest).toEqual(varyOnAccept());
  });

  it('reads the environment when Next calls headers(), not when the config loads', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    const [entry] = (await nextConfig.headers?.()) ?? [];
    const csp = entry?.headers.find(({ key }) => key === 'Content-Security-Policy')?.value;
    expect(csp).toBe(contentSecurityPolicy(development));
  });

  it("relaxes the policy for next dev only: 'unsafe-eval' and ws: for HMR", () => {
    const dev = directivesOf(development);
    expect(dev.get('script-src')).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    expect(dev.get('connect-src')).toEqual(["'self'", 'ws:']);

    // Everything else is the production policy, word for word.
    const withoutRelaxations = contentSecurityPolicy(development)
      .replace(" 'unsafe-eval'", '')
      .replace(' ws:', '');
    expect(withoutRelaxations).toBe(PRODUCTION_POLICY);

    for (const env of [production, preview, vercelProduction]) {
      expect(contentSecurityPolicy(env)).not.toContain("'unsafe-eval'");
      expect(directivesOf(env).get('connect-src')).not.toContain('ws:');
    }
  });

  it('allows the Vercel Toolbar on a preview build and nowhere else', () => {
    const toolbar = directivesOf(preview);
    expect(toolbar.get('script-src')).toEqual(["'self'", "'unsafe-inline'", 'https://vercel.live']);
    expect(toolbar.get('style-src')).toEqual(["'self'", "'unsafe-inline'", 'https://vercel.live']);
    expect(toolbar.get('img-src')).toEqual([
      "'self'",
      'https://vercel.live',
      'https://vercel.com',
      'data:',
      'blob:',
    ]);
    expect(toolbar.get('font-src')).toEqual([
      "'self'",
      'https://vercel.live',
      'https://assets.vercel.com',
    ]);
    expect(toolbar.get('connect-src')).toEqual([
      "'self'",
      'https://vercel.live',
      'wss://ws-us3.pusher.com',
    ]);
    expect(toolbar.get('frame-src')).toEqual(['https://vercel.live']);
    // Framing the site, plugins, <base> and form targets stay as strict as production.
    for (const directive of ['frame-ancestors', 'object-src', 'base-uri', 'form-action']) {
      expect(toolbar.get(directive), directive).toEqual(directivesOf(production).get(directive));
    }

    for (const env of [production, development, vercelProduction]) {
      expect(contentSecurityPolicy(env)).not.toMatch(/vercel|pusher/);
      expect(directivesOf(env).has('frame-src')).toBe(false);
    }
  });

  it('never frames the site, in any environment', () => {
    for (const [name, env] of Object.entries(everyEnv)) {
      expect(directivesOf(env).get('frame-ancestors'), name).toEqual(["'none'"]);
      expect(securityHeaders(env), name).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' });
    }
  });

  // ADR 0017 refuses a per-request token in the CSP (scripts/ai-refusals.test.mjs fails on the word
  // in next.config.ts), and upgrade-insecure-requests would break every subresource on the plain
  // http://localhost the e2e suite serves.
  it('carries no nonce, no upgrade-insecure-requests and no HSTS, in any environment', () => {
    for (const [name, env] of Object.entries(everyEnv)) {
      const values = securityHeaders(env).map(({ key, value }) => `${key}: ${value}`);
      expect(values.join('\n'), name).not.toMatch(
        /nonce|upgrade-insecure-requests|strict-dynamic/i,
      );
      expect(
        securityHeaders(env).map(({ key }) => key.toLowerCase()),
        name,
      ).not.toContain('strict-transport-security');
    }
  });

  it('writes a policy with no empty or repeated directive', () => {
    for (const [name, env] of Object.entries(everyEnv)) {
      const names = contentSecurityPolicy(env)
        .split('; ')
        .map((directive) => directive.split(' ')[0]);
      expect(new Set(names).size, name).toBe(names.length);
      for (const [directive, sources] of directivesOf(env)) {
        expect(sources.length, `${name} ${directive}`).toBeGreaterThan(0);
        // 'none' is ignored, with a console warning, when anything else shares its directive.
        if (sources.includes("'none'")) expect(sources, `${name} ${directive}`).toHaveLength(1);
      }
    }
  });
});

// live-3 and pages-7 (#48), #52's AC 18, and ADR 0025. The public production alias serves the same
// bytes as the apex, so it answers `X-Robots-Tag: noindex`, and no other host may. The e2e spec
// (e2e/production-alias.spec.ts) proves the header on four surfaces under both servers; these pin
// the entry, and run it through Next's own route matcher.
describe('the production alias', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const entries = async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    return (await nextConfig.headers?.()) ?? [];
  };

  it('is a bare vercel.app host name, and not the apex', () => {
    // No scheme, port, path or capital letter: Next compares the value with the request's host,
    // lower-cased and without its port, as an anchored regular expression.
    expect(PRODUCTION_ALIAS_HOST).toMatch(/^[a-z0-9-]+\.vercel\.app$/);
    expect(PRODUCTION_ALIAS_HOST).not.toContain('miloscvetkovic');
  });

  it('declares a second entry: every path, keyed on the alias host, sending noindex alone', async () => {
    const [, alias] = await entries();
    expect(alias).toEqual({
      source: SECURITY_HEADERS_SOURCE,
      has: [{ type: 'host', value: PRODUCTION_ALIAS_HOST }],
      headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
    });
    expect(PRODUCTION_ALIAS_HEADERS).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }]);
  });

  // A rule keyed on the apex being absent would noindex production the day that value had a typo,
  // or the day a new host (www, a second custom domain) answered for the site.
  it('keys no entry on a missing condition', async () => {
    for (const entry of await entries()) {
      expect(entry, entry.source).not.toHaveProperty('missing');
    }
  });

  it('leaves the six ADR 0023 headers as they were, on every host', async () => {
    const [security, alias] = await entries();
    expect(security).not.toHaveProperty('has');
    expect(security?.headers).toEqual(securityHeaders({ NODE_ENV: 'production' }));
    expect(security?.headers.map(({ key }) => key.toLowerCase())).not.toContain('x-robots-tag');
    // The alias entry adds a header and overrides none of the six: a later entry that sets the
    // same key wins, so a shared key here would change the security headers on the alias.
    const securityKeys = new Set(security?.headers.map(({ key }) => key.toLowerCase()));
    for (const { key } of alias?.headers ?? [])
      expect(securityKeys.has(key.toLowerCase())).toBe(false);
  });

  // Next's own matcher (the one `next start` uses) on the config as declared, so the regular
  // expression semantics of a `has` value, and the port that the matcher strips, are exercised
  // rather than assumed.
  it("sends noindex to the alias host alone, through Next's route matcher", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    const robotsTag = async (url: string) =>
      (await unstable_getResponseFromNextConfig({ url, nextConfig })).headers.get('x-robots-tag');

    for (const path of ['/', '/about', '/work/self-healing-agent', '/_next/static/x.js', '/nope']) {
      expect(await robotsTag(`https://${PRODUCTION_ALIAS_HOST}${path}`), path).toBe('noindex');
      expect(await robotsTag(`http://${PRODUCTION_ALIAS_HOST}:3000${path}`), path).toBe('noindex');
      for (const host of ['miloscvetkovic.dev', 'www.miloscvetkovic.dev', 'localhost:3210']) {
        expect(await robotsTag(`https://${host}${path}`), `${host}${path}`).toBeNull();
      }
    }
    // Anchored: a host that merely contains the alias, or that the alias merely prefixes, misses.
    expect(await robotsTag(`https://x${PRODUCTION_ALIAS_HOST}/`)).toBeNull();
    expect(await robotsTag(`https://${PRODUCTION_ALIAS_HOST}.example/`)).toBeNull();
  });
});

// AC 15 of #59, and ADR 0030. A request for a page that asks for Markdown is rewritten to the
// page's twin before Next looks at the filesystem, so both representations are prerendered and
// no function is added. `e2e/markdown-negotiation.spec.ts` proves it on the wire; these pin the
// rules and run them through Next's own matcher.
describe('markdown negotiation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** What Next's matcher does with one request: the rewritten path, or null, and its headers. */
  const negotiate = async (path: string, accept?: string) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    const response = await unstable_getResponseFromNextConfig({
      url: `https://miloscvetkovic.dev${path}`,
      nextConfig,
      headers: accept === undefined ? {} : { accept },
    });
    const rewritten = isRewrite(response) ? getRewrittenUrl(response) : null;
    return {
      to: rewritten === null ? null : new URL(rewritten).pathname,
      headers: response.headers,
    };
  };

  // What the clients acceptmarkdown.com lists send, and what a browser and a bare fetch send.
  const MARKDOWN_ACCEPTS = [
    'text/markdown',
    'text/markdown, */*',
    'text/markdown, text/html, */*',
    'text/html;q=0.9, text/markdown',
  ];
  const OTHER_ACCEPTS = [
    undefined,
    '*/*',
    'text/html',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'text/plain',
    'application/json',
  ];

  const handlerRoutes = () => {
    // Every `index.md/route.ts` under src/app, as the route whose twin it serves.
    const found: string[] = [];
    const walk = (dir: string, route: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(dir, entry.name);
        if (entry.name === 'index.md') {
          if (existsSync(path.join(child, 'route.ts'))) found.push(route || '/');
        } else if (!entry.name.startsWith('(') && !entry.name.startsWith('_')) {
          walk(child, `${route}/${entry.name}`);
        }
      }
    };
    walk(path.join(appDir, 'src/app'), '');
    return found.flatMap((route) =>
      route === '/work/[slug]' ? caseStudies.map(({ slug }) => `/work/${slug}`) : [route],
    );
  };

  it('negotiates exactly the routes that have a twin: the static routes and every case study', () => {
    expect(MARKDOWN_ROUTES).toEqual([
      ...Object.keys(STATIC_ROUTE_UPDATED),
      ...caseStudies.map(({ slug }) => `/work/${slug}`),
    ]);
    expect(MARKDOWN_ROUTES).toContain('/');
    expect(new Set(MARKDOWN_ROUTES).size).toBe(MARKDOWN_ROUTES.length);
    // Both ways: a twin without a rule is never negotiated, and a rule without a twin 404s.
    expect([...MARKDOWN_ROUTES].sort()).toEqual(handlerRoutes().sort());
  });

  it('declares one beforeFiles rewrite per route, and nothing broader', async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual({ beforeFiles: markdownRewrites(), afterFiles: [], fallback: [] });
    expect(markdownRewrites()).toEqual(
      MARKDOWN_ROUTES.map((route) => ({
        source: route,
        has: [{ type: 'header', key: 'accept', value: '.*text/markdown.*' }],
        destination: markdownTwinPath(route),
      })),
    );
    // A literal path each, never a parameter or a wildcard such as `/:path*`: a broad source would
    // also rewrite a Markdown-asking request for a path that exists without a twin (`robots.txt`,
    // the sitemap, an Open Graph image, a `/_next/static` chunk) to an `index.md` that does not.
    for (const { source } of markdownRewrites()) expect(source).not.toMatch(/[:*()?+]/);
  });

  it("serves each route's twin to a request that asks for Markdown, through Next's matcher", async () => {
    for (const route of MARKDOWN_ROUTES) {
      for (const accept of MARKDOWN_ACCEPTS) {
        expect((await negotiate(route, accept)).to, `${route} [${accept}]`).toBe(
          markdownTwinPath(route),
        );
      }
    }
    expect((await negotiate('/', 'text/markdown, */*')).to).toBe('/index.md');
    expect((await negotiate('/about', 'text/markdown, */*')).to).toBe('/about/index.md');
  });

  it('serves the page to every other request', async () => {
    for (const route of MARKDOWN_ROUTES) {
      for (const accept of OTHER_ACCEPTS) {
        expect((await negotiate(route, accept)).to, `${route} [${accept}]`).toBeNull();
      }
    }
  });

  it('rewrites nothing that has no twin, the twins themselves included', async () => {
    const chunk = '/_next/static/chunks/app.js';
    for (const path of [
      '/nope',
      '/work/does-not-exist',
      '/about/team',
      chunk,
      '/robots.txt',
      '/sitemap.xml',
      '/index.md',
      '/about/index.md',
      markdownTwinPath(`/work/${caseStudies[0]?.slug}`),
    ]) {
      expect((await negotiate(path, 'text/markdown, */*')).to, path).toBeNull();
    }
  });

  // Recorded, not fixed (ADR 0030): Next's `has` value is an anchored, case-sensitive regular
  // expression over the raw header, so a q-value is never read. Ranking by q-value would need a
  // function in front of every page, which ADR 0017 refuses.
  it('reads no q-value and matches the media type case-sensitively', async () => {
    expect(ACCEPTS_MARKDOWN.value).toBe('.*text/markdown.*');
    expect((await negotiate('/about', 'text/markdown;q=0, text/html')).to).toBe('/about/index.md');
    expect((await negotiate('/about', 'Text/Markdown')).to).toBeNull();
  });

  it('sends Vary: Accept on each route and its twin, whatever was asked for', async () => {
    expect(varyOnAccept()).toEqual(
      MARKDOWN_ROUTES.flatMap((route) =>
        [route, markdownTwinPath(route)].map((source) => ({
          source,
          headers: [{ key: 'Vary', value: 'Accept' }],
        })),
      ),
    );
    for (const route of MARKDOWN_ROUTES) {
      for (const path of [route, markdownTwinPath(route)]) {
        for (const accept of ['text/markdown, */*', 'text/html']) {
          const { headers } = await negotiate(path, accept);
          expect(headers.get('vary'), `${path} [${accept}]`).toBe('Accept');
          // The security headers still reach the negotiated response.
          expect(headers.get('x-content-type-options'), path).toBe('nosniff');
        }
      }
    }
    for (const path of ['/nope', '/work/does-not-exist', '/_next/static/chunks/app.js']) {
      expect((await negotiate(path, 'text/markdown')).headers.get('vary'), path).toBeNull();
    }
  });

  // Vitest resolves `@/` for every module it loads; Next's config loader turns it into `./src/...`
  // in every module, a path that is right only beside `next.config.ts`, so an alias in a module the
  // config reaches passes every test above and fails `next build`. This loads the file the way `next build` does, in a
  // child process because the loader rewrites `require.extensions`, and compares the result.
  it("loads through Next's own config loader to the same rules", async () => {
    const script = [
      "const { transpileConfig } = require('next/dist/build/next-config-ts/transpile-config');",
      "const path = require('node:path');",
      "transpileConfig({ nextConfigPath: path.resolve('next.config.ts'), dir: process.cwd() })",
      // The CommonJS module the loader compiles the file to, whose default export is the config.
      '  .then(async ({ default: config }) => {',
      '    const headers = await config.headers();',
      '    process.stdout.write(JSON.stringify({ rewrites: await config.rewrites(), vary: headers.slice(2) }));',
      '  })',
      '  .catch((error) => { console.error(error); process.exit(1); });',
    ].join('\n');
    let output: string;
    try {
      output = execFileSync(process.execPath, ['-e', script], {
        cwd: appDir,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'production' },
        timeout: 30_000,
      });
    } catch (error) {
      throw new Error(
        "next.config.ts does not load through Next's config loader: is there an `@/` import in a module it reaches?",
        { cause: error },
      );
    }
    expect(JSON.parse(output)).toEqual({
      rewrites: await nextConfig.rewrites?.(),
      vary: varyOnAccept(),
    });
  }, 40_000);
});

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('inlines VERCEL_ENV, so the client-side global error page gates analytics like the layout', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await loadFreshConfig()).env).toEqual({ VERCEL_ENV: 'production' });
  });

  it('inlines an empty string when VERCEL_ENV is unset, which the gate reads as off', async () => {
    vi.stubEnv('VERCEL_ENV', undefined);
    expect((await loadFreshConfig()).env).toEqual({ VERCEL_ENV: '' });
  });
});

describe('agent instruction files', () => {
  // `next dev` writes apps/web/AGENTS.md and apps/web/CLAUDE.md when @vercel/detect-agent finds
  // an agent shell, and Claude Code then loads the nested CLAUDE.md as project instructions.
  // Generation is off (ADR 0019).
  it('disables the agent instruction files Next would write in dev', () => {
    expect(nextConfig.agentRules).toBe(false);
  });

  // A pair written before ADR 0019 stays behind, untracked, until someone deletes it. This check
  // cannot stop a `git add -A` from committing it, but it fails the unit suite, and so CI, on any
  // branch that tracks either file. Ignoring the pair instead would only hide it: Claude Code
  // loads an ignored CLAUDE.md all the same.
  it('tracks neither generated file', () => {
    let tracked: string;
    try {
      tracked = execFileSync('git', ['ls-files', '--', 'AGENTS.md', 'CLAUDE.md'], {
        cwd: appDir,
        encoding: 'utf8',
        timeout: 4000,
      });
    } catch (error) {
      throw new Error(
        'This check runs `git ls-files` and needs git and a clone of the repository',
        {
          cause: error,
        },
      );
    }
    expect(tracked).toBe('');
  });
});

// The value above matters only while the installed Next.js still reads it. A Next.js that
// dropped the option would fail `pnpm typecheck` on the typed config object, but one that kept
// the option and stopped passing it to the dev server, or stopped checking it, would not, and
// generation would resume unnoticed. These read the compiled dev server, in both module formats
// Next.js ships, to catch that. When one fails after a Next.js bump, find where the new version
// decides to write the files, check ADR 0019 against it, and then update the patterns.
describe('the installed Next.js honours agentRules', () => {
  const nextDir = path.dirname(createRequire(import.meta.url).resolve('next/package.json'));
  const readNext = (file: string) => {
    try {
      return readFileSync(path.join(nextDir, file), 'utf8');
    } catch (error) {
      throw new Error(
        `next/${file} could not be read: find where this Next.js writes AGENTS.md and CLAUDE.md and check ADR 0019 against it`,
        { cause: error },
      );
    }
  };
  const serverLibs = ['dist/server/lib', 'dist/esm/server/lib'];
  // Call sites only: the name followed by `(`, or by `)(` as in the CommonJS build's
  // `(0, _mod.name)(...)`, and never the function's own declaration.
  const callSites = (source: string, name: string) => [
    ...source.matchAll(new RegExp(`(?<!function\\s+)\\b${name}\\)?\\s*\\(`, 'g')),
  ];
  // The object literal whose `{` sits at `open`, found by counting braces.
  const objectLiteral = (source: string, open: number) => {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    return '';
  };

  it('returns agentRules from the config in the object initialize hands the dev server', () => {
    for (const lib of serverLibs) {
      const source = readNext(`${lib}/router-server.js`);
      const start = source.search(/\basync function initialize\(/);
      expect(start, lib).toBeGreaterThanOrEqual(0);
      const rest = source.slice(start + 1);
      const end = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s/);
      const body = end < 0 ? rest : rest.slice(0, end);
      const returned = body.lastIndexOf('return {');
      expect(returned, lib).toBeGreaterThanOrEqual(0);
      expect(objectLiteral(body, returned + 'return '.length), lib).toMatch(
        /\bagentRules:\s*config\.agentRules\b/,
      );
    }
  });

  it('generates the agent files only as the first statement of an agentRules !== false block', () => {
    for (const lib of serverLibs) {
      const source = readNext(`${lib}/start-server.js`);
      // getRequestHandlers hands back what the router server's initialize returns.
      expect(source, lib).toMatch(
        /async function getRequestHandlers\([^)]*\)\s*\{\s*return\s+(?:\(0,\s*[\w$]+\.)?initialize\)?\(/,
      );
      const calls = callSites(source, 'ensureAgentRulesForDev');
      expect(calls.length, lib).toBeGreaterThan(0);
      for (const call of calls) {
        const guard = source
          .slice(0, call.index)
          .match(
            /if\s*\(\s*([\w$]+)\.agentRules\s*!==\s*false\s*\)\s*\{\s*(?:(?:const|let|var)\s+[\w$]+\s*=\s*)?(?:await\s+)?(?:\(0,\s*[\w$]+\.)?$/,
          );
        expect(guard, lib).not.toBeNull();
        expect(source, lib).toContain(`const ${guard?.[1]} = await getRequestHandlers(`);
      }
    }
  });

  it('writes the files only from ensureAgentRulesForDev', () => {
    for (const lib of serverLibs) {
      expect(readNext(`${lib}/app-info-log.js`), lib).toMatch(
        /async function ensureAgentRulesForDev\([^)]*\)\s*\{[^}]*\bwriteAgentFiles\)?\s*\(/,
      );
    }
  });

  // A second caller anywhere else in Next.js would bypass the gate above. dist/compiled holds
  // vendored, minified third-party bundles and dist/docs holds Markdown, so neither is read. The
  // walk reads about 2,700 files, just under a second at a load average of 90, so it takes a
  // longer timeout than the 5s default rather than failing on a busy machine.
  it('calls the generator from nowhere else in Next.js', () => {
    const found: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(nextDir, dir), { withFileTypes: true })) {
        const file = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (file !== 'dist/compiled' && file !== 'dist/docs') walk(file);
        } else if (/\.[cm]?js$/.test(entry.name)) {
          const source = readNext(file);
          for (const name of ['ensureAgentRulesForDev', 'writeAgentFiles']) {
            const count = source.includes(name) ? callSites(source, name).length : 0;
            if (count > 0) found[`${file} ${name}`] = count;
          }
        }
      }
    };
    walk('dist');
    expect(found).toEqual({
      'dist/esm/server/lib/app-info-log.js writeAgentFiles': 1,
      'dist/esm/server/lib/start-server.js ensureAgentRulesForDev': 1,
      'dist/server/lib/app-info-log.js writeAgentFiles': 1,
      'dist/server/lib/start-server.js ensureAgentRulesForDev': 1,
    });
  }, 20_000);

  // The root CLAUDE.md points agents at these docs in place of the generated AGENTS.md.
  it('ships the version-matched docs the root CLAUDE.md points agents at', () => {
    expect(statSync(path.join(nextDir, 'dist/docs')).isDirectory()).toBe(true);
    expect(readNext('dist/docs/01-app/02-guides/ai-agents.md')).toMatch(/\bagentRules: false\b/);
  });
});

describe('distDir', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is .next when NEXT_DIST_DIR is unset, as when Playwright did not start Next', async () => {
    vi.stubEnv('NEXT_DIST_DIR', undefined);
    expect((await loadFreshConfig()).distDir).toBe('.next');
  });

  // `||`, not `??`: a shell that expands an unset variable into the environment hands Next an
  // empty string, which is not a usable distDir and must fall back the way an absent one does.
  it('falls back to .next when NEXT_DIST_DIR is present but empty', async () => {
    vi.stubEnv('NEXT_DIST_DIR', '');
    expect((await loadFreshConfig()).distDir).toBe('.next');
  });

  it("takes NEXT_DIST_DIR when Playwright's web server sets it", async () => {
    vi.stubEnv('NEXT_DIST_DIR', '.next-e2e');
    expect((await loadFreshConfig()).distDir).toBe('.next-e2e');
  });
});
