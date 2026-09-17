#!/usr/bin/env node
// Checks the change the docs drift agent made before any token that can write to GitHub sees it.
//
// `.github/workflows/docs-drift.yml` runs `claude -p` in a job that holds no GitHub write token,
// stages what the agent changed, and runs this script on the index. The job that pushes and opens
// the pull request applies the same patch to a fresh checkout and runs this script again, because
// it is the job the token is exposed in. The agent is told to edit docs only, and its tool rules
// already confine its edits to `docs/`; this script is what holds when either of those fails.
//
//   node scripts/docs-drift-patch.mjs   reads `git diff --cached --raw -z` in the current directory
//
//   exit 0  the index changes at least one allowed file and nothing else
//   exit 1  a staged path or mode is not allowed, or nothing is staged
//   exit 2  git could not be run, or printed something this script cannot parse
//
// Allowed: an added or modified regular, non-executable file (mode 100644) that is a Markdown file
// under `docs/` whose path has no segment starting with a dot, or `docs/drift-manifest.json`. That
// rules out deletions, renames, symlinks, submodules, executables, and any file a tool would load
// as configuration or code (`docs/.prettierrc.mjs`, `docs/package.json`), so formatting and
// committing the change later runs only configuration from `main`.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MARKDOWN = /^docs\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.md$/;
const MANIFEST = 'docs/drift-manifest.json';

/**
 * Parses `git diff --cached --raw -z --no-renames` output into
 * `{ oldMode, newMode, status, path }` entries.
 *
 * @param {string} output
 * @returns {{ oldMode: string, newMode: string, status: string, path: string }[]}
 */
export function parseRaw(output) {
  const fields = output.split('\0');
  const entries = [];
  for (let at = 0; at + 1 < fields.length; at += 2) {
    const meta = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/.exec(fields[at]);
    if (!meta) throw new Error(`unexpected git diff --raw record: ${JSON.stringify(fields[at])}`);
    entries.push({ oldMode: meta[1], newMode: meta[2], status: meta[3], path: fields[at + 1] });
  }
  return entries;
}

/**
 * One message per staged entry the drift correction may not contain.
 *
 * @param {{ newMode: string, status: string, path: string }[]} entries
 * @returns {string[]}
 */
export function problemsIn(entries) {
  if (entries.length === 0) return ['nothing is staged'];
  const problems = [];
  for (const { newMode, status, path } of entries) {
    if (status !== 'A' && status !== 'M') {
      problems.push(`${path}: status ${status}; only added or modified files are allowed`);
    } else if (newMode !== '100644') {
      problems.push(`${path}: mode ${newMode}; only regular, non-executable files are allowed`);
    } else if (path !== MANIFEST && !MARKDOWN.test(path)) {
      problems.push(`${path}: only Markdown under docs/ and ${MANIFEST} may change`);
    }
  }
  return problems;
}

function main() {
  let output;
  try {
    output = execFileSync('git', ['diff', '--cached', '--raw', '-z', '--no-renames'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    console.error(
      `docs-drift-patch: could not run git: ${error instanceof Error ? error.message : error}`,
    );
    return 2;
  }
  let entries;
  try {
    entries = parseRaw(output);
  } catch (error) {
    console.error(`docs-drift-patch: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  const problems = problemsIn(entries);
  if (problems.length > 0) {
    console.error('docs-drift-patch: the change may not be published:');
    for (const problem of problems) console.error(`  ${problem}`);
    return 1;
  }
  for (const { status, path } of entries) console.log(`${status} ${path}`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
