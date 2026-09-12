/**
 * These assertions read a configuration module and the filesystem, with no DOM in them, and building
 * a jsdom window is the most expensive thing in a test file that does not need one -- importing the
 * module alone costs about two seconds in every worker.
 *
 * @vitest-environment node
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { findWorkspaceRoot } from '../../next.config';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(testDir, '../..');
const repoRoot = path.resolve(appDir, '../..');

/** Every temp tree this file builds, removed in afterAll so a run leaves the OS temp dir as it was. */
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

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
    // The walk stops at the filesystem root, so the null case only means anything while no ancestor
    // of the OS temp directory carries a workspace file. Assert that rather than assume it: a
    // pnpm-workspace.yaml in / or /tmp would otherwise turn this into a test of nothing.
    for (let dir = orphan; ; dir = path.dirname(dir)) {
      expect(
        existsSync(path.join(dir, 'pnpm-workspace.yaml')),
        `${dir} holds a pnpm-workspace.yaml, so ${orphan} is not workspace-free and this test proves nothing`,
      ).toBe(false);
      if (path.dirname(dir) === dir) break;
    }

    expect(findWorkspaceRoot(orphan)).toBeNull();
  });
});

/**
 * Loads next.config.ts fresh under the current environment. The module reads
 * `process.env.NEXT_DIST_DIR` while it is evaluated, so each case needs its own module instance.
 */
async function loadConfig() {
  vi.resetModules();
  return (await import('../../next.config')).default;
}

describe('next.config.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('serves .next when NEXT_DIST_DIR is unset, as every invocation but Playwright does', async () => {
    vi.stubEnv('NEXT_DIST_DIR', undefined);
    expect((await loadConfig()).distDir).toBe('.next');
  });

  // `||`, not `??`. A shell that expands an unset variable into the environment hands Next an empty
  // string, which is not a usable distDir and must fall back the same way an absent one does.
  it('falls back to .next when NEXT_DIST_DIR is present but empty', async () => {
    vi.stubEnv('NEXT_DIST_DIR', '');
    expect((await loadConfig()).distDir).toBe('.next');
  });

  it('takes NEXT_DIST_DIR when Playwright sets it', async () => {
    vi.stubEnv('NEXT_DIST_DIR', '.next-e2e');
    expect((await loadConfig()).distDir).toBe('.next-e2e');

    vi.stubEnv('NEXT_DIST_DIR', '.next');
    expect((await loadConfig()).distDir).toBe('.next');
  });
});
