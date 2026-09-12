// Guard for the refusals recorded in the AI discoverability policy ADR. Run with `pnpm test:scripts`
// (node:test, no dependency), which is already a step in the CI `quality` job, so this file needs no
// workflow entry and no package.json script of its own.
//
// The record lists mechanisms that were considered and refused, each with the source that settles it.
// A refusal is worth nothing if undoing it is silent: the next well-meaning article about ranking in
// answer engines recommends `ai.txt`, `llms-full.txt` and a `FAQPage` block, all three are minutes of
// work, and none of them leaves a trace anyone reviews. So each refused artefact has an assertion
// here, and each assertion answers to a row in the record's table — the failure message quotes the
// row, so whoever meets it meets the evidence rather than a bare path.
//
// Two rules this file lives by. It never passes because it could not see: a missing tree, a record it
// cannot find, a table it cannot parse and a row without a source or a date are all failures. And it
// checks only what a string-and-path check can honestly check — the Wikidata row has no assertion,
// because that act would happen on another site, and the record says so.
//
// Adding one of these mechanisms later is a deliberate act: supersede the record under the rules in
// docs/adr/0012-correcting-accepted-records.md, and delete the matching assertion in the same PR.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const WEB = 'apps/web';
const RECORD_SUFFIX = '-ai-discoverability-policy.md';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Build output and installed packages are not decisions; everything else under apps/web is. */
const SKIPPED_DIRS = new Set([
  'node_modules',
  '.next',
  '.next-e2e',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
]);

/** Extensions the string scan reads. A binary file cannot carry a schema.org type. */
const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.md',
  '.mdx',
  '.txt',
  '.html',
  '.svg',
]);

function requireTree(relative) {
  const absolute = join(repoRoot, relative);
  if (!existsSync(absolute)) {
    throw new Error(`${relative} is missing, so this guard cannot see what it is meant to check`);
  }
  return absolute;
}

function requireFile(relative) {
  const absolute = join(repoRoot, relative);
  try {
    return readFileSync(absolute, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${relative}, so this guard cannot check it: ${error.message}`);
  }
}

/** Every path under `relative`, files and directories alike, as repository-relative paths. */
function walk(relative) {
  const entries = [];
  const descend = (absolute, prefix) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) continue;
      const path = `${prefix}/${entry.name}`;
      entries.push({ path, directory: entry.isDirectory() });
      if (entry.isDirectory()) descend(join(absolute, entry.name), path);
    }
  };
  descend(requireTree(relative), relative);
  return entries;
}

// --- The record -------------------------------------------------------------------------------

function findRecord() {
  const dir = 'docs/adr';
  const names = readdirSync(requireTree(dir)).filter((name) => name.endsWith(RECORD_SUFFIX));
  if (names.length !== 1) {
    throw new Error(
      `expected exactly one docs/adr/NNNN${RECORD_SUFFIX}, found ${names.length}: ${names.join(', ') || 'none'}`,
    );
  }
  const path = `${dir}/${names[0]}`;
  return { path, text: requireFile(path) };
}

/** The refusal table, found by its header rather than by a line number or a section title. */
function readRefusalTable({ path, text }) {
  const lines = text.split('\n');
  const header = lines.findIndex(
    (line) =>
      line.startsWith('|') &&
      /\bMechanism\b/.test(line) &&
      /\bWhy not\b/.test(line) &&
      /\bSource\b/.test(line) &&
      /\bDate\b/.test(line),
  );
  if (header === -1) {
    throw new Error(`${path} has no "Mechanism | Why not | Source | Date" table to check against`);
  }
  const cellsOf = (line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
  if (!/^\|[\s|:-]+\|$/.test(lines[header + 1] ?? '')) {
    throw new Error(`${path}:${header + 2} is not the delimiter row of the refusal table`);
  }
  const rows = [];
  for (let index = header + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const cells = cellsOf(lines[index]);
    if (cells.length !== 4) {
      throw new Error(`${path}:${index + 1} has ${cells.length} cells, expected 4`);
    }
    rows.push({
      line: index + 1,
      mechanism: cells[0],
      why: cells[1],
      source: cells[2],
      date: cells[3],
    });
  }
  if (rows.length === 0) throw new Error(`${path} has an empty refusal table`);
  return rows;
}

const record = findRecord();
const rows = readRefusalTable(record);

/**
 * Every mechanism the record refuses, keyed by a string that appears in exactly one Mechanism cell.
 * `Wikidata` is here without an assertion on purpose; the record explains why.
 */
const MECHANISMS = [
  'llms-full.txt',
  'FAQPage',
  'HowTo',
  'speakable',
  'SearchAction',
  'ai.txt',
  'TDMRep',
  'Content-Signals',
  'ai-plugin.json',
  'agents.json',
  'JSON Resume',
  'WebMCP',
  'agent-skills',
  'IndexNow',
  'Wikidata',
  'allowlist',
  'nonce',
  'AGENTS.md',
  'middleware.ts',
];

const rowFor = (key) => rows.filter((row) => row.mechanism.includes(key));

function refusal(key, found) {
  const row = rowFor(key)[0];
  const where = row
    ? `${record.path}:${row.line} refuses ${row.mechanism} — ${row.why} (source: ${row.source}, ${row.date})`
    : `${record.path} has no row for ${key}`;
  return `${found.join(', ')}\n\n${where}\n\nUndoing a refusal means superseding that record and deleting this assertion in the same pull request.`;
}

// --- What each refusal looks like on disk ------------------------------------------------------

const webTree = walk(WEB);
const sources = walk(`${WEB}/src`).filter(
  (entry) => !entry.directory && SCANNED_EXTENSIONS.has(extname(entry.path)),
);

/** A file or a route-handler directory carrying one of these names, anywhere under apps/web. */
const anySegment =
  (...names) =>
  () =>
    webTree
      .filter((entry) => entry.path.split('/').some((part) => names.includes(part)))
      .map((entry) => entry.path);

const inPublic =
  (...names) =>
  () =>
    webTree
      .filter(
        (entry) => entry.path.startsWith(`${WEB}/public/`) && names.includes(basename(entry.path)),
      )
      .map((entry) => entry.path);

/**
 * A directory under the app router carrying one of these names. `app/AGENTS.md/route.ts` serves
 * `/AGENTS.md` just as a file in `public/` does. Only directories count, so a Markdown note that is
 * not a route segment stays silent, and so does an un-served `apps/web/AGENTS.md`, which is the
 * repository hygiene the record's row permits.
 */
const routeDirectory =
  (...names) =>
  () =>
    webTree
      .filter(
        (entry) =>
          entry.directory &&
          [`${WEB}/app/`, `${WEB}/src/app/`].some((root) => entry.path.startsWith(root)) &&
          names.includes(basename(entry.path)),
      )
      .map((entry) => entry.path);

const exactly =
  (...paths) =>
  () =>
    paths.filter((path) => existsSync(join(repoRoot, path)));

/** A literal string anywhere under apps/web/src. Case-sensitive, which is what keeps it precise. */
const stringUnderSrc = (needle) => () =>
  sources
    .filter((entry) => requireFile(entry.path).includes(needle))
    .map((entry) => `${entry.path} contains "${needle}"`);

/**
 * A case-insensitive name anywhere under apps/web. IndexNow's own artefact is a key file whose name
 * is unpredictable, so what this catches is the code that would submit to it, not the key.
 */
const nameUnderWeb = (needle) => () => {
  const lowered = needle.toLowerCase();
  return webTree
    .filter((entry) => !entry.directory && SCANNED_EXTENSIONS.has(extname(entry.path)))
    .filter((entry) => requireFile(entry.path).toLowerCase().includes(lowered))
    .map((entry) => `${entry.path} mentions "${needle}"`);
};

const robotsPath = `${WEB}/src/app/robots.ts`;
const configPath = `${WEB}/next.config.ts`;

const occurrences = (text, needle) => text.split(needle).length - 1;

const CHECKS = [
  { key: 'llms-full.txt', find: anySegment('llms-full.txt') },
  { key: 'ai.txt', find: anySegment('ai.txt') },
  { key: 'TDMRep', find: anySegment('tdmrep.json') },
  { key: 'ai-plugin.json', find: anySegment('ai-plugin.json') },
  { key: 'agents.json', find: anySegment('agents.json') },
  { key: 'JSON Resume', find: anySegment('cv.json', 'resume.json') },
  { key: 'agent-skills', find: anySegment('agent-skills') },
  { key: 'IndexNow', find: nameUnderWeb('indexnow') },
  {
    key: 'AGENTS.md',
    find: () => [
      ...inPublic('AGENTS.md', 'agents.md')(),
      ...routeDirectory('AGENTS.md', 'agents.md')(),
    ],
  },
  {
    key: 'middleware.ts',
    find: exactly(
      `${WEB}/middleware.ts`,
      `${WEB}/middleware.js`,
      `${WEB}/proxy.ts`,
      `${WEB}/proxy.js`,
      `${WEB}/src/middleware.ts`,
      `${WEB}/src/middleware.js`,
      `${WEB}/src/proxy.ts`,
      `${WEB}/src/proxy.js`,
    ),
  },
  { key: 'FAQPage', find: stringUnderSrc('FAQPage') },
  { key: 'HowTo', find: stringUnderSrc('HowTo') },
  { key: 'speakable', find: stringUnderSrc('speakable') },
  { key: 'SearchAction', find: stringUnderSrc('SearchAction') },
  {
    key: 'SearchAction',
    label: 'SearchAction (potentialAction)',
    find: stringUnderSrc('potentialAction'),
  },
  { key: 'WebMCP', find: stringUnderSrc('modelContext') },
  {
    key: 'Content-Signals',
    find: () => {
      const text = requireFile(robotsPath);
      return occurrences(text, 'Content-Signal') > 0 ? [`${robotsPath} sets a Content-Signal`] : [];
    },
  },
  {
    key: 'allowlist',
    find: () => {
      const groups = occurrences(requireFile(robotsPath), 'userAgent');
      return groups > 1 ? [`${robotsPath} declares ${groups} userAgent groups, expected one`] : [];
    },
  },
  {
    key: 'nonce',
    find: () => {
      const text = requireFile(configPath);
      return text.includes('nonce') ? [`${configPath} mentions a nonce`] : [];
    },
  },
];

// --- Tests ------------------------------------------------------------------------------------

describe('the AI discoverability policy record', () => {
  it('names every mechanism this guard checks', () => {
    const unrecorded = [...new Set(CHECKS.map((check) => check.key))].filter(
      (key) => !MECHANISMS.includes(key),
    );
    assert.deepEqual(unrecorded, [], 'every assertion must answer to a mechanism in the record');
  });

  it('has exactly one refusal row per mechanism', () => {
    const wrong = MECHANISMS.map((key) => [key, rowFor(key).length]).filter(
      ([, count]) => count !== 1,
    );
    assert.deepEqual(
      wrong,
      [],
      `${record.path}: each mechanism needs one row, matched by name. A row that was removed is a refusal that was dropped without superseding the record.`,
    );
  });

  it('carries a source URL on every row', () => {
    const missing = rows
      .filter((row) => !/https?:\/\/\S+/.test(row.source))
      .map((row) => `${record.path}:${row.line} (${row.mechanism})`);
    assert.deepEqual(missing, [], 'a refusal without a source is an opinion');
  });

  it('carries an ISO date on every row', () => {
    const missing = rows
      .filter((row) => !ISO_DATE.test(row.date))
      .map((row) => `${record.path}:${row.line} (${row.mechanism}) has date "${row.date}"`);
    assert.deepEqual(missing, [], 'a source with no date cannot be re-checked');
  });

  it('says why the Wikidata row has no assertion', () => {
    assert.equal(
      CHECKS.some((check) => check.key === 'Wikidata'),
      false,
      'an off-site act cannot be checked from this repository',
    );
    assert.match(rowFor('Wikidata')[0].why, /off-site/);
  });
});

describe('mechanisms the record refuses are still absent', () => {
  for (const check of CHECKS) {
    it(`${check.label ?? check.key}: nothing reintroduces it`, () => {
      const found = check.find();
      assert.equal(found.length, 0, refusal(check.key, found));
    });
  }
});
