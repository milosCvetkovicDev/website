#!/usr/bin/env node
// Vercel's Ignored Build Step: decides whether a deployment's build should run at all.
//
// THE EXIT CODE IS INVERTED relative to every other gate in this repository.
//
//   exit 0  -> Vercel ignores the build; the deployment ends in state CANCELED
//   exit 1  -> Vercel builds as normal
//
// That is Vercel's contract, not a choice made here:
// https://vercel.com/docs/project-configuration/vercel-json#ignorecommand
// "When the command exits with code 1, the build will continue. When the command exits with 0, the
// build is ignored."
//
// Why this exists: on 2026-09-10, 115 deployments ran in 24 hours on a plan that allows 100 a day,
// 36 of them from `dependabot/*` branches and 11 from docs-only branches. The two production builds
// that followed were refused as rate limited and Vercel never retried, so `main` was three commits
// ahead of the live site for over a day. See docs/adr/0016-vercel-deployment-budget.md.
//
// What this script does NOT buy back: a build cancelled here still counts against the 100
// deployments a day, because Vercel counts a CANCELED build as a full deployment
// (https://vercel.com/docs/project-configuration/project-settings#ignored-build-step). Only
// `git.deploymentEnabled` in apps/web/vercel.json stops a deployment being created at all, and it
// can only match branch names. This script covers what a branch name cannot express: a commit that
// changes nothing the site is built from.
//
// The one rule this file lives by, the same one `scripts/check-allowbuilds-drift.mjs` states: never
// skip because it could not see. A missing base SHA, a base that is not in the shallow clone, a git
// command that fails, an empty diff, an unrecognised `VERCEL_ENV` — every one of them builds. A
// wrong skip is a merge that silently never ships; a wrong build costs one deployment.
//
// Vercel runs this with the working directory set to the Root Directory (`apps/web`) and before the
// install, so it may use Node builtins only. `apps/web/vercel.json` therefore invokes it as
// `node ../../scripts/vercel-ignore-build.mjs` — a fixed hop, because the cwd is documented, and one
// that fails loudly if the Root Directory ever moves. Inside, the repository root is resolved from
// `git rev-parse --show-toplevel` instead, so the diff can never silently read the wrong tree.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Vercel ignores the build when the command exits 0. */
export const SKIP_EXIT_CODE = 0;
/** Vercel builds when the command exits 1. */
export const BUILD_EXIT_CODE = 1;

/**
 * Everything the deployed site is built from. A commit that touches none of these cannot change a
 * single byte Vercel serves, so building it spends a deployment on an identical output.
 *
 * This list is the policy. ADR 0016 points at it rather than restating it, so there is one place to
 * change when the build inputs change. `apps/playground` is absent on purpose: it is a local Vite
 * sandbox with no Vercel project (ADR 0005), and a change to its own files cannot reach `apps/web`.
 * A change to its dependencies does reach `pnpm-lock.yaml`, which is listed.
 */
export const BUILD_INPUT_DIRECTORIES = ['apps/web/', 'packages/'];
export const BUILD_INPUT_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.npmrc',
  '.nvmrc',
];

/**
 * Branch namespaces whose previews are never worth a deployment. Dependabot's own pull requests are
 * verified by `.github/workflows/ci.yml`, which builds `apps/web` and runs the Playwright suite
 * against it; a preview URL adds nothing a reviewer of a version bump reads.
 *
 * `apps/web/vercel.json` already stops these deployments being created, which is the mechanism that
 * actually saves quota. This is the backstop for the case where that file is not read — a project
 * whose Root Directory moved, or a deployment created some other way.
 */
export const SKIPPED_REF_NAMESPACES = ['dependabot/'];

/** Git diff paths are repository-relative with forward slashes on every platform. */
export function isBuildInput(path) {
  if (BUILD_INPUT_FILES.includes(path)) return true;
  // Prefixes carry their trailing slash, so `apps/web/` cannot claim a future `apps/website`.
  return BUILD_INPUT_DIRECTORIES.some((directory) => path.startsWith(directory));
}

export function buildInputsIn(paths) {
  return paths.filter(isBuildInput);
}

function isSkippedRef(commitRef) {
  if (typeof commitRef !== 'string') return false;
  return SKIPPED_REF_NAMESPACES.some((namespace) => commitRef.startsWith(namespace));
}

/**
 * The whole policy, as a pure function, so the tests need neither a git repository nor Vercel.
 *
 * `diff` is either `{ paths: string[] }` or `{ unavailable: string }` — the second is "I could not
 * establish what changed", which always builds.
 *
 * Returns `{ build, reason }`. The reason is printed into the build log, because the only person who
 * ever reads it is looking at a deployment that did or did not happen and wants to know why.
 */
export function decide({ vercelEnv, commitRef, diff, allowProductionSkip = false }) {
  // The environment gate comes first, so nothing below it can skip a production build that the
  // owner has not opted in. An unset or unrecognised VERCEL_ENV is not "probably a preview".
  if (vercelEnv !== 'preview') {
    if (vercelEnv !== 'production') {
      return {
        build: true,
        reason: `VERCEL_ENV is ${JSON.stringify(vercelEnv ?? null)}, which is neither "preview" nor "production"; building rather than guessing.`,
      };
    }
    if (!allowProductionSkip) {
      return {
        build: true,
        reason:
          'a production deployment always builds, so the live commit stays equal to `main`. Set ' +
          'VERCEL_SKIP_DOCS_ONLY_PRODUCTION=1 in the Production environment to let documentation-' +
          'only merges skip.',
      };
    }
  }

  if (isSkippedRef(commitRef)) {
    return { build: false, reason: `${commitRef} is a dependabot branch; CI verifies these.` };
  }

  if (diff.unavailable) {
    return { build: true, reason: `cannot tell what changed (${diff.unavailable}); building.` };
  }

  if (diff.paths.length === 0) {
    return {
      build: true,
      reason:
        'the diff against the base commit is empty, which is also what a wrong base looks like; building.',
    };
  }

  const inputs = buildInputsIn(diff.paths);
  if (inputs.length > 0) {
    const shown = inputs.slice(0, 5).join(', ');
    const rest = inputs.length > 5 ? ` and ${inputs.length - 5} more` : '';
    return { build: true, reason: `build inputs changed: ${shown}${rest}.` };
  }

  return {
    build: false,
    reason: `${diff.paths.length} file(s) changed and none of them is a build input.`,
  };
}

/**
 * Runs git at `cwd`, returning `null` rather than throwing, because a failure here must build.
 *
 * `maxBuffer` is raised from the 1 MB default: a wide enough diff would otherwise overflow it and be
 * reported as "cannot tell what changed". That still builds, so nothing breaks, but the reason in the
 * log would name the wrong cause.
 */
function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** Rejects anything that is not a hexadecimal object name before it reaches a git argument. */
function isObjectName(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,64}$/i.test(value);
}

export function readDiff(env, run = git) {
  const repoRoot = run(['rev-parse', '--show-toplevel'], process.cwd())?.trim();
  if (!repoRoot) {
    return {
      unavailable: 'git rev-parse --show-toplevel failed, so there is no repository to read',
    };
  }

  const base = env.VERCEL_GIT_PREVIOUS_SHA;
  if (!base) return { unavailable: 'VERCEL_GIT_PREVIOUS_SHA is not set' };
  if (!isObjectName(base)) {
    return { unavailable: `VERCEL_GIT_PREVIOUS_SHA is not an object name (${base})` };
  }

  // Vercel clones shallowly, so the base of a force-push or a long-quiet branch may be absent.
  if (run(['cat-file', '-e', `${base}^{commit}`], repoRoot) === null) {
    return { unavailable: `base ${base} is not in this clone` };
  }

  const head = isObjectName(env.VERCEL_GIT_COMMIT_SHA) ? env.VERCEL_GIT_COMMIT_SHA : 'HEAD';

  // Two flags, both load-bearing:
  //
  //   --no-renames  a rename lists the old and the new path rather than one rename entry. More paths
  //                 can only push the verdict towards building, which is the safe direction.
  //   -z            NUL-separated and, crucially, *unquoted*. Without it git renders any path with a
  //                 non-ASCII byte or a newline in it as a C-quoted string — "apps/web/caf\303\251
  //                 .tsx", leading double quote included — which does not start with `apps/web/`, so
  //                 the path would not be recognised as a build input and the build would be
  //                 skipped. That is the one direction this gate must never fail in.
  const output = run(['diff', '--name-only', '--no-renames', '-z', base, head], repoRoot);
  if (output === null) {
    return { unavailable: `git diff ${base}..${head} failed` };
  }

  return { paths: output.split('\0').filter((line) => line !== '') };
}

function main() {
  const { env } = process;
  const verdict = decide({
    vercelEnv: env.VERCEL_ENV,
    commitRef: env.VERCEL_GIT_COMMIT_REF,
    diff: readDiff(env),
    allowProductionSkip: env.VERCEL_SKIP_DOCS_ONLY_PRODUCTION === '1',
  });

  console.log(`${verdict.build ? 'BUILD' : 'SKIP'}: ${verdict.reason}`);
  // `exitCode` rather than `process.exit()`, so the verdict line is flushed before the process ends:
  // stdout to a pipe is asynchronous on macOS, and the line is the only record of why.
  process.exitCode = verdict.build ? BUILD_EXIT_CODE : SKIP_EXIT_CODE;
}

/**
 * Whether this file is the process's entry point, compared through realpath on both sides.
 *
 * Node's ESM loader resolves symlinks in `import.meta.url` but leaves `process.argv[1]` as typed, so
 * the plain comparison `scripts/check-allowbuilds-drift.mjs` uses is false whenever the invocation
 * path crosses a symlink. There that is a gate that silently does not run; here it is worse, because
 * a script that never calls `main()` exits 0 and Vercel reads 0 as "skip" — production included.
 */
function isEntryPoint(argv1) {
  if (!argv1) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argv1) === realpathSync(self);
  } catch {
    return argv1 === self;
  }
}

// Importable for its tests; runs only when invoked as the command.
if (isEntryPoint(process.argv[1])) main();
