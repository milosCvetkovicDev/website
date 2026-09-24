import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig, {
  contentSecurityPolicy,
  crossOriginOpenerPolicy,
  findWorkspaceRoot,
  SECURITY_HEADERS_SOURCE,
  securityHeaders,
  type HeaderEnv,
} from '../../next.config';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, '../..');
const repoRoot = path.resolve(appDir, '../..');

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
    const outer = mkdtempSync(path.join(tmpdir(), 'workspace-root-'));
    const inner = path.join(outer, '.claude', 'worktrees', 'nested');
    const innerApp = path.join(inner, 'apps', 'web');
    mkdirSync(innerApp, { recursive: true });
    writeFileSync(path.join(outer, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(path.join(inner, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");

    expect(findWorkspaceRoot(innerApp)).toBe(inner);
    expect(findWorkspaceRoot(path.join(innerApp, 'src'))).toBe(inner);
  });

  it('returns null when no workspace file is above the starting directory', () => {
    const orphan = mkdtempSync(path.join(tmpdir(), 'no-workspace-'));
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

  it('declares one headers() entry whose source covers every path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');

    // `:path*` is zero or more segments, so `/` matches as well as `/_next/static/...` and any 404.
    // `/(.*)` would do the same; a narrower pattern is how a surface gets left out, and the e2e
    // spec (e2e/security-headers.spec.ts) is what proves all four surfaces under both servers.
    expect(SECURITY_HEADERS_SOURCE).toBe('/:path*');
    expect(await nextConfig.headers?.()).toEqual([
      { source: SECURITY_HEADERS_SOURCE, headers: securityHeaders(production) },
    ]);
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
