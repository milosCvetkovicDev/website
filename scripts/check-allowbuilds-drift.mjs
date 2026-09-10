#!/usr/bin/env node
// Checks that every `allowBuilds` entry in pnpm-workspace.yaml still describes the version
// pnpm-lock.yaml resolves, and that each entry still has a lifecycle script to decide about.
//
// ADR 0007 denied three dependency install scripts and recorded the reviewed version in a comment
// above each entry, because a denied package produces no new signal when its script changes. That
// mitigation never fired: sharp dropped its install script in 0.35.0 and the entry stayed behind,
// dead, through a bump nobody flagged. ADR 0013 supersedes 0007 and makes this script the signal.
//
// Run with `pnpm check:allowbuilds`. Prints every problem it found and exits 1, or exits 0 quietly.
//
// The one rule this file lives by: never exit 0 because it could not see. A gate for a silent
// failure is worthless if it is itself silent, so every path where the parser loses its footing —
// a line it cannot read, a block it cannot find, a package it cannot inspect — is a failure with a
// message, not a skip. The only deliberate skip is an uninstalled `node_modules`, which is reported.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmDir = join(repoRoot, 'node_modules', '.pnpm');

const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall'];
const ADR = 'docs/adr/0013-dependency-build-scripts-reviewed.md';

/** A failure that stops the check outright, as opposed to a finding about an entry. */
class CheckError extends Error {}

function read(path, what) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new CheckError(`cannot read ${what} (${path}): ${error.message}`);
  }
}

/** Splits `false # a note` into its scalar and drops the comment. Quotes are honoured. */
function scalarBeforeComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trim();
    }
  }
  return text.trim();
}

/**
 * Reads the `allowBuilds` block, pairing each entry with the `Reviewed at <version>` note in the
 * comment lines directly above it. Hand-parsed rather than pulled from a YAML library: this gate
 * exists to shrink the install-time dependency surface, so it should not widen it. The cost of
 * hand-parsing is that anything it cannot read has to be an error rather than a shrug.
 */
export function readAllowBuilds(source) {
  const lines = source.split('\n').map((line) => line.replace(/\r$/, ''));
  const headers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^allowBuilds\s*:/.test(line));

  if (headers.length === 0) {
    throw new CheckError(`pnpm-workspace.yaml has no \`allowBuilds:\` block. Read ${ADR}.`);
  }
  if (headers.length > 1) {
    throw new CheckError(
      `pnpm-workspace.yaml has ${headers.length} \`allowBuilds:\` blocks ` +
        `(lines ${headers.map((h) => h.index + 1).join(', ')}). YAML keeps the last, this check ` +
        `reads one; merge them into a single block.`,
    );
  }
  if (!/^allowBuilds\s*:\s*$/.test(headers[0].line)) {
    throw new CheckError(
      `\`allowBuilds\` is written inline (${headers[0].line.trim()}). This check reads the block ` +
        `form, one \`name: bool\` per line with its comment above it; rewrite it that way.`,
    );
  }

  const entries = [];
  const unreadable = [];
  let comment = [];

  for (const [offset, line] of lines.slice(headers[0].index + 1).entries()) {
    const lineNumber = headers[0].index + 2 + offset;
    const isIndented = /^\s/.test(line);
    const isBlank = line.trim() === '';

    // A comment at column 0 is still a comment, not the end of the block. Only a real top-level
    // key ends it — and a top-level key can never match the indented entry pattern below.
    if (!isBlank && !isIndented && !line.trimStart().startsWith('#')) break;

    if (isBlank) {
      comment = [];
      continue;
    }

    const commentMatch = line.match(/^\s*#\s?(.*)$/);
    if (commentMatch) {
      comment.push(commentMatch[1]);
      continue;
    }

    // Exactly two spaces: a deeper indent is a nested mapping, not an entry, and reading it as
    // one would invent a package name out of a sub-key.
    const entryMatch = line.match(/^ {2}(?:'([^']*)'|"([^"]*)"|([^\s:#][^:]*?))\s*:\s*(.*)$/);
    if (!entryMatch) {
      unreadable.push(`line ${lineNumber}: ${line.trim()}`);
      comment = [];
      continue;
    }

    const name = (entryMatch[1] ?? entryMatch[2] ?? entryMatch[3]).trim();
    const scalar = scalarBeforeComment(entryMatch[4]);

    // The last note wins, so a comment that records an earlier review alongside the current one is
    // read as the version most recently looked at.
    const notes = [...comment.join(' ').matchAll(/Reviewed at ([^\s,;]+?)[.,;]?(?:\s|$)/g)];

    entries.push({ name, scalar, reviewed: notes.at(-1)?.[1] ?? null, lineNumber });
    comment = [];
  }

  if (unreadable.length > 0) {
    throw new CheckError(
      `cannot read ${unreadable.length} line(s) inside the \`allowBuilds\` block, so this check ` +
        `cannot say whether they drifted:\n    ${unreadable.join('\n    ')}\n  Write each entry ` +
        `as \`name: true\` or \`name: false\` on its own line.`,
    );
  }

  return entries;
}

/**
 * Collects the versions pnpm-lock.yaml resolves per package, from the `packages:` section, whose
 * keys are bare `name@version`. The `snapshots:` section repeats them with peer suffixes such as
 * `sharp@0.35.4(@types/node@20.19.30)`, which is why only `packages:` is read.
 */
export function readResolvedVersions(source) {
  const lines = source.split('\n').map((line) => line.replace(/\r$/, ''));
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) {
    throw new CheckError('pnpm-lock.yaml has no `packages:` section; cannot check allowBuilds.');
  }

  const resolved = new Map();

  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !/^\s/.test(line)) break;

    const match = line.match(/^ {2}(?:'([^']+)'|"([^"]+)"|(\S+)):\s*$/);
    if (!match) continue;

    // `@scope/name@version` or `name@version`. Anchored rather than sliced at the last `@`, so a
    // git or tarball specifier does not parse into a plausible-looking wrong name.
    const parsed = match[1] ?? match[2] ?? match[3];
    const key = parsed.match(/^((?:@[^/@]+\/)?[^@/][^@]*)@(.+)$/);
    if (!key) continue;

    const [, name, version] = key;
    if (!resolved.has(name)) resolved.set(name, new Set());
    resolved.get(name).add(version);
  }

  if (resolved.size === 0) {
    throw new CheckError(
      'parsed no packages out of pnpm-lock.yaml, so every entry would look absent. The lockfile ' +
        'format has probably changed; update this script before trusting it again.',
    );
  }

  return resolved;
}

/**
 * Reads the lifecycle hooks an installed package declares. Distinguishes "not installed", which is
 * a reported skip, from "installed but I could not look", which is a failure: the scriptless-entry
 * test exists for exactly the defect that hid last time, so it must not quietly not run.
 *
 * `dirs` is the store listing, read once per run so that two entries cannot be judged against two
 * different states of a store another process is rewriting.
 */
export function readLifecycleHooks(name, version, dirs, readManifest) {
  if (dirs === null) return { skipped: 'node_modules is not installed' };

  // `name` reaches a filesystem path, and it comes from the lockfile. Nothing but a real npm name
  // gets that far.
  if (!/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(name)) {
    return { unverifiable: `"${name}" is not a usable package name` };
  }

  // pnpm flattens `/` to `+` in directory names and appends a peer hash to some of them. Several
  // peer variants of one name@version are the same published tarball, so any of them will do.
  const prefix = `${name.replaceAll('/', '+')}@${version}`;
  const match = dirs.find((dir) => dir === prefix || dir.startsWith(`${prefix}_`));
  if (!match) return { unverifiable: `no node_modules/.pnpm/${prefix}* directory` };

  let parsed;
  try {
    parsed = readManifest(match, name);
  } catch (error) {
    return { unverifiable: `cannot read its package.json: ${error.message}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { unverifiable: 'its package.json is not an object' };
  }

  const { scripts } = parsed;
  if (scripts != null && (typeof scripts !== 'object' || Array.isArray(scripts))) {
    return { unverifiable: 'its package.json has a non-object `scripts`' };
  }

  // An empty or whitespace-only command is not a script. A package that blanked its hook rather
  // than deleting it has dropped it just as surely.
  const hooks = LIFECYCLE_SCRIPTS.filter(
    (hook) => typeof scripts?.[hook] === 'string' && scripts[hook].trim() !== '',
  );
  return { hooks };
}

export function collectProblems(entries, resolved, inspect) {
  const problems = [];
  const skips = [];

  for (const { name, scalar, reviewed, lineNumber } of entries) {
    if (scalar !== 'true' && scalar !== 'false') {
      problems.push(
        `${name} (line ${lineNumber}): value is \`${scalar}\`, which this check does not read as ` +
          `a decision. Write \`true\` or \`false\`.`,
      );
      continue;
    }

    const versions = resolved.get(name);

    if (!versions) {
      problems.push(
        `${name}: has an allowBuilds entry, but pnpm-lock.yaml resolves no such package. ` +
          `The dependency is gone; drop the entry.`,
      );
      continue;
    }

    if (versions.size > 1) {
      problems.push(
        `${name}: pnpm-lock.yaml resolves ${versions.size} versions ` +
          `(${[...versions].sort().join(', ')}), which one entry cannot describe. Read each ` +
          `script and record the decision. Its lifecycle-script test did not run.`,
      );
      continue;
    }

    const [version] = versions;

    if (reviewed === null) {
      problems.push(
        `${name}: no "Reviewed at <version>" note in the comment above the entry. ` +
          `Read the script at ${version} and record the version you read.`,
      );
    } else if (reviewed !== version) {
      problems.push(
        `${name}: reviewed at ${reviewed}, but pnpm-lock.yaml resolves ${version}. ` +
          `Read the script at ${version}, confirm \`${scalar}\` is still the right call, ` +
          `then update the comment.`,
      );
    }

    const result = inspect(name, version);
    if (result.skipped) {
      skips.push(`${name}@${version}: ${result.skipped}`);
    } else if (result.unverifiable) {
      problems.push(
        `${name}@${version}: cannot confirm the package still declares a lifecycle script ` +
          `(${result.unverifiable}). Reinstall, or update this check if the store layout changed.`,
      );
    } else if (result.hooks.length === 0) {
      problems.push(
        `${name}@${version}: declares no ${LIFECYCLE_SCRIPTS.join('/')} script, so the entry ` +
          `decides nothing. Drop it — an entry for a scriptless package would silently deny any ` +
          `script a later release adds, instead of letting pnpm report it as a new decision.`,
      );
    }
  }

  return { problems, skips };
}

function main() {
  let entries;
  let resolved;
  try {
    entries = readAllowBuilds(read(join(repoRoot, 'pnpm-workspace.yaml'), 'pnpm-workspace.yaml'));
    resolved = readResolvedVersions(read(join(repoRoot, 'pnpm-lock.yaml'), 'pnpm-lock.yaml'));
  } catch (error) {
    if (!(error instanceof CheckError)) throw error;
    console.error(`allowBuilds check could not run: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (entries.length === 0) {
    console.error('allowBuilds: the block is empty, so this check verified nothing.');
    return;
  }

  let dirs = null;
  if (existsSync(pnpmDir)) {
    try {
      dirs = readdirSync(pnpmDir);
    } catch (error) {
      console.error(`allowBuilds check could not run: cannot list ${pnpmDir}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const readManifest = (dir, name) =>
    JSON.parse(readFileSync(join(pnpmDir, dir, 'node_modules', name, 'package.json'), 'utf8'));

  const { problems, skips } = collectProblems(entries, resolved, (name, version) =>
    readLifecycleHooks(name, version, dirs, readManifest),
  );

  if (skips.length > 0) {
    console.error('allowBuilds: skipped the lifecycle-script test, which needs an install:');
    for (const skip of skips) console.error(`  - ${skip}`);
  }

  if (problems.length === 0) return;

  console.error(`\nallowBuilds drift (see ${ADR}):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exitCode = 1;
}

// Importable for its tests; runs only when invoked as the command.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
