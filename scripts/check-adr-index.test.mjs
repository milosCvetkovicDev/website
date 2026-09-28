// Tests for the ADR index check. Run with `pnpm test:scripts` (node:test, no dependency).
//
// Every check gets a fixture that passes and one that fails, because a check that has only ever
// been seen passing may be a check that cannot fail. The parse cases matter as much as the checks:
// the script's rule is that anything it cannot read is a problem, never a skip, so each shape it
// refuses is pinned here. One group puts the four index defects task #51 found by hand back into
// the real docs/adr and expects exactly those four on top of whatever the records say today, with
// the expected text read from the records, so a later correction to one of them leaves it green.
// Whether the real records pass is `pnpm check:adrs`'s job in CI, not this suite's.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectProblems,
  isRealDate,
  markdownLines,
  parseStatus,
  readDirectory,
  readIndex,
  readRecord,
} from './check-adr-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const thisScript = join(here, 'check-adr-index.mjs');
const realAdrDir = join(here, '..', 'docs', 'adr');

/**
 * One record of a fixture directory. `source` replaces the generated text outright, for the cases
 * that need a record the generator cannot write.
 *
 * @typedef {{
 *   number: string,
 *   slug: string,
 *   title: string,
 *   status: string,
 *   date: string,
 *   pointer?: string,
 *   corrections?: string[],
 *   source?: string,
 * }} RecordSpec
 */

/**
 * One row of a fixture index. `title` is the whole cell, link included.
 *
 * @typedef {{ number: string, title: string, target: string, status: string, date: string }} RowSpec
 */

/** @param {RecordSpec} spec */
const fileName = (spec) => `${spec.number}-${spec.slug}.md`;

/**
 * @param {RecordSpec} spec
 * @returns {string}
 */
function recordSource(spec) {
  if (spec.source !== undefined) return spec.source;
  const pointer = spec.pointer === undefined ? '' : `${spec.pointer}\n\n`;
  const corrections = (spec.corrections ?? [])
    .map((heading) => `### ${heading}\n\n"Old text" became "new text"; see the commit.\n`)
    .join('\n');
  return [
    `# ${spec.number}. ${spec.title}\n`,
    '## Status\n',
    `${spec.status}\n\n${pointer}## Date\n`,
    `${spec.date}\n`,
    '## Context\n',
    'Why.\n',
    '## Decision\n',
    'What.\n',
    ...(corrections === '' ? [] : ['## Corrections\n', corrections]),
  ].join('\n');
}

/**
 * @param {RecordSpec} spec
 * @returns {RowSpec}
 */
const rowOf = (spec) => ({
  number: spec.number,
  title: `[${spec.title}](${fileName(spec)})`,
  target: fileName(spec),
  status: spec.status,
  date: spec.date,
});

/** @param {RowSpec[]} rows */
function indexSource(rows) {
  return [
    '# Architecture decision records',
    '',
    'Records, and the rules for writing one.',
    '',
    '| ADR | Title | Status | Date |',
    '| --- | ----- | ------ | ---- |',
    ...rows.map((row) => `| ${row.number} | ${row.title} | ${row.status} | ${row.date} |`),
    '',
    '## Writing a new ADR',
    '',
    '1. Take the next number.',
    '',
  ].join('\n');
}

/** @returns {RecordSpec[]} a directory that passes every check */
const baseRecords = () => [
  {
    number: '0001',
    slug: 'first-decision',
    title: 'First decision',
    status: 'Superseded by ADR-0002',
    date: '2026-09-08',
    pointer: 'No longer applies: all of it.\nSee [ADR 0002](0002-second-decision.md).',
  },
  {
    number: '0002',
    slug: 'second-decision',
    title: 'Second decision, with `code` in it',
    status: 'Accepted (corrected 2026-09-12)',
    date: '2026-09-09',
    corrections: ['2026-09-10', '2026-09-10b', '2026-09-12: a later fix'],
  },
  {
    number: '0003',
    slug: 'third-decision',
    title: 'Third decision',
    status: 'Accepted',
    date: '2026-09-10',
  },
];

/**
 * @param {RecordSpec[]} records
 * @param {{ rows?: RowSpec[], extra?: Record<string, string> }} [options]
 * @returns {Map<string, string>}
 */
function directory(records, { rows = records.map(rowOf), extra = {} } = {}) {
  return new Map([
    ['README.md', indexSource(rows)],
    ...records.map(
      (spec) => /** @type {[string, string]} */ ([fileName(spec), recordSource(spec)]),
    ),
    ...Object.entries(extra),
  ]);
}

/**
 * The base directory with one record changed.
 *
 * @param {string} number
 * @param {Partial<RecordSpec>} change
 * @param {{ keepRow?: boolean }} [options] keep the row the base record would have had
 */
function withRecord(number, change, { keepRow = false } = {}) {
  const base = baseRecords();
  const records = base.map((spec) => (spec.number === number ? { ...spec, ...change } : spec));
  return directory(records, keepRow ? { rows: base.map(rowOf) } : {});
}

/**
 * The base directory with one index row changed.
 *
 * @param {string} number
 * @param {Partial<RowSpec>} change
 */
function withRow(number, change) {
  const records = baseRecords();
  const rows = records
    .map(rowOf)
    .map((row) => (row.number === number ? { ...row, ...change } : row));
  return directory(records, { rows });
}

/**
 * Asserts the directory yields exactly one problem, and that it matches.
 *
 * @param {Map<string, string>} files
 * @param {RegExp} pattern
 */
function assertOneProblem(files, pattern) {
  const problems = collectProblems(files);
  assert.equal(problems.length, 1, `expected one problem, got:\n${problems.join('\n')}`);
  assert.match(problems[0], pattern);
}

describe('the base fixture', () => {
  it('passes every check', () => {
    assert.deepEqual(collectProblems(directory(baseRecords())), []);
  });
});

describe('parseStatus', () => {
  for (const [line, expected] of /** @type {const} */ ([
    ['Proposed', { kind: 'Proposed', supersededBy: null, corrected: null }],
    ['Withdrawn', { kind: 'Withdrawn', supersededBy: null, corrected: null }],
    ['Accepted', { kind: 'Accepted', supersededBy: null, corrected: null }],
    [
      'Accepted (corrected 2026-09-16)',
      { kind: 'Accepted', supersededBy: null, corrected: '2026-09-16' },
    ],
    ['Superseded by ADR-0012', { kind: 'Superseded', supersededBy: '0012', corrected: null }],
    [
      'Superseded by ADR-0018 (corrected 2026-09-13)',
      { kind: 'Superseded', supersededBy: '0018', corrected: '2026-09-13' },
    ],
  ])) {
    it(`reads "${line}", one of ADR 0012's six forms`, () => {
      assert.deepEqual(parseStatus(line), { status: expected });
    });
  }

  for (const line of [
    'Superseded by 0013',
    'Superseded by 0013 (corrected 2026-09-10)',
    'Superseded by ADR 0013',
    'Superseded by ADR-13',
    'Deprecated',
    'accepted',
    'Accepted.',
    'Accepted (Corrected 2026-09-10)',
    'Accepted (corrected 2026-9-10)',
    'Accepted (corrected 2026-09-10) ',
    'Withdrawn (corrected 2026-09-10)',
    'Proposed (corrected 2026-09-10)',
    '',
  ]) {
    it(`refuses ${JSON.stringify(line)}`, () => {
      const result = parseStatus(line);
      assert.ok('error' in result, `expected an error for ${JSON.stringify(line)}`);
      assert.match(result.error, /not one of ADR 0012's six status forms/);
    });
  }

  it('refuses a corrected date that is not a real day', () => {
    const result = parseStatus('Accepted (corrected 2026-02-30)');
    assert.ok('error' in result);
    assert.match(result.error, /2026-02-30 is not a real date/);
  });
});

describe('isRealDate', () => {
  for (const text of ['2026-09-28', '2024-02-29', '2026-12-31', '2026-01-01', '0099-01-01']) {
    it(`accepts ${text}`, () => assert.equal(isRealDate(text), true));
  }
  for (const text of [
    '2026-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-09-31',
    '26-09-28',
    '2026-9-8',
  ]) {
    it(`refuses ${text}`, () => assert.equal(isRealDate(text), false));
  }
});

describe('markdownLines', () => {
  it('marks the lines of a fenced block, fences included, and nothing else', () => {
    const { lines, unclosedFence } = markdownLines('a\n```md\n## Status\n```\nb\n');
    assert.deepEqual(
      lines.map((line) => line.fenced),
      [false, true, true, true, false, false],
    );
    assert.equal(unclosedFence, null);
  });

  it('closes a fence only on the same character, at least as long', () => {
    const { lines } = markdownLines('````\n```\n~~~~\n````\nafter\n');
    assert.deepEqual(
      lines.map((line) => line.fenced),
      [true, true, true, true, false, false],
    );
  });

  it('reports a fence that is never closed', () => {
    assert.equal(markdownLines('a\n\n~~~\n## Status\n').unclosedFence, 3);
  });

  it('drops a carriage return and a byte order mark', () => {
    const { lines } = markdownLines('\uFEFF# 0001. Title\r\n\r\n');
    assert.equal(lines[0].text, '# 0001. Title');
    assert.equal(lines[1].text, '');
  });
});

describe('readRecord', () => {
  it('reads the title, status, pointer, date and correction headings', () => {
    const [first, second] = baseRecords();
    assert.deepEqual(readRecord(fileName(first), recordSource(first)), {
      record: {
        name: '0001-first-decision.md',
        number: '0001',
        title: 'First decision',
        status: 'Superseded by ADR-0002',
        pointer: 'No longer applies: all of it. See [ADR 0002](0002-second-decision.md).',
        date: '2026-09-08',
        corrections: null,
        correctionsKnown: true,
      },
      problems: [],
    });
    const { record, problems } = readRecord(fileName(second), recordSource(second));
    assert.deepEqual(problems, []);
    assert.deepEqual(
      record.corrections?.map(({ date, suffix }) => [date, suffix]),
      [
        ['2026-09-10', ''],
        ['2026-09-10', 'b'],
        ['2026-09-12', ''],
      ],
    );
  });

  it('ignores headings inside a fenced block', () => {
    const source = recordSource(baseRecords()[2]).replace(
      'What.\n',
      'What.\n\n```md\n## Status\n\nWithdrawn\n\n## Corrections\n\n### nonsense\n```\n',
    );
    assert.deepEqual(readRecord('0003-third-decision.md', source).problems, []);
  });

  it('reads a status paragraph after blank lines, and joins a wrapped pointer', () => {
    const source = [
      '# 0001. First decision',
      '',
      '## Status',
      '',
      '',
      '',
      'Superseded by ADR-0002',
      '',
      '',
      'See',
      '[ADR',
      '0002](0002-second-decision.md).',
      '',
      '## Date',
      '',
      '2026-09-08',
      '',
    ].join('\n');
    const { record, problems } = readRecord('0001-first-decision.md', source);
    assert.deepEqual(problems, []);
    assert.equal(record.status, 'Superseded by ADR-0002');
    assert.equal(record.pointer, 'See [ADR 0002](0002-second-decision.md).');
  });

  it('reads no pointer from a fenced block beneath the status', () => {
    const [first] = baseRecords();
    const source = recordSource({
      ...first,
      pointer: '```md\nSee [ADR 0002](0002-second-decision.md).\n```',
    });
    assert.equal(readRecord(fileName(first), source).record.pointer, null);
  });

  /** @type {[string, (source: string) => string, RegExp][]} */
  const unreadable = [
    ['no H1', (s) => s.replace(/^# 0003\. Third decision\n/, ''), /first line is not an H1/],
    ['an H1 without the number', (s) => s.replace('# 0003. ', '# '), /first line is not an H1/],
    ['an H1 without the dot', (s) => s.replace('# 0003. ', '# 0003 '), /first line is not an H1/],
    [
      'an H2 as the first line',
      (s) => s.replace('# 0003. ', '## 0003. '),
      /first line is not an H1/,
    ],
    ['a wrong number in the H1', (s) => s.replace('# 0003. ', '# 0004. '), /H1 is numbered 0004/],
    ['no Status section', (s) => s.replace('## Status\n\nAccepted\n\n', ''), /no `## Status`/],
    [
      'two Status sections',
      (s) => `${s}\n## Status\n\nWithdrawn\n`,
      /2 `## Status` sections \(lines 3, \d+\)/,
    ],
    ['an empty Status section', (s) => s.replace('Accepted\n\n', ''), /`## Status` is empty/],
    [
      'a status that runs onto a second line',
      (s) => s.replace('Accepted\n', 'Accepted\nbecause it stands.\n'),
      /status runs over 2 lines/,
    ],
    ['no Date section', (s) => s.replace('## Date\n\n2026-09-10\n\n', ''), /no `## Date`/],
    ['an empty Date section', (s) => s.replace('2026-09-10\n\n', ''), /`## Date` is empty/],
    [
      'a Date that runs onto a second line',
      (s) => s.replace('2026-09-10\n', '2026-09-10\nor so\n'),
      /date runs over 2 lines/,
    ],
    [
      'two Corrections sections',
      (s) =>
        `${s}\n## Corrections\n\n### 2026-09-11\n\nx\n\n## Corrections\n\n### 2026-09-12\n\ny\n`,
      /2 `## Corrections` sections/,
    ],
    [
      'a correction heading it cannot read',
      (s) => `${s}\n## Corrections\n\n### September the 11th\n\nx\n`,
      /cannot read the correction heading on line \d+ \(`### September the 11th`\)/,
    ],
    [
      'a correction heading with no space before its title',
      (s) => `${s}\n## Corrections\n\n### 2026-09-11:title\n\nx\n`,
      /cannot read the correction heading/,
    ],
    [
      'a correction heading that is not a real date',
      (s) => `${s}\n## Corrections\n\n### 2026-09-31\n\nx\n`,
      /correction heading on line \d+ is dated 2026-09-31, which is not a real date/,
    ],
    [
      'a code fence that is never closed',
      (s) => s.replace('What.\n', 'What.\n\n```\nnever closed\n'),
      /code fence opened on line \d+ is never closed/,
    ],
  ];

  for (const [name, change, pattern] of unreadable) {
    it(`reports ${name}`, () => {
      const source = change(recordSource(baseRecords()[2]));
      const { problems } = readRecord('0003-third-decision.md', source);
      assert.ok(
        problems.some((problem) => pattern.test(problem)),
        `expected a problem matching ${pattern}, got:\n${problems.join('\n')}`,
      );
      for (const problem of problems) assert.match(problem, /^0003-third-decision\.md: /);
    });
  }
});

describe('readIndex', () => {
  it('reads each row of the table', () => {
    const { rows, problems } = readIndex(indexSource(baseRecords().map(rowOf)));
    assert.deepEqual(problems, []);
    assert.deepEqual(rows?.[1], {
      number: '0002',
      title: 'Second decision, with `code` in it',
      target: '0002-second-decision.md',
      status: 'Accepted (corrected 2026-09-12)',
      date: '2026-09-09',
      line: 8,
    });
  });

  it('reads an escaped pipe inside a cell as a pipe', () => {
    const { rows } = readIndex(
      indexSource([
        {
          number: '0001',
          title: '[A \\| B](0001-a-b.md)',
          target: '',
          status: 'Accepted',
          date: '2026-09-08',
        },
      ]),
    );
    assert.equal(rows?.[0].title, 'A | B');
  });

  it('fails when there is no index table', () => {
    const { rows, problems } = readIndex('# Records\n\nNo table here.\n');
    assert.equal(rows, null);
    assert.match(problems.join('\n'), /no index table with the header/);
  });

  it('fails when there are two index tables', () => {
    const table = indexSource(baseRecords().map(rowOf));
    const { rows, problems } = readIndex(`${table}\n${table}`);
    assert.equal(rows, null);
    assert.match(problems.join('\n'), /2 index tables \(lines 5, \d+\)/);
  });

  it('ignores a table header inside a fenced block', () => {
    const table = indexSource(baseRecords().map(rowOf));
    const { rows } = readIndex(`${table}\n\`\`\`md\n| ADR | Title | Status | Date |\n\`\`\`\n`);
    assert.equal(rows?.length, 3);
  });

  it('fails when the delimiter row is missing', () => {
    const { rows, problems } = readIndex('| ADR | Title | Status | Date |\n| 0001 | x | y | z |\n');
    assert.equal(rows, null);
    assert.match(problems.join('\n'), /line 2 is not the table's delimiter row/);
  });

  it('fails when the table has no rows', () => {
    const { problems } = readIndex(indexSource([]));
    assert.match(problems.join('\n'), /the index table has no rows/);
  });

  /** @type {[string, Partial<RowSpec>, RegExp][]} */
  const badRows = [
    ['a number that is not four digits', { number: '3' }, /cannot read the ADR number "3"/],
    ['a title cell that is not a link', { title: 'Third decision' }, /title cell is not a link/],
    [
      'a title link with a space in its target',
      { title: '[Third decision](0003 third.md)' },
      /title cell is not a link/,
    ],
    ['an empty status cell', { status: '' }, /status cell is empty/],
    ['a date that is not a real day', { date: '2026-02-30' }, /date "2026-02-30" is not a real/],
  ];
  for (const [name, change, pattern] of badRows) {
    it(`reports a row with ${name}`, () => {
      const rows = baseRecords()
        .map(rowOf)
        .map((row) => (row.number === '0003' ? { ...row, ...change } : row));
      const { problems } = readIndex(indexSource(rows));
      assert.equal(problems.length, 1, problems.join('\n'));
      assert.match(problems[0], /^README\.md line 9: /);
      assert.match(problems[0], pattern);
    });
  }

  it('reports a row with the wrong number of cells', () => {
    const source = indexSource(baseRecords().map(rowOf)).replace(
      '| 0003 | [Third decision](0003-third-decision.md) | Accepted | 2026-09-10 |',
      '| 0003 | [Third decision](0003-third-decision.md) | Accepted |',
    );
    const { problems } = readIndex(source);
    assert.match(problems.join('\n'), /line 9: has 3 cells, not 4/);
  });

  it('reports a code fence that is never closed, above the table or below it', () => {
    const table = indexSource(baseRecords().map(rowOf));
    const above = readIndex(`\`\`\`\n${table}`);
    assert.equal(above.rows, null);
    assert.match(above.problems[0], /^README\.md: the code fence opened on line 1 is never closed/);
    assert.match(above.problems[1], /no index table with the header/);

    const below = readIndex(`${table}\n\`\`\`\nnever closed\n`);
    assert.equal(below.rows?.length, 3);
    assert.deepEqual(below.problems, [
      `README.md: the code fence opened on line ${table.split('\n').length + 1} is never closed, ` +
        'so nothing after it can be read',
    ]);
  });

  it('reports a row out of ADR order', () => {
    const [first, second, third] = baseRecords().map(rowOf);
    const { problems } = readIndex(indexSource([first, third, second]));
    assert.deepEqual(problems, [
      'README.md line 9: the 0002 row comes after the 0003 row; rows run in ADR order',
    ]);
  });

  /** @type {[string, (row: string) => string][]} */
  const cutOff = [
    ['a blank line', (row) => `\n${row}`],
    ['no leading pipe', (row) => row.replace(/^\| /, '')],
  ];
  for (const [name, change] of cutOff) {
    it(`reports a row cut off from the table by ${name}`, () => {
      const row = '| 0003 | [Third decision](0003-third-decision.md) | Accepted | 2026-09-10 |';
      const source = indexSource(baseRecords().map(rowOf)).replace(row, change(row));
      const { rows, problems } = readIndex(source);
      assert.equal(rows?.length, 2);
      assert.equal(problems.length, 1, problems.join('\n'));
      assert.match(
        problems[0],
        /^README\.md line (9|10): reads like an index row, but the table ends on line 8/,
      );
    });
  }
});

describe('check 1: the status agrees with the index', () => {
  it('passes when the record and its row say the same', () => {
    assert.deepEqual(collectProblems(withRecord('0003', { status: 'Proposed' })), []);
  });

  it('fails when the row says something else', () => {
    assertOneProblem(
      withRow('0003', { status: 'Proposed' }),
      /^0003-third-decision\.md: the status reads "Accepted", but its index row \(README\.md line 9\) reads "Proposed"$/,
    );
  });

  it('compares as printed, so a missing correction date is a disagreement', () => {
    assertOneProblem(withRow('0002', { status: 'Accepted' }), /index row .* reads "Accepted"/);
  });
});

describe("check 2: the status is one of ADR 0012's six forms", () => {
  it('passes each form', () => {
    for (const status of ['Proposed', 'Withdrawn', 'Accepted']) {
      assert.deepEqual(collectProblems(withRecord('0003', { status })), [], status);
    }
  });

  it('fails a status outside the six, even when the index agrees', () => {
    assertOneProblem(
      withRecord('0003', { status: 'Deprecated' }),
      /^0003-third-decision\.md: the status "Deprecated" is not one of ADR 0012's six status forms/,
    );
  });

  it('fails a corrected date that is not a real day', () => {
    const files = withRecord('0002', {
      status: 'Accepted (corrected 2026-09-31)',
      corrections: ['2026-09-10'],
    });
    assertOneProblem(files, /2026-09-31 is not a real date/);
  });

  it('fails a record date that is not a real day', () => {
    const files = withRecord('0003', { date: '2026-02-29' }, { keepRow: true });
    assertOneProblem(
      files,
      /^0003-third-decision\.md: the date "2026-02-29" under `## Date` is not a real/,
    );
  });
});

describe('check 3: the H1 matches the filename and the index title', () => {
  it('passes a title with backticks and a comma', () => {
    assert.deepEqual(collectProblems(directory(baseRecords())), []);
  });

  it('fails when the index title is truncated', () => {
    assertOneProblem(
      withRow('0003', { title: '[Third](0003-third-decision.md)' }),
      /^0003-third-decision\.md: the H1 title is "Third decision", but its index row \(README\.md line 9\) says "Third"$/,
    );
  });

  it('fails when the H1 is numbered differently from the file', () => {
    const [, , third] = baseRecords();
    const source = recordSource(third).replace('# 0003. ', '# 0033. ');
    assertOneProblem(
      withRecord('0003', { source }),
      /^0003-third-decision\.md: the H1 is numbered 0033, but the file name says 0003$/,
    );
  });
});

describe('check 4: one row per record, one file per row, links that resolve', () => {
  it('fails a record with no row', () => {
    const records = baseRecords();
    const files = directory(records, { rows: records.slice(0, 2).map(rowOf) });
    assertOneProblem(files, /^0003-third-decision\.md: has no row in the index table$/);
  });

  it('fails a row with no record file', () => {
    const records = baseRecords();
    const rows = [
      ...records.map(rowOf),
      {
        number: '0004',
        title: '[Fourth](0004-fourth.md)',
        target: '0004-fourth.md',
        status: 'Accepted',
        date: '2026-09-11',
      },
    ];
    assertOneProblem(
      directory(records, { rows }),
      /^README\.md line 10: the 0004 row has no record file \(no 0004-\*\.md in this directory\)$/,
    );
  });

  it('fails a row whose link does not resolve', () => {
    assertOneProblem(
      withRow('0003', { title: '[Third decision](0003-third.md)' }),
      /^README\.md line 9: the 0003 row links 0003-third\.md, which is not a file in this directory$/,
    );
  });

  it("fails a row that links another record's file", () => {
    const problems = collectProblems(
      withRow('0003', { title: '[Third decision](0002-second-decision.md)' }),
    );
    assert.match(
      problems.join('\n'),
      /the 0003 row links 0002-second-decision\.md, which is ADR 0002's file/,
    );
  });

  it('accepts a link written with ./ or with a fragment', () => {
    assert.deepEqual(
      collectProblems(withRow('0003', { title: '[Third decision](./0003-third-decision.md)' })),
      [],
    );
    assert.deepEqual(
      collectProblems(
        withRow('0003', { title: '[Third decision](0003-third-decision.md#status)' }),
      ),
      [],
    );
  });

  it('fails a link that leaves the directory', () => {
    const problems = collectProblems(
      withRow('0003', { title: '[Third decision](../adr/0003-third-decision.md)' }),
    );
    assert.match(
      problems.join('\n'),
      /links \.\.\/adr\/0003-third-decision\.md, which is not a file in this directory/,
    );
  });

  it('fails two rows for one record', () => {
    const records = baseRecords();
    const rows = [...records.map(rowOf), rowOf(records[2])];
    assertOneProblem(
      directory(records, { rows }),
      /^README\.md: ADR 0003 has 2 rows \(lines 9, 10\)$/,
    );
  });

  it('fails two files with one number', () => {
    const records = baseRecords();
    const files = directory(records, {
      extra: { '0003-third-again.md': recordSource({ ...records[2], slug: 'third-again' }) },
    });
    assertOneProblem(
      files,
      /^ADR 0003 has 2 files \(0003-third-again\.md, 0003-third-decision\.md\); a number is never reused$/,
    );
  });

  for (const stray of [
    'notes.md',
    '0004_fourth.md',
    '0004-Fourth.md',
    '004-fourth.md',
    'readme.md',
  ]) {
    it(`fails a stray ${stray}`, () => {
      const files = directory(baseRecords(), { extra: { [stray]: '# Notes\n' } });
      assertOneProblem(
        files,
        new RegExp(`^${stray.replace('.', '\\.')}: is not named NNNN-kebab-case-title\\.md`),
      );
    });
  }

  it('fails an entry that is not a .md file, or not a file at all', () => {
    const problems = collectProblems(directory(baseRecords()), [
      { name: '0004-fourth.markdown', file: true },
      { name: 'drafts.md', file: false },
    ]);
    assert.deepEqual(problems, [
      '0004-fourth.markdown: is not a .md file; only README.md and NNNN-kebab-case-title.md sit ' +
        'in the ADR directory, so rename it or move it out',
      'drafts.md: is not a regular file; only README.md and NNNN-kebab-case-title.md sit in the ' +
        'ADR directory, so move it out',
    ]);
  });

  it('fails a directory with no index', () => {
    const files = directory(baseRecords());
    files.delete('README.md');
    assertOneProblem(
      files,
      /^README\.md: is missing, so no record can be checked against the index$/,
    );
  });

  it('fails a directory with no records', () => {
    const problems = collectProblems(new Map([['README.md', indexSource([])]]));
    assert.match(
      problems.join('\n'),
      /found no records \(NNNN-\*\.md\), so this check verified nothing/,
    );
  });
});

describe('check 5: correction bookkeeping', () => {
  it('passes a corrected status whose date is the newest entry, letters and titles included', () => {
    assert.deepEqual(
      collectProblems(
        withRecord('0002', {
          status: 'Accepted (corrected 2026-09-12)',
          corrections: ['2026-09-10', '2026-09-12', '2026-09-12b: the second that day'],
        }),
      ),
      [],
    );
  });

  it('passes a superseded and corrected record', () => {
    const files = withRecord('0001', {
      status: 'Superseded by ADR-0002 (corrected 2026-09-13)',
      corrections: ['2026-09-13'],
    });
    assert.deepEqual(collectProblems(files), []);
  });

  it('fails a corrected status with no Corrections section', () => {
    assertOneProblem(
      withRecord('0002', { corrections: [] }),
      /^0002-second-decision\.md: the status says corrected 2026-09-12, but the record has no `## Corrections` section$/,
    );
  });

  it('fails a corrected status whose date is not the newest entry', () => {
    assertOneProblem(
      withRecord('0002', { corrections: ['2026-09-10', '2026-09-13'] }),
      /the status says corrected 2026-09-12, but the newest `## Corrections` entry is dated 2026-09-13 \(line \d+\)/,
    );
  });

  it('fails a Corrections section under a status that does not say corrected', () => {
    assertOneProblem(
      withRecord('0003', { corrections: ['2026-09-11'] }),
      /^0003-third-decision\.md: has a `## Corrections` section, but its status "Accepted" does not say `\(corrected YYYY-MM-DD\)`/,
    );
  });

  it('fails a Corrections section with no dated entry', () => {
    const [, second] = baseRecords();
    const source = `${recordSource({ ...second, corrections: [] })}\n## Corrections\n\nNothing dated.\n`;
    assertOneProblem(
      withRecord('0002', { source }),
      /`## Corrections` has no `### YYYY-MM-DD` entry/,
    );
  });

  it('fails entries out of date order', () => {
    const problems = collectProblems(
      withRecord('0002', { corrections: ['2026-09-12', '2026-09-10'] }),
    );
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(
      problems[0],
      /the correction dated 2026-09-10 \(line \d+\) comes after 2026-09-12 \(line \d+\); entries run oldest first/,
    );
  });

  it('fails two entries under one date without a letter', () => {
    assertOneProblem(
      withRecord('0002', { corrections: ['2026-09-12', '2026-09-12'] }),
      /the correction dated 2026-09-12 \(line \d+\) comes after 2026-09-12 \(line \d+\).*a letter/,
    );
  });

  it('passes a third correction on one day lettered c', () => {
    assert.deepEqual(
      collectProblems(
        withRecord('0002', {
          corrections: ['2026-09-10', '2026-09-12', '2026-09-12b', '2026-09-12c'],
        }),
      ),
      [],
    );
  });

  it('fails a letter that skips one', () => {
    assertOneProblem(
      withRecord('0002', { corrections: ['2026-09-10', '2026-09-12', '2026-09-12z'] }),
      /the correction dated 2026-09-12z \(line \d+\) should be headed `### 2026-09-12b`/,
    );
  });

  it('fails a letter on the first correction of a day', () => {
    assertOneProblem(
      withRecord('0002', { corrections: ['2026-09-10', '2026-09-12a'] }),
      /the correction dated 2026-09-12a \(line \d+\) should be headed `### 2026-09-12`/,
    );
    assertOneProblem(
      withRecord('0002', {
        status: 'Accepted (corrected 2026-09-10)',
        corrections: ['2026-09-10b'],
      }),
      /the correction dated 2026-09-10b \(line \d+\) is the first on its day, so it carries no letter/,
    );
  });

  it('fails a correction dated before the record itself', () => {
    assertOneProblem(
      withRecord('0002', {
        status: 'Accepted (corrected 2026-09-01)',
        corrections: ['2026-09-01'],
      }),
      /^0002-second-decision\.md: the correction dated 2026-09-01 \(line \d+\) is earlier than the record's own `## Date`, 2026-09-09$/,
    );
  });

  for (const status of ['Proposed', 'Withdrawn']) {
    it(`fails a Corrections section under ${status} without suggesting a corrected form`, () => {
      assertOneProblem(
        withRecord('0003', { status, corrections: ['2026-09-11'] }),
        new RegExp(
          `^0003-third-decision\\.md: has a \`## Corrections\` section, but its status is ${status}; ` +
            'ADR 0012 corrects only an accepted record',
        ),
      );
    });
  }

  it('does not call two Corrections sections none, under a corrected status', () => {
    const [, second] = baseRecords();
    const source =
      `${recordSource({ ...second, corrections: [] })}\n## Corrections\n\n### 2026-09-12\n\nx\n` +
      '\n## Corrections\n\n### 2026-09-12b\n\ny\n';
    const problems = collectProblems(withRecord('0002', { source }));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /has 2 `## Corrections` sections/);
  });

  it('does not call a Corrections section hidden by an unclosed fence none', () => {
    const [, second] = baseRecords();
    const source = recordSource(second).replace('What.\n', 'What.\n\n```\nnever closed\n');
    const problems = collectProblems(withRecord('0002', { source }));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /the code fence opened on line \d+ is never closed/);
  });
});

describe('check 6: a superseded record points at its successor', () => {
  it('passes a pointer paragraph that links the superseding file', () => {
    assert.deepEqual(collectProblems(directory(baseRecords())), []);
  });

  it('fails a superseded record with no pointer', () => {
    assertOneProblem(
      withRecord('0001', { pointer: undefined }),
      /^0001-first-decision\.md: is superseded by ADR-0002, but has no pointer paragraph beneath its status/,
    );
  });

  it('fails a pointer that links nothing', () => {
    assertOneProblem(
      withRecord('0001', { pointer: 'No longer applies: all of it; see ADR 0002.' }),
      /the pointer beneath its status does not link the superseding record, 0002-second-decision\.md$/,
    );
  });

  it('fails a pointer that links another record', () => {
    assertOneProblem(
      withRecord('0001', { pointer: 'See [ADR 0003](0003-third-decision.md).' }),
      /does not link the superseding record, 0002-second-decision\.md$/,
    );
  });

  it('fails a record superseded by one that does not exist', () => {
    const files = withRecord('0001', {
      status: 'Superseded by ADR-0009',
      pointer: 'See [ADR 0009](0009-ninth.md).',
    });
    assertOneProblem(
      files,
      /is superseded by ADR-0009, but there is no 0009-\*\.md in this directory$/,
    );
  });

  it('fails a record superseded by itself', () => {
    const files = withRecord('0001', {
      status: 'Superseded by ADR-0001',
      pointer: 'See [ADR 0001](0001-first-decision.md).',
    });
    assertOneProblem(files, /^0001-first-decision\.md: is superseded by itself$/);
  });

  it('fails a pointer that only quotes the link in a fenced block', () => {
    assertOneProblem(
      withRecord('0001', { pointer: '```md\nSee [ADR 0002](0002-second-decision.md).\n```' }),
      /^0001-first-decision\.md: is superseded by ADR-0002, but has no pointer paragraph/,
    );
  });

  for (const status of ['Proposed', 'Withdrawn']) {
    it(`fails a record superseded by one that is ${status}`, () => {
      assertOneProblem(
        withRecord('0002', { status, corrections: [] }),
        new RegExp(
          `^0001-first-decision\\.md: is superseded by ADR-0002, but 0002-second-decision\\.md is ${status}; ` +
            'only an accepted record supersedes another$',
        ),
      );
    });
  }

  it('passes a chain, a successor that has been superseded in turn', () => {
    const files = withRecord('0002', {
      status: 'Superseded by ADR-0003 (corrected 2026-09-12)',
      pointer: 'See [ADR 0003](0003-third-decision.md).',
    });
    assert.deepEqual(collectProblems(files), []);
  });

  it('fails a record superseded by an earlier one, which rules out a cycle', () => {
    const files = withRecord('0002', {
      status: 'Superseded by ADR-0001',
      pointer: 'See [ADR 0001](0001-first-decision.md).',
      corrections: [],
    });
    assertOneProblem(
      files,
      /^0002-second-decision\.md: is superseded by ADR-0001, an earlier record; a record is superseded by a later one/,
    );
  });
});

describe('the index Date agrees with the record', () => {
  it('fails when the row carries another date', () => {
    assertOneProblem(
      withRow('0003', { date: '2026-09-11' }),
      /^0003-third-decision\.md: the date under `## Date` is 2026-09-10, but its index row \(README\.md line 9\) says 2026-09-11$/,
    );
  });
});

describe('the real records', () => {
  /** @returns {Map<string, string>} */
  const realFiles = () => readDirectory(realAdrDir).files;

  /** @param {string} text */
  const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Replaces one cell of an index row. Column 0 is the number, then title, status and date.
   *
   * @param {string} source
   * @param {string} number
   * @param {number} column
   * @param {string} value
   */
  function setCell(source, number, column, value) {
    let found = false;
    const out = source
      .split('\n')
      .map((line) => {
        if (!line.startsWith(`| ${number} |`)) return line;
        found = true;
        const cells = line.split('|');
        cells[column + 1] = ` ${value} `;
        return cells.join('|');
      })
      .join('\n');
    assert.ok(found, `no index row for ${number}`);
    return out;
  }

  // Task #51 of epic #42 found these four at once and fixed them by hand. Each would have failed
  // this check: two statuses written without the `ADR-` of ADR 0012's form, one that had dropped
  // its correction, and a title cell cut short of its record's H1. The expected text comes from the
  // records as they are now, so a later correction to one of them does not break this test.
  it("fail with task #51's four index defects put back", () => {
    const files = realFiles();
    /** @param {string} number */
    const recordOf = (number) => {
      const name = [...files.keys()].find((key) => key.startsWith(`${number}-`));
      assert.ok(name, `no record ${number} in docs/adr`);
      return readRecord(name, files.get(name) ?? '').record;
    };
    const [r5, r7, r8, r15] = ['0005', '0007', '0008', '0015'].map(recordOf);
    assert.ok(r5.status && r7.status && r8.status && r15.title, 'the four records read cleanly');

    const uncorrected = r5.status.replace(/ \(corrected \d{4}-\d{2}-\d{2}\)$/, '');
    assert.notEqual(uncorrected, r5.status, 'ADR 0005 is still corrected, as it was in task #51');
    const truncated = 'Case-study slugs are fixed at build time';
    assert.notEqual(truncated, r15.title);

    const before = collectProblems(files);
    let index = files.get('README.md') ?? '';
    index = setCell(index, '0005', 2, uncorrected);
    index = setCell(index, '0007', 2, 'Superseded by 0013 (corrected 2026-09-10)');
    index = setCell(index, '0008', 2, 'Superseded by 0011');
    index = setCell(index, '0015', 1, `[${truncated}](${r15.name})`);
    files.set('README.md', index);

    const added = collectProblems(files).filter((problem) => !before.includes(problem));
    assert.equal(added.length, 4, added.join('\n'));
    assert.match(
      added[0],
      new RegExp(
        `^${literal(r5.name)}: the status reads "${literal(r5.status)}", but its index row .* ` +
          `reads "${literal(uncorrected)}"$`,
      ),
    );
    assert.match(
      added[1],
      new RegExp(`^${literal(r7.name)}: .* reads "Superseded by 0013 \\(corrected 2026-09-10\\)"$`),
    );
    assert.match(added[2], new RegExp(`^${literal(r8.name)}: .* reads "Superseded by 0011"$`));
    assert.match(
      added[3],
      new RegExp(
        `^${literal(r15.name)}: the H1 title is "${literal(r15.title)}", but its index row .* ` +
          `says "${literal(truncated)}"$`,
      ),
    );
  });
});

describe('the command', () => {
  /**
   * @param {string[]} args
   * @param {string} [cwd]
   * @param {string} [script]
   */
  const run = (args, cwd = here, script = thisScript) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env },
    });

  /** @param {(dir: string) => void} body */
  function inTemp(body) {
    const dir = mkdtempSync(join(tmpdir(), 'adr-index-'));
    try {
      body(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * Writes a fixture directory to disk.
   *
   * @param {string} dir
   * @param {Map<string, string>} files
   */
  function writeDirectory(dir, files) {
    mkdirSync(dir, { recursive: true });
    for (const [name, source] of files) writeFileSync(join(dir, name), source);
  }

  it('exits 0 with no output on a directory that agrees with its index', () => {
    inTemp((dir) => {
      writeDirectory(join(dir, 'adr'), directory(baseRecords()));
      const result = run([join(dir, 'adr')]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    });
  });

  it('exits 1 and lists every problem when a record disagrees with the index', () => {
    inTemp((dir) => {
      const records = baseRecords();
      const rows = records
        .map(rowOf)
        .map((row) =>
          row.number === '0001'
            ? { ...row, status: 'Superseded by 0002' }
            : row.number === '0003'
              ? { ...row, status: 'Proposed' }
              : row,
        );
      writeDirectory(join(dir, 'adr'), directory(records, { rows }));
      const result = run([join(dir, 'adr')]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(
        result.stderr,
        /0001-first-decision\.md: the status reads "Superseded by ADR-0002"/,
      );
      assert.match(result.stderr, /0003-third-decision\.md: the status reads "Accepted"/);
      assert.match(result.stderr, /never rewrites/);
    });
  });

  it('reports what else sits in the directory, and skips hidden files', () => {
    inTemp((dir) => {
      const adr = join(dir, 'adr');
      writeDirectory(adr, directory(baseRecords()));
      writeFileSync(join(adr, '.DS_Store'), '');
      writeFileSync(join(adr, '0004-fourth.markdown'), '# 0004. Fourth\n');
      mkdirSync(join(adr, 'drafts.md'));
      const result = run([adr]);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /- 0004-fourth\.markdown: is not a \.md file/);
      assert.match(result.stderr, /- drafts\.md: is not a regular file/);
      assert.doesNotMatch(result.stderr, /DS_Store/);
    });
  });

  it('exits 2 when the directory cannot be read', () => {
    inTemp((dir) => {
      const result = run([join(dir, 'missing')]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /ADR index check could not run: cannot list /);
    });
  });

  it('takes the directory after a `--`, as `pnpm check:adrs -- <dir>` passes it', () => {
    inTemp((dir) => {
      writeDirectory(join(dir, 'adr'), directory(baseRecords()));
      const result = run(['--', join(dir, 'adr')]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
    });
  });

  it('exits 2 on a usage error', () => {
    for (const args of [['a', 'b'], ['--fix'], [''], ['--', '--fix'], ['--', 'a', 'b']]) {
      const result = run(args);
      assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
      assert.match(result.stderr, /usage: node scripts\/check-adr-index\.mjs \[adr-directory\]/);
    }
  });

  it('defaults to docs/adr beside the script, wherever it is started from', () => {
    inTemp((dir) => {
      mkdirSync(join(dir, 'scripts'));
      const script = join(dir, 'scripts', basename(thisScript));
      copyFileSync(thisScript, script);
      mkdirSync(join(dir, 'docs', 'adr'), { recursive: true });
      for (const [name, source] of directory(baseRecords())) {
        writeFileSync(join(dir, 'docs', 'adr', name), source);
      }
      const clean = run([], tmpdir(), script);
      assert.equal(clean.status, 0, clean.stderr);
      assert.equal(clean.stderr, '');

      writeFileSync(join(dir, 'docs', 'adr', 'stray.md'), '# Stray\n');
      const dirty = run([], tmpdir(), script);
      assert.equal(dirty.status, 1);
      assert.match(dirty.stderr, /stray\.md: is not named NNNN-kebab-case-title\.md/);
    });
  });

  it('does not run the check when the module is imported rather than started', () => {
    inTemp((dir) => {
      const importer = join(dir, 'importer.mjs');
      writeFileSync(
        importer,
        `await import(${JSON.stringify(thisScript)});\nconsole.log('imported');\n`,
      );
      const result = spawnSync(process.execPath, [importer], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, 'imported\n');
      assert.equal(result.stderr, '');
    });
  });
});
