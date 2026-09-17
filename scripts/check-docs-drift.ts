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
//   2  a check could not run (gh unauthenticated, a 5xx after retries, a missing commit), the
//      manifest itself is invalid, the command line is (an unknown flag, an --only id that names
//      no assertion), or the checker failed in any other way. Takes precedence over 1; the report
//      still lists the drift. Nothing that goes wrong inside the checker exits 1.
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
    if (!existsSync(full)) return null;
    try {
      return readFileSync(full, 'utf8');
    } catch (error) {
      throw new Unrunnable(`cannot read ${path}: ${(error as Error).message}`);
    }
  }
  // Tell "the commit is not here" (unrunnable) from "the file was not there" (a finding).
  ensureCommit(root, ref);
  const exists = spawnSync('git', ['-C', root, 'cat-file', '-e', `${ref}:${path}`]);
  if (exists.status !== 0) return null;
  return git(root, ['show', `${ref}:${path}`]);
}

const fetchAttempted = new Set<string>();

/**
 * Makes sure a commit an assertion is read at is present. A commit that only ever lived on a
 * squash-merged branch is on no remote ref, so even a full clone lacks it, while GitHub still
 * serves it by its full SHA. Fetch it once, and without `--depth`, which would make a developer's
 * clone shallow.
 */
function ensureCommit(root: string, ref: string): void {
  const present = () =>
    spawnSync('git', ['-C', root, 'cat-file', '-e', `${ref}^{commit}`]).status === 0;
  if (present()) return;
  if (!fetchAttempted.has(ref)) {
    fetchAttempted.add(ref);
    spawnSync('git', ['-C', root, 'fetch', '--quiet', '--no-tags', 'origin', ref], {
      timeout: 120_000,
    });
    if (present()) return;
  }
  throw new Unrunnable(`commit ${ref} is not in this clone, and fetching it from origin failed`);
}

function refFor(assertion: Assertion): string | null {
  return assertion.evaluation === 'historical' ? (assertion.asOf ?? null) : null;
}

// -------------------------------------------------------------------------------------------------
// The four methods. Each returns [holds, claimed, actual, detail] or throws Unrunnable.

type Outcome = [boolean, unknown, unknown, string];

/** The number of lines in a file, not counting the empty string after a final newline. */
function lineCount(text: string): number {
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

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
  const where =
    lineEnd === check.line ? `${path}:${check.line}` : `${path}:${check.line}-${lineEnd}`;
  const lines = lineCount(text);
  // A cited line past the end of the file is a wrong citation, whatever the expectation says: an
  // empty span would otherwise satisfy `absent`.
  if (lineEnd > lines) {
    return [false, `${where} exists`, `${path} has ${lines} lines`, where];
  }
  const span = lineSpan(text, check.line, lineEnd);
  const [holds, claimed] = expectText(span, check);
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
// Overridable so the tests do not sleep through real backoff. Anything but a finite, non-negative
// number falls back to the default: Atomics.wait with NaN would block forever.
const backoffRaw = Number(process.env.DOCS_DRIFT_GH_BACKOFF_MS ?? 1000);
const backoffMs = Number.isFinite(backoffRaw) && backoffRaw >= 0 ? backoffRaw : 1000;

/**
 * Whether a failed `gh api` call is worth another attempt: GitHub's intermittent server errors and
 * rate limiting (HTTP 5xx, 429), or a network failure that never got an HTTP status at all. Any
 * other HTTP status (401, 403, 404, 422, ...) is an answer, and asking again changes nothing.
 */
export function retryable(stderr: string, spawnErrorCode?: string): boolean {
  if (spawnErrorCode === 'ETIMEDOUT') return true;
  const status = /\(HTTP (\d{3})\)|\bHTTP (\d{3})\b/.exec(stderr);
  if (status) return /^(5\d\d|429)$/.test(status[1] ?? status[2]);
  return /timeout|timed out|connection reset|unexpected EOF/i.test(stderr);
}

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
    const code = (run.error as NodeJS.ErrnoException | undefined)?.code;
    if (run.error && code !== 'ETIMEDOUT') {
      throw new Unrunnable(`gh api ${path}: ${run.error.message}`);
    }
    if (!run.error && run.status === 0) {
      try {
        return JSON.parse(run.stdout);
      } catch {
        throw new Unrunnable(`gh api ${path} printed something that is not JSON: ${run.stdout}`);
      }
    }
    lastError = run.error ? `timed out after 30 s` : (run.stderr ?? '').trim();
    if (!retryable(run.stderr ?? '', code)) break;
    if (attempt < GH_ATTEMPTS) sleep(backoffMs * 2 ** (attempt - 1));
  }
  throw new Unrunnable(`gh api ${path}: ${lastError || 'failed'}`);
}

function ghCheck(root: string, repository: string, assertion: Assertion): Outcome {
  if (assertion.evaluation === 'historical') return adrChain(root, assertion);
  const check = assertion.check;
  const actual = ghApi(repository, String(check.endpoint), String(check.jq));
  // Without admin rights GitHub leaves admin-only fields out of the response instead of refusing,
  // so jq yields null: that is a check that could not run, not a setting that changed.
  if (assertion.requires === 'admin' && actual === null) {
    throw new Unrunnable(
      `gh api ${String(check.endpoint)} returned null for an admin-only field: this token has no ` +
        `admin access (use the owner's token, or pass --skip-requires admin)`,
    );
  }
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
  let names: string[];
  try {
    names = readdirSync(join(root, 'docs/adr'));
  } catch (error) {
    throw new Unrunnable(`cannot list docs/adr: ${(error as Error).message}`);
  }
  const successor = names.find((name) => name.startsWith(`${by}-`));
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

// An inline link's destination, bare or in <angle brackets>, with an optional title after it.
const LINK = /\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
// A link reference definition: `[label]: destination`.
const REFERENCE = /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/;
// `path/file.ext:12` or `:12-20`. Directories may start with a dot (`.github/`); the file needs one
// of these extensions, so `host:3000` and extensionless files such as `.husky/pre-commit` are not
// citations.
const CITATION = new RegExp(
  String.raw`(?<![\w/.-])((?:\.{1,2}\/|\.?[\w@-]+\/)*[\w@.[\]-]+` +
    String.raw`\.(?:tsx?|mjs|cjs|js|json|ya?ml|md|css|sh)):(\d+(?:-\d+)?)\b`,
  'g',
);
const INLINE_CODE = /`([^`\n]+)`/g;
// A fence opens with three or more backticks or tildes and closes with a run of the same
// character at least as long (CommonMark), so a ```` fence can hold ``` lines.
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

function markdownFiles(root: string, dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  try {
    return readdirSync(full, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => relative(root, join(entry.parentPath, entry.name)))
      .sort();
  } catch (error) {
    throw new Unrunnable(`cannot list the coverage root ${dir}: ${(error as Error).message}`);
  }
}

function linkTarget(raw: string): string {
  return raw.startsWith('<') ? raw.slice(1, -1) : raw;
}

/**
 * The package script a backticked command runs, as a coverage token, or null when it is not a
 * `pnpm` script. Recognised: leading `NAME=value` assignments, `--filter <pkg>`, `--filter=<pkg>`,
 * `-F <pkg>`, `-r` / `--recursive`, and `run <script>`.
 */
export function scriptToken(code: string, pnpmBuiltins: readonly string[]): string | null {
  const words = code.trim().split(/\s+/);
  let at = 0;
  while (at < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at])) at += 1;
  if (words[at] !== 'pnpm') return null;
  at += 1;
  let pkg = '.';
  let recursive = false;
  for (;;) {
    const word = words[at];
    if ((word === '--filter' || word === '-F') && words[at + 1]) {
      pkg = words[at + 1];
      at += 2;
    } else if (word?.startsWith('--filter=') && word.length > '--filter='.length) {
      pkg = word.slice('--filter='.length);
      at += 1;
    } else if (word === '-r' || word === '--recursive') {
      recursive = true;
      at += 1;
    } else {
      break;
    }
  }
  if (words[at] === 'run') at += 1;
  const name = words[at];
  if (!name || name.startsWith('-') || pnpmBuiltins.includes(name)) return null;
  if (recursive) return `-r ${name}`;
  return pkg === '.' ? name : `${pkg} ${name}`;
}

export function tokensIn(doc: string, text: string, pnpmBuiltins: readonly string[]): Token[] {
  const tokens: Token[] = [];
  let fence: string | null = null;
  text.split('\n').forEach((content, index) => {
    const line = index + 1;
    const marker = FENCE.exec(content);
    if (marker) {
      const run = marker[1];
      if (fence === null) {
        // A backtick fence's info string may not contain a backtick.
        if (!(run[0] === '`' && marker[2].includes('`'))) {
          fence = run;
          return;
        }
      } else if (run[0] === fence[0] && run.length >= fence.length && marker[2].trim() === '') {
        fence = null;
        return;
      }
    }
    for (const match of content.matchAll(LINK)) {
      const target = linkTarget(match[1]);
      if (target === '' || /^(?:[a-z]+:|#)/i.test(target)) continue;
      tokens.push({ doc, line, kind: 'link', token: target });
    }
    const reference = fence === null ? REFERENCE.exec(content) : null;
    if (reference) {
      const target = linkTarget(reference[1]);
      if (target !== '' && !/^(?:[a-z]+:|#)/i.test(target)) {
        tokens.push({ doc, line, kind: 'link', token: target });
      }
    }
    for (const match of content.matchAll(CITATION)) {
      tokens.push({ doc, line, kind: 'citation', token: `${match[1]}:${match[2]}` });
    }
    if (fence !== null) return;
    for (const match of content.matchAll(INLINE_CODE)) {
      const token = scriptToken(match[1], pnpmBuiltins);
      if (token !== null) tokens.push({ doc, line, kind: 'script', token });
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

/** A repository-relative path that stays inside the checkout: no absolute path, no `..`. */
function insideRoot(path: unknown): boolean {
  if (typeof path !== 'string' || path === '' || path.startsWith('/') || path.includes('\\')) {
    return false;
  }
  return !normalize(path)
    .split('/')
    .some((segment) => segment === '..');
}

function compiles(pattern: unknown, flags: string): boolean {
  try {
    new RegExp(String(pattern), flags);
    return true;
  } catch {
    return false;
  }
}

const nonEmpty = (value: unknown) => typeof value === 'string' && value !== '';
const positiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) >= 1;

/** What each method's `check` must look like; one message per problem. */
function checkProblems(a: Assertion): string[] {
  const check = a.check;
  const problems: string[] = [];
  const has = (key: string) => Object.hasOwn(check, key);
  if (a.method === 'file-line') {
    if (!insideRoot(check.path)) problems.push('check.path must be a path inside the repository');
    const expectations = ['contains', 'matches', 'absent'].filter(has);
    if (expectations.length > 1) problems.push('check takes one of contains, matches, absent');
    for (const key of expectations) {
      if (!nonEmpty(check[key])) problems.push(`check.${key} must be a non-empty string`);
    }
    if (has('matches') && !compiles(check.matches, 'm')) {
      problems.push('check.matches is not a valid regular expression');
    }
    if (has('exists') && check.exists !== false) problems.push('check.exists can only be false');
    if (has('line') && !positiveInteger(check.line)) {
      problems.push('check.line must be a positive integer');
    }
    if (has('lineEnd')) {
      const end = check.lineEnd as number;
      if (!has('line')) problems.push('check.lineEnd needs check.line');
      else if (!positiveInteger(end) || end < (check.line as number)) {
        problems.push('check.lineEnd must be an integer no smaller than check.line');
      }
    }
  } else if (a.method === 'config-value') {
    if (!insideRoot(check.file)) problems.push('check.file must be a path inside the repository');
    const sources = ['json', 'regex', 'text'].filter(has);
    if (sources.length !== 1) problems.push('check needs exactly one of json, regex, text');
    if (has('json') && typeof check.json !== 'string') problems.push('check.json must be a string');
    if (has('regex') && (!nonEmpty(check.regex) || !compiles(check.regex, 'gm'))) {
      problems.push('check.regex must be a valid, non-empty regular expression');
    }
    if (has('text') && check.text !== true) problems.push('check.text can only be true');
    if (has('equals') === has('equalsAll')) {
      problems.push('check needs exactly one of equals, equalsAll');
    }
    if (has('equalsAll') && !has('regex')) problems.push('check.equalsAll needs check.regex');
  } else if (a.method === 'command') {
    if (!nonEmpty(check.script)) problems.push('check.script must be a non-empty string');
    if (has('package') && !insideRoot(check.package)) {
      problems.push('check.package must be a path inside the repository');
    }
    if (has('runs') && !nonEmpty(check.runs)) problems.push('check.runs must be non-empty');
  } else if (a.method === 'gh-api' && a.evaluation === 'live') {
    // An endpoint is one positional argument to `gh api`: never an option, never a URL.
    if (!nonEmpty(check.endpoint) || !/^[A-Za-z0-9{}_.\/?=&%,-]+$/.test(String(check.endpoint))) {
      problems.push('check.endpoint must be an API path such as repos/{repo}/pulls/1');
    } else if (String(check.endpoint).startsWith('-')) {
      problems.push('check.endpoint must not start with "-"');
    }
    if (!nonEmpty(check.jq)) problems.push('check.jq must be a non-empty string');
    // gh evaluates the filter with jq's `env` and `$ENV`, which hold GH_TOKEN, and the checker
    // prints what the filter returns. A manifest edited by the drift agent must not be able to put
    // a token into the report or the pull request body built from it.
    else if (/\benv\b|\$ENV\b/.test(String(check.jq))) {
      problems.push('check.jq must not read the environment (env, $ENV)');
    }
    if (!has('equals')) problems.push('check.equals is missing');
  }
  return problems;
}

function validate(manifest: Manifest): string[] {
  const problems: string[] = [];
  if (manifest === null || typeof manifest !== 'object') return ['the manifest must be an object'];
  if (manifest.schemaVersion !== 1) problems.push(`schemaVersion must be 1`);
  if (typeof manifest.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(manifest.repository)) {
    problems.push(`repository must be "owner/name"`);
  }
  const coverage = manifest.rules?.coverage;
  if (!Array.isArray(coverage?.roots) || !coverage.roots.every(insideRoot)) {
    problems.push(`rules.coverage.roots must list paths inside the repository`);
  }
  if (!Array.isArray(coverage?.pnpmBuiltins)) problems.push(`rules.coverage.pnpmBuiltins missing`);
  if (!Array.isArray(manifest.assertions)) return [...problems, 'assertions must be an array'];
  const ids = new Set<string>();
  for (const [index, a] of manifest.assertions.entries()) {
    if (a === null || typeof a !== 'object') {
      problems.push(`assertions[${index}]: must be an object`);
      continue;
    }
    const at = `assertions[${index}]${a?.id ? ` (${a.id})` : ''}`;
    if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id)) problems.push(`${at}: id`);
    if (ids.has(a.id)) problems.push(`${at}: duplicate id`);
    ids.add(a.id);
    for (const field of ['doc', 'anchor', 'claim'] as const) {
      if (typeof a[field] !== 'string' || a[field].trim() === '') {
        problems.push(`${at}: ${field} missing`);
      }
    }
    if (typeof a.doc === 'string' && a.doc !== '' && !insideRoot(a.doc)) {
      problems.push(`${at}: doc must be a path inside the repository`);
    }
    if (!METHODS.includes(a.method))
      problems.push(`${at}: method must be one of ${METHODS.join(', ')}`);
    if (a.evaluation !== 'live' && a.evaluation !== 'historical') {
      problems.push(`${at}: evaluation must be live or historical`);
    }
    if (
      a.evaluation === 'historical' &&
      a.method !== 'gh-api' &&
      !/^[0-9a-f]{40}$/.test(a.asOf ?? '')
    ) {
      problems.push(
        `${at}: a historical ${a.method} assertion needs asOf, a full 40-character commit SHA`,
      );
    }
    if (a.evaluation === 'historical' && a.method === 'gh-api' && !a.supersededBy) {
      problems.push(`${at}: a historical gh-api assertion needs supersededBy`);
    }
    if (a.requires !== undefined && a.requires !== 'admin') {
      problems.push(`${at}: requires can only be "admin"`);
    }
    if (typeof a.check !== 'object' || a.check === null || Array.isArray(a.check)) {
      problems.push(`${at}: check missing`);
      continue;
    }
    for (const problem of checkProblems(a)) problems.push(`${at}: ${problem}`);
  }
  return problems;
}

// -------------------------------------------------------------------------------------------------

/**
 * Where an anchor starts in a doc, or -1. Runs of whitespace match any run of whitespace, so
 * Prettier re-padding a table or re-wrapping a paragraph does not make an entry stale; any other
 * change to the anchored text does.
 */
function findAnchor(doc: string, anchor: string): number {
  const pattern = anchor
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return doc.search(new RegExp(pattern));
}

function run(root: string, manifest: Manifest, skipRequires: Set<string>): Result[] {
  const docs = new Map<string, string | null>();
  return manifest.assertions.map((assertion) => {
    if (!docs.has(assertion.doc)) docs.set(assertion.doc, readAt(root, null, assertion.doc));
    const doc = docs.get(assertion.doc) ?? null;
    const index = doc === null ? -1 : findAnchor(doc, assertion.anchor);
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
  if (value === undefined) return 'undefined';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const REQUIRES = ['admin'];

class UsageError extends Error {}

function main(): number {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        root: { type: 'string' },
        manifest: { type: 'string' },
        json: { type: 'boolean', default: false },
        'skip-requires': { type: 'string', multiple: true, default: [] },
        only: { type: 'string', multiple: true, default: [] },
        'no-coverage': { type: 'boolean', default: false },
        'validate-only': { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  for (const value of values['skip-requires']) {
    if (!REQUIRES.includes(value)) {
      throw new UsageError(`--skip-requires takes ${REQUIRES.join(', ')}, not "${value}"`);
    }
  }
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
  if (values['validate-only']) {
    console.log(`check-docs-drift: ${manifest.assertions.length} assertions, manifest valid`);
    return 0;
  }
  const only = new Set(values.only);
  if (only.size > 0) {
    const known = new Set(manifest.assertions.map((a) => a.id));
    const unknown = [...only].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new UsageError(`--only names no assertion with the id ${unknown.join(', ')}`);
    }
    manifest.assertions = manifest.assertions.filter((a) => only.has(a.id));
  }
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
      `docs drift: ${summary.assertions} assertions, ${summary.pass} hold, ` +
        `${summary.drift} drift, ${summary.stale} stale, ${summary.uncatalogued} uncatalogued, ` +
        `${summary.skipped} skipped, ${summary.unrunnable} could not run`,
    );
    for (const r of results.filter((result) => result.status !== 'pass')) {
      const where = `${r.doc}:${r.line ?? '?'}`;
      console.log(`\n${r.status.toUpperCase()}  ${r.id}  ${where}  ${r.method} (${r.evaluation})`);
      console.log(`  claim:   ${r.claim}`);
      // A drift always shows both sides, a null actual included; the other statuses have no
      // actual value to show.
      if (r.status === 'drift' || r.claimed !== null) console.log(`  claimed: ${show(r.claimed)}`);
      if (r.status === 'drift' || r.actual !== null) console.log(`  actual:  ${show(r.actual)}`);
      if (r.detail) console.log(`  ${r.detail}`);
    }
    for (const token of missing) {
      console.log(`\nUNCATALOGUED  ${token.doc}:${token.line}  ${token.kind} ${token.token}`);
    }
  }

  if (summary.unrunnable > 0) return 2;
  return summary.drift + summary.stale + summary.uncatalogued > 0 ? 1 : 0;
}

/** Exit 2 for anything that goes wrong inside the checker, so no failure can pass for drift. */
export function exitCode(body: () => number): number {
  try {
    return body();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = error instanceof UsageError ? 'usage' : 'could not run';
    console.error(`check-docs-drift: ${kind}: ${message}`);
    return 2;
  }
}

if (resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname)) {
  process.exitCode = exitCode(main);
}
