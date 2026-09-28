import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig, {
  contentSecurityPolicy,
  crossOriginOpenerPolicy,
  findWorkspaceRoot,
  PRODUCTION_ALIAS_HEADERS,
  SECURITY_HEADERS_SOURCE,
  securityHeaders,
  type HeaderEnv,
} from '../../next.config';
import { PRODUCTION_ALIAS_HOST } from '../../production-alias';

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

  it('declares the security headers in one entry whose source covers every path', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');

    // `:path*` is zero or more segments, so `/` matches as well as `/_next/static/...` and any 404.
    // `/(.*)` would do the same; a narrower pattern is how a surface gets left out, and the e2e
    // spec (e2e/security-headers.spec.ts) is what proves all four surfaces under both servers.
    // The second entry is the production alias's noindex (ADR 0025), pinned below.
    expect(SECURITY_HEADERS_SOURCE).toBe('/:path*');
    const [security, ...rest] = (await nextConfig.headers?.()) ?? [];
    expect(security).toEqual({
      source: SECURITY_HEADERS_SOURCE,
      headers: securityHeaders(production),
    });
    expect(rest).toHaveLength(1);
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

describe('env', () => {
  // The config reads VERCEL_ENV when it is evaluated, so each case imports a fresh copy.
  const freshConfig = async () => {
    vi.resetModules();
    return (await import('../../next.config')).default;
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('inlines VERCEL_ENV, so the client-side global error page gates analytics like the layout', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await freshConfig()).env).toEqual({ VERCEL_ENV: 'production' });
  });

  it('inlines an empty string when VERCEL_ENV is unset, which the gate reads as off', async () => {
    vi.stubEnv('VERCEL_ENV', undefined);
    expect((await freshConfig()).env).toEqual({ VERCEL_ENV: '' });
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
