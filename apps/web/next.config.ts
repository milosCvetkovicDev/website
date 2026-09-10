import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The monorepo root, two directories above apps/web, resolved from this file's own location so it
// is right in every checkout. Without it Next.js infers the root from the outermost lockfile above
// the app, which is the wrong directory whenever a checkout sits below another one that has a
// lockfile, such as a git worktree under .claude/worktrees/ (the parent checkout wins).
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

if (!existsSync(path.join(monorepoRoot, 'pnpm-workspace.yaml'))) {
  throw new Error(
    `apps/web/next.config.ts resolved the monorepo root to ${monorepoRoot}, but there is no ` +
      'pnpm-workspace.yaml there. Update turbopack.root if the app moved.',
  );
}

const nextConfig: NextConfig = {
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
