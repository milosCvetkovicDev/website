#!/usr/bin/env node
// Checks every machine-verifiable claim catalogued in docs/drift-manifest.json against the thing
// it describes: a live GitHub setting, a line of a file, a value in a config file, or a package
// script.
// Run with `pnpm check:docs-drift` (text) or `pnpm check:docs-drift --json` (structured diff).
//
// Exit codes, and the one rule this file lives by, the same one scripts/check-allowbuilds-drift.mjs
// states: a check that could not run is never reported as passing.
//
//   0  every assertion holds (entries skipped by --skip-requires are listed, not counted as holds)
//   1  drift: an assertion is false, its anchor is gone from the doc (stale), or the docs contain a
//      link, script or path:line citation that no assertion covers (uncatalogued)
//   2  a check could not run (gh unauthenticated, a 5xx after retries, a missing commit), or the
//      manifest itself is invalid. Takes precedence over 1; the report still lists the drift.
//
// Node 22 runs this file directly: type stripping is on by default from 22.18, and CI resolves
// .nvmrc's `22` to a later release. Only erasable TypeScript syntax is used for that reason.
//
// The manifest's `rules` block defines what `live` and `historical` mean, what each method checks,
// and what was deliberately left out. This file implements those definitions and nothing else.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type Evaluation = 'live' | 'historical';
type Method = 'gh-api' | 'file-line' | 'config-value' | 'command';
type Status = 'pass' | 'drift' | 'stale' | 'skipped' | 'unrunnable';

interface Assertion {
  id: string;
  doc: string;
  anchor: string;
  claim: string;
  method: Method;
  evaluation: Evaluation;
  asOf?: string;
  supersededBy?: string;
  requires?: 'admin';
  covers?: { kind: CoverageKind; token: string }[];
  check: Record<string, unknown>;
}

interface Manifest {
  schemaVersion: number;
  repository: string;
  rules: { coverage: { roots: string[]; pnpmBuiltins: string[] } } & Record<string, unknown>;
  assertions: Assertion[];
}

interface Result {
  id: string;
  doc: string;
  line: number | null;
  method: Method;
  evaluation: Evaluation;
  status: Status;
  claim: string;
  claimed: unknown;
  actual: unknown;
  detail: string;
}

type CoverageKind = 'link' | 'script' | 'citation';

interface Token {
  doc: string;
  line: number;
  kind: CoverageKind;
  token: string;
}

/** Raised by a check that could not run, as opposed to one that ran and found drift. */
class Unrunnable extends Error {}

const METHODS: readonly Method[] = ['gh-api', 'file-line', 'config-value', 'command'];

// -------------------------------------------------------------------------------------------------
// Repository access: the working tree for `live`, `git show <asOf>:<path>` for `historical`.

function git(root: string, args: string[]): string {
  const run = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (run.error) throw new Unrunnable(`git ${args.join(' ')}: ${run.error.message}`);
  if (run.status !== 0) throw new Unrunnable(`git ${args.join(' ')}: ${run.stderr.trim()}`);
  return run.stdout;
}

/** A file's content at the ref an assertion is evaluated at, or null when it does not exist. */
function readAt(root: string, ref: string | null, path: string): string | null {
  if (ref === null) {
    const full = join(root, path);
    return existsSync(full) ? readFileSync(full, 'utf8') : null;
  }
  const exists = spawnSync('git', ['-C', root, 'cat-file', '-e', `${ref}:${path}`]);
  if (exists.status !== 0) {
    // Tell "the file was not there" from "the commit is not here": only the first is a finding.
    const commit = spawnSync('git', ['-C', root, 'cat-file', '-e', `${ref}^{commit}`]);
    if (commit.status !== 0) throw new Unrunnable(`commit ${ref} is not in this clone`);
    return null;
  }
  return git(root, ['show', `${ref}:${path}`]);
}

function refFor(assertion: Assertion): string | null {
  return assertion.evaluation === 'historical' ? (assertion.asOf ?? null) : null;
}

// -------------------------------------------------------------------------------------------------
// The four methods. Each returns [holds, claimed, actual, detail] or throws Unrunnable.

type Outcome = [boolean, unknown, unknown, string];

function lineSpan(text: string, line: number, lineEnd: number): string {
  return text
    .split('\n')
    .slice(line - 1, lineEnd)
    .join('\n');
}

function expectText(actual: string, check: Record<string, unknown>): [boolean, unknown] {
  if (typeof check.contains === 'string') return [actual.includes(check.contains), check.contains];
  if (typeof check.matches === 'string') {
    return [new RegExp(check.matches, 'm').test(actual), `/${check.matches}/`];
  }
  if (typeof check.absent === 'string')
    return [!actual.includes(check.absent), `no ${check.absent}`];
  return [true, 'exists'];
}

function fileLine(root: string, assertion: Assertion): Outcome {
  const check = assertion.check;
  const path = String(check.path);
  const text = readAt(root, refFor(assertion), path);
  if (text === null) {
    return [check.exists === false, `${path} exists`, `${path} does not exist`, ''];
  }
  if (check.exists === false) return [false, `${path} does not exist`, `${path} exists`, ''];
  if (typeof check.line !== 'number') {
    const [holds, claimed] = expectText(text, check);
    return [holds, claimed, holds ? claimed : `not in ${path}`, ''];
  }
  const lineEnd = typeof check.lineEnd === 'number' ? check.lineEnd : check.line;
  const span = lineSpan(text, check.line, lineEnd);
  const [holds, claimed] = expectText(span, check);
  const where =
    lineEnd === check.line ? `${path}:${check.line}` : `${path}:${check.line}-${lineEnd}`;
  return [holds, claimed, span.trim(), where];
}

/**
 * Reads `a.b[0].c` out of parsed JSON, with `["a.b"]` for a key that itself contains a dot, as
 * VS Code settings do. A missing step yields undefined, not an exception.
 */
function jsonPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  const steps = [...path.matchAll(/\["([^"]+)"\]|([^.[\]]+)/g)].map((m) => m[1] ?? m[2]);
  for (const step of steps) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}

/** JSON with object keys sorted, so equality does not depend on key order (gh's jq sorts them). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function configValue(root: string, assertion: Assertion): Outcome {
  const check = assertion.check;
  const file = String(check.file);
  const text = readAt(root, refFor(assertion), file);
  if (text === null) return [false, check.equals ?? check.equalsAll, `${file} does not exist`, ''];
  let actual: unknown;
  if (typeof check.json === 'string') {
    try {
      actual = jsonPath(JSON.parse(text), check.json);
    } catch (error) {
      throw new Unrunnable(`${file} is not JSON: ${(error as Error).message}`);
    }
  } else if (typeof check.regex === 'string') {
    const pattern = new RegExp(check.regex, 'gm');
    const captures = [...text.matchAll(pattern)].map((m) => m[1] ?? m[0]);
    actual = 'equalsAll' in check ? captures : (captures[0] ?? null);
  } else if (check.text === true) {
    actual = text.trim();
  } else {
    throw new Unrunnable(`config-value check needs json, regex or text`);
  }
  const claimed = 'equalsAll' in check ? check.equalsAll : check.equals;
  return [sameValue(actual, claimed), claimed, actual, file];
}

function command(root: string, assertion: Assertion): Outcome {
  const check = assertion.check;
  const pkg = typeof check.package === 'string' ? check.package : '.';
  const manifestPath = normalize(join(pkg, 'package.json'));
  const text = readAt(root, refFor(assertion), manifestPath);
  if (text === null) return [false, `${manifestPath} exists`, 'missing', ''];
  let scripts: Record<string, string>;
  try {
    scripts = (JSON.parse(text) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch (error) {
    throw new Unrunnable(`${manifestPath} is not JSON: ${(error as Error).message}`);
  }
  const script = String(check.script);
  const holds = Object.hasOwn(scripts, script);
  const actual = holds ? `"${script}": "${scripts[script]}"` : `no "${script}" in ${manifestPath}`;
  if (holds && typeof check.runs === 'string' && !scripts[script].includes(check.runs)) {
    return [false, `"${script}" runs ${check.runs}`, actual, manifestPath];
  }
  return [holds, `script "${script}" in ${manifestPath}`, actual, manifestPath];
}

const GH_ATTEMPTS = 3;
// Overridable so the tests do not sleep through real backoff.
const backoffMs = Number(process.env.DOCS_DRIFT_GH_BACKOFF_MS ?? 1000);

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** One `gh api` read, retried on the server errors GitHub returns intermittently. */
function ghApi(repository: string, endpoint: string, jq: string): unknown {
  const path = endpoint.replaceAll('{repo}', repository);
  let lastError = '';
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt += 1) {
    const run = spawnSync('gh', ['api', path, '--jq', `(${jq}) | tojson`], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (run.error) throw new Unrunnable(`gh api ${path}: ${run.error.message}`);
    if (run.status === 0) {
      try {
        return JSON.parse(run.stdout);
      } catch {
        throw new Unrunnable(`gh api ${path} printed something that is not JSON: ${run.stdout}`);
      }
    }
    lastError = run.stderr.trim();
    if (!/HTTP 5\d\d|timeout|connection reset|EOF/i.test(lastError)) break;
    if (attempt < GH_ATTEMPTS) sleep(backoffMs * 2 ** (attempt - 1));
  }
  throw new Unrunnable(`gh api ${path}: ${lastError || 'failed'}`);
}

function ghCheck(root: string, repository: string, assertion: Assertion): Outcome {
  if (assertion.evaluation === 'historical') return adrChain(root, assertion);
  const check = assertion.check;
  const actual = ghApi(repository, String(check.endpoint), String(check.jq));
  return [sameValue(actual, check.equals), check.equals, actual, String(check.endpoint)];
}

/**
 * A historical setting cannot be replayed from the API, which keeps no history of settings. What
 * can be checked is that the record stating it says it has been superseded, by a record that
 * exists.
 */
function adrChain(root: string, assertion: Assertion): Outcome {
  const by = assertion.supersededBy;
  if (typeof by !== 'string' || !/^\d{4}$/.test(by)) {
    throw new Unrunnable(`historical gh-api assertion needs supersededBy "NNNN"`);
  }
  const doc = readAt(root, null, assertion.doc) ?? '';
  const status = /## Status\s+([^\n]+)/.exec(doc)?.[1] ?? '';
  const successor = readdirSync(join(root, 'docs/adr')).find((name) => name.startsWith(`${by}-`));
  const holds = status.includes(`Superseded by ADR-${by}`) && successor !== undefined;
  return [
    holds,
    `status "Superseded by ADR-${by}" and docs/adr/${by}-*.md`,
    `status "${status}", ${successor ? `docs/adr/${successor}` : `no docs/adr/${by}-*.md`}`,
    'checked through the record chain, not the live API',
  ];
}

// -------------------------------------------------------------------------------------------------
// Coverage: the tokens in docs/ that a manifest entry has to account for.

const LINK = /\]\(([^)\s]+)\)/g;
const CITATION =
  /(?<![\w/.-])((?:\.{1,2}\/|[\w@-]+\/)*[\w@.[\]-]+\.(?:tsx?|mjs|cjs|js|json|ya?ml|md|css|sh)):(\d+(?:-\d+)?)\b/g;
const INLINE_CODE = /`([^`\n]+)`/g;

function markdownFiles(root: string, dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

export function tokensIn(doc: string, text: string, pnpmBuiltins: readonly string[]): Token[] {
  const tokens: Token[] = [];
  let inFence = false;
  text.split('\n').forEach((content, index) => {
    const line = index + 1;
    if (/^\s*```/.test(content)) {
      inFence = !inFence;
      return;
    }
    for (const match of content.matchAll(LINK)) {
      const target = match[1];
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      tokens.push({ doc, line, kind: 'link', token: target });
    }
    for (const match of content.matchAll(CITATION)) {
      tokens.push({ doc, line, kind: 'citation', token: `${match[1]}:${match[2]}` });
    }
    if (inFence) return;
    for (const match of content.matchAll(INLINE_CODE)) {
      const words = match[1].trim().split(/\s+/);
      if (words[0] !== 'pnpm') continue;
      let at = 1;
      let pkg = '.';
      if (words[at] === '--filter' && words[at + 1]) {
        pkg = words[at + 1];
        at += 2;
      }
      const name = words[at];
      if (!name || name.startsWith('-') || pnpmBuiltins.includes(name)) continue;
      tokens.push({ doc, line, kind: 'script', token: pkg === '.' ? name : `${pkg} ${name}` });
    }
  });
  return tokens;
}

function uncatalogued(root: string, manifest: Manifest): Token[] {
  const covered = new Set<string>();
  for (const assertion of manifest.assertions) {
    for (const cover of assertion.covers ?? []) {
      covered.add(`${assertion.doc}\u0000${cover.kind}\u0000${cover.token}`);
    }
  }
  const missing: Token[] = [];
  for (const dir of manifest.rules.coverage.roots) {
    for (const doc of markdownFiles(root, dir)) {
      const text = readFileSync(join(root, doc), 'utf8');
      for (const token of tokensIn(doc, text, manifest.rules.coverage.pnpmBuiltins)) {
        if (!covered.has(`${token.doc}\u0000${token.kind}\u0000${token.token}`))
          missing.push(token);
      }
    }
  }
  return missing;
}

// -------------------------------------------------------------------------------------------------
// Manifest validation: a malformed entry is an error, never a silently skipped check.

function validate(manifest: Manifest): string[] {
  const problems: string[] = [];
  if (manifest.schemaVersion !== 1) problems.push(`schemaVersion must be 1`);
  if (typeof manifest.repository !== 'string') problems.push(`repository must be "owner/name"`);
  if (!Array.isArray(manifest.rules?.coverage?.roots))
    problems.push(`rules.coverage.roots missing`);
  if (!Array.isArray(manifest.assertions)) return [...problems, 'assertions must be an array'];
  const ids = new Set<string>();
  for (const [index, a] of manifest.assertions.entries()) {
    const at = `assertions[${index}]${a?.id ? ` (${a.id})` : ''}`;
    if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id)) problems.push(`${at}: id`);
    if (ids.has(a.id)) problems.push(`${at}: duplicate id`);
    ids.add(a.id);
    for (const field of ['doc', 'anchor', 'claim'] as const) {
      if (typeof a[field] !== 'string' || a[field] === '') problems.push(`${at}: ${field} missing`);
    }
    if (!METHODS.includes(a.method))
      problems.push(`${at}: method must be one of ${METHODS.join(', ')}`);
    if (a.evaluation !== 'live' && a.evaluation !== 'historical') {
      problems.push(`${at}: evaluation must be live or historical`);
    }
    if (
      a.evaluation === 'historical' &&
      a.method !== 'gh-api' &&
      !/^[0-9a-f]{7,40}$/.test(a.asOf ?? '')
    ) {
      problems.push(`${at}: a historical ${a.method} assertion needs asOf, a commit SHA`);
    }
    if (a.evaluation === 'historical' && a.method === 'gh-api' && !a.supersededBy) {
      problems.push(`${at}: a historical gh-api assertion needs supersededBy`);
    }
    if (typeof a.check !== 'object' || a.check === null) problems.push(`${at}: check missing`);
  }
  return problems;
}

// -------------------------------------------------------------------------------------------------

function run(root: string, manifest: Manifest, skipRequires: Set<string>): Result[] {
  const docs = new Map<string, string | null>();
  return manifest.assertions.map((assertion) => {
    if (!docs.has(assertion.doc)) docs.set(assertion.doc, readAt(root, null, assertion.doc));
    const doc = docs.get(assertion.doc) ?? null;
    const index = doc === null ? -1 : doc.indexOf(assertion.anchor);
    const line = index < 0 || doc === null ? null : doc.slice(0, index).split('\n').length;
    const base = {
      id: assertion.id,
      doc: assertion.doc,
      line,
      method: assertion.method,
      evaluation: assertion.evaluation,
      claim: assertion.claim,
    };
    if (line === null) {
      return {
        ...base,
        status: 'stale' as const,
        claimed: assertion.anchor,
        actual: doc === null ? `${assertion.doc} does not exist` : 'anchor not found in the doc',
        detail: 'the manifest entry no longer matches the doc; update or remove it',
      };
    }
    if (
      assertion.requires &&
      skipRequires.has(assertion.requires) &&
      assertion.evaluation === 'live'
    ) {
      return {
        ...base,
        status: 'skipped' as const,
        claimed: assertion.check.equals ?? null,
        actual: null,
        detail: `needs ${assertion.requires} access, skipped by --skip-requires`,
      };
    }
    try {
      const [holds, claimed, actual, detail] =
        assertion.method === 'gh-api'
          ? ghCheck(root, manifest.repository, assertion)
          : assertion.method === 'file-line'
            ? fileLine(root, assertion)
            : assertion.method === 'config-value'
              ? configValue(root, assertion)
              : command(root, assertion);
      const at =
        assertion.evaluation === 'historical' && assertion.asOf ? ` at ${assertion.asOf}` : '';
      return {
        ...base,
        status: holds ? ('pass' as const) : ('drift' as const),
        claimed,
        actual,
        detail: `${detail}${at}`,
      };
    } catch (error) {
      if (!(error instanceof Unrunnable)) throw error;
      return {
        ...base,
        status: 'unrunnable' as const,
        claimed: null,
        actual: null,
        detail: error.message,
      };
    }
  });
}

function show(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function main(): number {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      manifest: { type: 'string' },
      json: { type: 'boolean', default: false },
      'skip-requires': { type: 'string', multiple: true, default: [] },
      only: { type: 'string', multiple: true, default: [] },
      'no-coverage': { type: 'boolean', default: false },
    },
  });
  const root = resolve(
    values.root ??
      execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(),
  );
  const manifestPath = resolve(root, values.manifest ?? 'docs/drift-manifest.json');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  } catch (error) {
    console.error(`check-docs-drift: cannot read ${manifestPath}: ${(error as Error).message}`);
    return 2;
  }
  const problems = validate(manifest);
  if (problems.length > 0) {
    console.error(`check-docs-drift: invalid manifest ${relative(root, manifestPath)}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    return 2;
  }
  const only = new Set(values.only);
  if (only.size > 0) manifest.assertions = manifest.assertions.filter((a) => only.has(a.id));
  const results = run(root, manifest, new Set(values['skip-requires']));
  const missing = values['no-coverage'] || only.size > 0 ? [] : uncatalogued(root, manifest);

  const count = (status: Status) => results.filter((r) => r.status === status).length;
  const summary = {
    assertions: results.length,
    pass: count('pass'),
    drift: count('drift'),
    stale: count('stale'),
    uncatalogued: missing.length,
    skipped: count('skipped'),
    unrunnable: count('unrunnable'),
  };

  if (values.json) {
    const findings = results.filter((r) => r.status !== 'pass');
    console.log(JSON.stringify({ summary, findings, uncatalogued: missing }, null, 2));
  } else {
    console.log(
      `docs drift: ${summary.assertions} assertions, ${summary.pass} hold, ${summary.drift} drift, ` +
        `${summary.stale} stale, ${summary.uncatalogued} uncatalogued, ${summary.skipped} skipped, ` +
        `${summary.unrunnable} could not run`,
    );
    for (const r of results.filter((result) => result.status !== 'pass')) {
      console.log(
        `\n${r.status.toUpperCase()}  ${r.id}  ${r.doc}:${r.line ?? '?'}  ${r.method} (${r.evaluation})`,
      );
      console.log(`  claim:   ${r.claim}`);
      if (r.claimed !== null) console.log(`  claimed: ${show(r.claimed)}`);
      if (r.actual !== null) console.log(`  actual:  ${show(r.actual)}`);
      if (r.detail) console.log(`  ${r.detail}`);
    }
    for (const token of missing) {
      console.log(`\nUNCATALOGUED  ${token.doc}:${token.line}  ${token.kind} ${token.token}`);
    }
  }

  if (summary.unrunnable > 0) return 2;
  return summary.drift + summary.stale + summary.uncatalogued > 0 ? 1 : 0;
}

if (resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname)) {
  process.exitCode = main();
}
