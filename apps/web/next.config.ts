import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

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
};

export default nextConfig;
