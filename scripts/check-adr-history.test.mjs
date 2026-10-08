// Tests for the ADR history check. Run with `pnpm test:scripts` (node:test, no dependency).
//
// ADR 0012 freezes two things a single tree cannot show being broken: an accepted record's
// `## Decision`, and the entries already under its `## Corrections`. So every case here builds a
// real git repository in a temporary directory, commits a base set of records, changes them, and
// runs the real script with that repository as its working directory, the way CI runs it in a
// checkout. Each rule gets a change it must refuse and one it must let through, because a check
// that has only ever been seen passing may be a check that cannot fail. The repositories sign
// nothing (`commit.gpgsign false`), since this machine signs every commit by default.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-adr-history.mjs');

const DECISION = [
  'We keep the widget in one package. It ships with the site and nowhere else, so a reader never',
  'has to look for it.',
  '',
  '- The widget is built once.',
  '- Nothing else imports it.',
].join('\n');

const CORRECTIONS = [
  'Corrections under ADR 0012, oldest first.',
  '',
  '### 2026-09-02',
  '',
  '"The widget is built twice" became "The widget is built once"; see commit abc1234.',
  '',
  '### 2026-09-03: the second one',
  '',
  'The context named the wrong package; `git show abc1234` settles it.',
].join('\n');

/**
 * The text of one record, in the shape ADR 0012 gives every record.
 *
 * @param {{
 *   number: string,
 *   title: string,
 *   status: string,
 *   pointer?: string,
 *   decision?: string,
 *   corrections?: string,
 * }} spec
 * @returns {string}
 */
function record({ number, title, status, pointer, decision = DECISION, corrections }) {
  return [
    `# ${number}. ${title}`,
    '',
    '## Status',
    '',
    status,
    '',
    ...(pointer === undefined ? [] : [pointer, '']),
    '## Date',
    '',
    '2026-09-01',
    '',
    '## Context',
    '',
    'Some context that was true when the record was accepted.',
    '',
    '## Decision',
    '',
    decision,
    '',
    '## Consequences',
    '',
    'Some consequences.',
    '',
    '## Alternatives considered',
    '',
    'Some alternatives.',
    ...(corrections === undefined ? [] : ['', '## Corrections', '', corrections]),
    '',
  ].join('\n');
}

/** The records every case starts from: four protected at the base, two exempt. */
const BASE = new Map([
  ['0001-alpha.md', record({ number: '0001', title: 'Alpha', status: 'Accepted' })],
  [
    '0002-beta.md',
    record({
      number: '0002',
      title: 'Beta',
      status: 'Accepted (corrected 2026-09-03)',
      corrections: CORRECTIONS,
    }),
  ],
  [
    '0003-gamma.md',
    record({
      number: '0003',
      title: 'Gamma',
      status: 'Superseded by ADR-0004',
      pointer: 'Its widget rule no longer applies; see [ADR 0004](0004-delta.md).',
    }),
  ],
  ['0004-delta.md', record({ number: '0004', title: 'Delta', status: 'Accepted' })],
  ['0005-epsilon.md', record({ number: '0005', title: 'Epsilon', status: 'Proposed' })],
  ['0006-zeta.md', record({ number: '0006', title: 'Zeta', status: 'Withdrawn' })],
  ['README.md', '# Architecture decision records\n\nThe index is not this check’s business.\n'],
]);

/** @typedef {import('node:child_process').SpawnSyncReturns<string>} Result */

/** @type {string} */
let root;
/** @type {string} */
let repo;
/** @type {string} the commit the base records were written in */
let base;

/**
 * Runs git in `cwd`, the test repository unless another is given.
 *
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {string}
 */
function gitIn(args, cwd = repo) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** @param {...string} args */
const git = (...args) => gitIn(args);

/**
 * A repository on `main` that signs nothing, with a committer of its own.
 *
 * @param {string} dir
 */
function initRepo(dir) {
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  for (const [key, value] of [
    ['user.name', 'test'],
    ['user.email', 'test@example.com'],
    ['commit.gpgsign', 'false'],
  ]) {
    gitIn(['config', key, value], dir);
  }
}

/** @param {string} name */
const adrPath = (name) => join(repo, 'docs', 'adr', name);
/** @param {string} name */
const read = (name) => readFileSync(adrPath(name), 'utf8');
/**
 * @param {string} name
 * @param {string} text
 */
const write = (name, text) => writeFileSync(adrPath(name), text);

/**
 * Replaces the one occurrence of `from` in a record, failing the test when there is none, so a
 * fixture that drifted cannot turn a case into a no-op.
 *
 * @param {string} name
 * @param {string} from
 * @param {string} to
 */
function edit(name, from, to) {
  const text = read(name);
  assert.ok(text.includes(from), `${name} does not contain ${JSON.stringify(from)}`);
  write(name, text.replace(from, to));
}

/**
 * Commits everything and returns the new commit.
 *
 * @param {string} message
 * @returns {string}
 */
function commit(message) {
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

/**
 * Runs the script as CI does, from inside the repository.
 *
 * @param {string[]} args
 * @param {string} [cwd]
 */
const run = (args, cwd = repo) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

/** @param {string[]} [args] */
const check = (args = []) => run(['--base', base, ...args]);

/**
 * Asserts exit 1 with a problem line naming `docs/adr/<name>` and every fragment.
 *
 * @param {Result} result
 * @param {string} name
 * @param {...string} fragments
 */
function assertProblem(result, name, ...fragments) {
  assert.equal(result.status, 1, `expected exit 1:\n${result.stdout}${result.stderr}`);
  const line = result.stderr
    .split('\n')
    .find((l) => l.includes(`docs/adr/${name}`) && fragments.every((f) => l.includes(f)));
  assert.ok(
    line,
    `no problem names docs/adr/${name} with ${fragments.join(' and ')}:\n${result.stderr}`,
  );
}

/**
 * Asserts exit 0 with the one success line, which names the base and the records compared.
 *
 * @param {Result} result
 * @param {number} [compared] how many records were protected at the base
 * @param {string} [at] the base commit the line must name
 */
function assertPasses(result, compared = 4, at = base) {
  assert.equal(result.status, 0, `expected exit 0:\n${result.stdout}${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim().split('\n').length, 1, result.stdout);
  assert.ok(result.stdout.includes(at), `the line does not name ${at}: ${result.stdout}`);
  assert.match(result.stdout, new RegExp(`\\b${compared} records?\\b`));
}

beforeEach(() => {
  // Resolved, because git reports the physical path of a symlinked tmpdir (macOS /var).
  root = realpathSync(mkdtempSync(join(tmpdir(), 'adr-history-')));
  repo = join(root, 'repo');
  initRepo(repo);
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
  for (const [name, text] of BASE) write(name, text);
  base = commit('docs(adr): the base records');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('a record accepted or superseded at the base', () => {
  it('fails when a sentence of its Decision is edited', () => {
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    const result = check();
    assertProblem(result, '0001-alpha.md', '## Decision');
    assert.match(result.stderr, /so a reader never/, 'quotes the base line');
    assert.match(result.stderr, /so nobody ever/, 'quotes the head line');
  });

  it('fails when the Decision of a record superseded at the base is edited', () => {
    edit('0003-gamma.md', '- Nothing else imports it.', '- Two packages import it.');
    assertProblem(check(), '0003-gamma.md', '## Decision');
  });

  it('fails when text is added to the end of the Decision', () => {
    edit(
      '0004-delta.md',
      '- Nothing else imports it.\n',
      '- Nothing else imports it.\n- Or ever will.\n',
    );
    assertProblem(check(), '0004-delta.md', '## Decision');
  });

  it('fails when an earlier correction is reworded', () => {
    edit('0002-beta.md', 'see commit abc1234.', 'see commit def5678.');
    assertProblem(check(), '0002-beta.md', '## Corrections', '### 2026-09-02', 'reworded');
  });

  it('fails when the last correction is reworded, even with nothing after it', () => {
    edit('0002-beta.md', 'settles it.', 'settles it, and so does the log.');
    assertProblem(check(), '0002-beta.md', '## Corrections', '### 2026-09-03');
  });

  it('fails when a correction is deleted', () => {
    edit(
      '0002-beta.md',
      '### 2026-09-02\n\n"The widget is built twice" became "The widget is built once"; see commit abc1234.\n\n',
      '',
    );
    assertProblem(check(), '0002-beta.md', '## Corrections', '### 2026-09-02', 'removed');
  });

  it('fails when an entry is inserted before the last one', () => {
    edit(
      '0002-beta.md',
      '### 2026-09-03: the second one',
      '### 2026-09-02b\n\nA late addition.\n\n### 2026-09-03: the second one',
    );
    assertProblem(check(), '0002-beta.md', '## Corrections', '### 2026-09-03', 'inserted');
  });

  it('fails when the text above the first correction changes', () => {
    edit('0002-beta.md', 'Corrections under ADR 0012, oldest first.', 'Corrections, newest first.');
    assertProblem(check(), '0002-beta.md', '## Corrections');
  });

  it('fails when the whole Corrections section is removed', () => {
    write(
      '0002-beta.md',
      record({ number: '0002', title: 'Beta', status: 'Accepted (corrected 2026-09-03)' }),
    );
    assertProblem(check(), '0002-beta.md', '## Corrections', 'removed');
  });

  it('fails when the record is deleted', () => {
    unlinkSync(adrPath('0004-delta.md'));
    assertProblem(check(), '0004-delta.md', 'deleted');
  });

  it('fails when its status goes back to Proposed or Withdrawn', () => {
    for (const status of ['Proposed', 'Withdrawn']) {
      write('0001-alpha.md', record({ number: '0001', title: 'Alpha', status }));
      assertProblem(check(), '0001-alpha.md', '## Status', status);
    }
  });

  it('fails when its status at the head cannot be read', () => {
    edit('0001-alpha.md', '\nAccepted\n', '\nAccepted for now\n');
    assertProblem(check(), '0001-alpha.md', '## Status');
  });

  it('fails when the head has no `## Decision`: renamed, removed or fenced', () => {
    const renamed = read('0001-alpha.md').replace('## Decision', '## The decision');
    write('0001-alpha.md', renamed);
    assertProblem(check(), '0001-alpha.md', '## Decision');

    const fenced = BASE.get('0001-alpha.md')
      ?.replace('## Decision', '````text\n## Decision')
      .replace('- Nothing else imports it.\n', '- Nothing else imports it.\n````\n');
    write('0001-alpha.md', fenced ?? '');
    assertProblem(check(), '0001-alpha.md', '## Decision');
  });

  it('fails when the head has two `## Decision` or two `## Corrections` sections', () => {
    edit('0001-alpha.md', '## Consequences', '## Decision\n\nA second one.\n\n## Consequences');
    edit('0002-beta.md', '## Corrections', '## Corrections\n\nEarly.\n\n## Corrections');
    const result = check();
    assertProblem(result, '0001-alpha.md', '## Decision');
    assertProblem(result, '0002-beta.md', '## Corrections');
  });

  it('fails when a code fence at the head never closes', () => {
    edit('0004-delta.md', 'Some consequences.', '```text\nSome consequences.');
    assertProblem(check(), '0004-delta.md', 'fence');
  });

  it('reports every record that broke a rule, not just the first', () => {
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    edit('0003-gamma.md', 'so a reader never', 'so nobody ever');
    unlinkSync(adrPath('0004-delta.md'));
    const result = check();
    assertProblem(result, '0001-alpha.md', '## Decision');
    assertProblem(result, '0003-gamma.md', '## Decision');
    assertProblem(result, '0004-delta.md', 'deleted');
  });
});

describe('a base the check must refuse to trust', () => {
  it('fails on a protected record without a `## Decision`, or with two', () => {
    write(
      '0001-alpha.md',
      BASE.get('0001-alpha.md')?.replace('## Decision', '## The decision') ?? '',
    );
    write(
      '0004-delta.md',
      BASE.get('0004-delta.md')?.replace(
        '## Consequences',
        '## Decision\n\nA second one.\n\n## Consequences',
      ) ?? '',
    );
    base = commit('docs(adr): two records whose Decision cannot be read');
    const result = check();
    assertProblem(result, '0001-alpha.md', '## Decision');
    assertProblem(result, '0004-delta.md', '## Decision');
  });

  it('fails on a status it cannot read, and still compares the other records', () => {
    write(
      '0007-eta.md',
      record({
        number: '0007',
        title: 'Eta',
        status: 'Accepted. The decision stands but has not been carried out.',
      }),
    );
    base = commit('docs(adr): a record whose status is in no form ADR 0012 allows');
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    const result = check();
    assertProblem(result, '0007-eta.md', '## Status');
    assertProblem(result, '0001-alpha.md', '## Decision');
  });
});

describe('changes ADR 0012 allows', () => {
  it('passes on the base itself, naming the base and the records it compared', () => {
    assertPasses(check());
  });

  it('passes a new record', () => {
    write('0007-eta.md', record({ number: '0007', title: 'Eta', status: 'Accepted' }));
    assertPasses(check());
  });

  it('passes a correction appended after the last one, with the status bumped', () => {
    edit('0002-beta.md', 'Accepted (corrected 2026-09-03)', 'Accepted (corrected 2026-09-05)');
    write(
      '0002-beta.md',
      `${read('0002-beta.md')}\n### 2026-09-05\n\nThe consequences named the wrong host.\n`,
    );
    assertPasses(check());
  });

  it('passes a first correction on a record that had none', () => {
    write(
      '0001-alpha.md',
      record({
        number: '0001',
        title: 'Alpha',
        status: 'Accepted (corrected 2026-09-05)',
        corrections: '### 2026-09-05\n\nThe context named the wrong package.',
      }),
    );
    assertPasses(check());
  });

  it('passes a supersession: the new status, its pointer and the successor', () => {
    write(
      '0004-delta.md',
      record({
        number: '0004',
        title: 'Delta',
        status: 'Superseded by ADR-0007',
        pointer: 'Its packaging rule no longer applies; see [ADR 0007](0007-eta.md).',
      }),
    );
    write('0007-eta.md', record({ number: '0007', title: 'Eta', status: 'Accepted' }));
    assertPasses(check());
  });

  it('passes an edit of its Context, which ADR 0012 lets a correction change', () => {
    edit('0001-alpha.md', 'Some context that was true', 'Some context, corrected, that was true');
    assertPasses(check());
  });

  it('passes a Decision re-wrapped or re-padded, with not a word changed', () => {
    edit(
      '0001-alpha.md',
      'so a reader never\nhas to look for it.',
      'so a reader\n   never has to look   for it.',
    );
    edit('0004-delta.md', '- The widget is built once.', '-   The widget  is built once.');
    assertPasses(check());
  });

  it('passes a renamed record file, matched by its number', () => {
    renameSync(adrPath('0001-alpha.md'), adrPath('0001-alpha-renamed.md'));
    assertPasses(check());
  });
});

describe('records that were never accepted at the base are exempt', () => {
  it('passes a Proposed record whose Decision is rewritten', () => {
    edit('0005-epsilon.md', 'so a reader never', 'so nobody ever');
    edit('0005-epsilon.md', '\nProposed\n', '\nAccepted\n');
    assertPasses(check());
  });

  it('passes a Withdrawn record whose Decision is rewritten, or that is deleted', () => {
    edit('0006-zeta.md', 'so a reader never', 'so nobody ever');
    assertPasses(check());
    unlinkSync(adrPath('0006-zeta.md'));
    unlinkSync(adrPath('0005-epsilon.md'));
    assertPasses(check());
  });
});

describe('the base and the head', () => {
  it('reads the head from a commit with --head, and the working tree without it', () => {
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    const edited = commit('docs(adr): edit an accepted decision');
    edit('0001-alpha.md', 'so nobody ever', 'so a reader never');
    const restored = commit('docs(adr): restore it');

    assertProblem(check(['--head', edited]), '0001-alpha.md', '## Decision');
    assertPasses(check(['--head', restored]));
    assertPasses(check());
    // And the working tree is read as it stands, uncommitted edits included.
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    assertProblem(check(), '0001-alpha.md', '## Decision');
    assertPasses(check(['--head', restored]));
  });

  it('takes the base from the merge base with origin/main by default', () => {
    // origin/main moves on with a record the branch lacks: compared with the origin's tip, that
    // record would read as deleted.
    execFileSync('git', ['init', '-q', '--bare', join(root, 'origin.git')]);
    git('remote', 'add', 'origin', join(root, 'origin.git'));
    git('push', '-q', 'origin', 'main');
    git('switch', '-q', '-c', 'feature');
    git('switch', '-q', 'main');
    write('0007-eta.md', record({ number: '0007', title: 'Eta', status: 'Accepted' }));
    commit('docs(adr): a record the branch lacks');
    git('push', '-q', 'origin', 'main');
    git('switch', '-q', 'feature');

    assertPasses(run([]));
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    assertProblem(run([]), '0001-alpha.md', '## Decision');
  });

  it('exits 2 without origin/main or --base, saying to pass --base', () => {
    const result = run([]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--base/);
  });

  it('exits 2 on a base or head it cannot resolve', () => {
    for (const args of [
      ['--base', 'no-such-ref'],
      ['--base', base, '--head', 'no-such-ref'],
    ]) {
      const result = run(args);
      assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
      assert.match(result.stderr, /no-such-ref/);
    }
  });

  it('exits 2 when the base is a parent a shallow clone does not have', () => {
    // A one-commit repository has no HEAD^1, as a depth-1 checkout has none: CI fails closed.
    const result = run(['--base', 'HEAD^1']);
    assert.equal(result.status, 2, result.stderr);
  });

  it('exits 2 outside a git repository', () => {
    const outside = join(root, 'outside');
    mkdirSync(outside);
    const result = spawnSync(process.execPath, [SCRIPT, '--base', 'HEAD'], {
      cwd: outside,
      encoding: 'utf8',
      env: { ...process.env, GIT_CEILING_DIRECTORIES: root },
    });
    assert.equal(result.status, 2, result.stderr);
  });

  it('reads the repository of a directory argument, wherever it is started from', () => {
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    const dir = join(repo, 'docs', 'adr');
    assertPasses(run(['--base', base, dir], elsewhere));
    edit('0001-alpha.md', 'so a reader never', 'so nobody ever');
    assertProblem(run(['--base', base, dir], elsewhere), '0001-alpha.md', '## Decision');
  });

  it('takes its arguments after a `--`, as `pnpm check:adr-history -- --base <ref>` passes them', () => {
    assertPasses(run(['--', '--base', base]));
  });

  it('exits 2 on a usage error', () => {
    for (const args of [
      ['--base'],
      ['--head'],
      ['--base', ''],
      ['--base', base, '--base', base],
      ['--fix'],
      ['a', 'b'],
      [''],
      ['--', '--', '--base', base],
    ]) {
      const result = run(args);
      assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stderr}`);
      assert.match(result.stderr, /usage: node scripts\/check-adr-history\.mjs/);
    }
  });
});
