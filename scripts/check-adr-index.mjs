#!/usr/bin/env node
// Checks every architecture decision record in docs/adr against the index in docs/adr/README.md,
// and against the status rules of ADR 0012.
//
// ADR 0012 gave a record's status six forms, two of which are written by hand into both the record
// and the index, and its Trade-offs said that nothing checked that the two agree. Task #51 of epic
// #42 then found four index cells that disagreed with their records at once. This is the check ADR
// 0012 names as its tracked follow-up (issue #69). For every `NNNN-*.md` it checks that:
//
//   1. the status line, the first line under `## Status`, equals the index row's Status cell;
//   2. the status is one of ADR 0012's six forms, and any date in it is a real one;
//   3. the H1 is `# NNNN. Title`, numbered as the file is, and the index link text is that title;
//   4. every record has one row, every row has one file, and each row's link resolves to its file;
//      no number has two files and no other `.md` sits in the directory;
//   5. a `(corrected YYYY-MM-DD)` status has a `## Corrections` section whose newest
//      `### YYYY-MM-DD` entry carries that date, a `## Corrections` section has such a status, and
//      its entries run oldest first;
//   6. a superseded record has a pointer paragraph beneath its status that links its successor;
//
// and that the index row's Date equals the record's `## Date`.
//
// Run with `pnpm check:adrs`, or `node scripts/check-adr-index.mjs [adr-directory]` to check
// another directory. Prints every problem and exits 1, or exits 0 quietly; exits 2 on a usage
// error.
//
// Two rules, both from check-allowbuilds-drift.mjs and the issue. It never exits 0 because it could
// not see: a heading, row or status it cannot read is a problem with a message, not a skip, so an
// unrecognised edit fails CI rather than passing unchecked. And it never rewrites anything. Which
// side of a disagreement is wrong is for a person to decide, and ADR 0012 decides what in an
// accepted record may be edited at all.

import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = join(repoRoot, 'docs', 'adr');
const INDEX = 'README.md';
const USAGE = 'usage: node scripts/check-adr-index.mjs [adr-directory]';

/** `NNNN-kebab-case-title.md`, the only name a record may have. */
const RECORD_NAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const INDEX_HEADER = /^\|\s*ADR\s*\|\s*Title\s*\|\s*Status\s*\|\s*Date\s*\|\s*$/;
const FORMS =
  '`Proposed`, `Withdrawn`, `Accepted`, `Accepted (corrected YYYY-MM-DD)`, ' +
  '`Superseded by ADR-NNNN` or `Superseded by ADR-NNNN (corrected YYYY-MM-DD)`';

/** A failure that stops the check outright, as opposed to a problem with a record. */
class CheckError extends Error {}

/**
 * A status line in one of the six forms ADR 0012 allows.
 *
 * @typedef {{
 *   kind: 'Proposed' | 'Withdrawn' | 'Accepted' | 'Superseded',
 *   supersededBy: string | null,
 *   corrected: string | null,
 * }} Status
 */

/**
 * One line of a Markdown file, numbered from 1, and whether it sits inside a fenced code block.
 *
 * @typedef {{ text: string, number: number, fenced: boolean }} MarkdownLine
 */

/**
 * One `### YYYY-MM-DD` heading under `## Corrections`. `suffix` is the letter ADR 0012 adds to a
 * second correction on the same day, or ''.
 *
 * @typedef {{ date: string, suffix: string, line: number }} CorrectionHeading
 */

/**
 * What could be read out of one record. A field it could not read is null, and the reason is among
 * the problems `readRecord` returned with it.
 *
 * @typedef {{
 *   name: string,
 *   number: string,
 *   title: string | null,
 *   status: string | null,
 *   pointer: string | null,
 *   date: string | null,
 *   corrections: CorrectionHeading[] | null,
 * }} AdrRecord
 */

/**
 * One row of the index table. A cell it could not read is null.
 *
 * @typedef {{
 *   number: string,
 *   title: string | null,
 *   target: string | null,
 *   status: string | null,
 *   date: string | null,
 *   line: number,
 * }} IndexRow
 */

/**
 * The message of whatever was thrown. A `catch` binding is `unknown`: anything can be thrown.
 *
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether `text` is a `YYYY-MM-DD` date that exists on the calendar.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isRealDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Reads a status line as one of ADR 0012's six forms, compared as printed: no other spelling,
 * capitalisation or trailing text is a form.
 *
 * @param {string} line
 * @returns {{ status: Status } | { error: string }}
 */
export function parseStatus(line) {
  if (line === 'Proposed' || line === 'Withdrawn' || line === 'Accepted') {
    return { status: { kind: line, supersededBy: null, corrected: null } };
  }

  const accepted = /^Accepted \(corrected (\d{4}-\d{2}-\d{2})\)$/.exec(line);
  const superseded = /^Superseded by ADR-(\d{4})(?: \(corrected (\d{4}-\d{2}-\d{2})\))?$/.exec(
    line,
  );
  /** @type {Status | null} */
  let status = null;
  if (accepted) status = { kind: 'Accepted', supersededBy: null, corrected: accepted[1] };
  if (superseded) {
    status = { kind: 'Superseded', supersededBy: superseded[1], corrected: superseded[2] ?? null };
  }

  if (status === null) {
    return { error: `the status "${line}" is not one of ADR 0012's six status forms (${FORMS})` };
  }
  if (status.corrected !== null && !isRealDate(status.corrected)) {
    return {
      error: `the status "${line}" is not a legal form: ${status.corrected} is not a real date`,
    };
  }
  return { status };
}

/**
 * Splits Markdown into numbered lines and marks those inside a fenced code block, the fences
 * included, so that a `## Status` or a table quoted in an example is never read as the real one.
 * A fence closes on a line of the same character at least as long, as CommonMark has it. A fence
 * that never closes runs to the end of the file there, hiding every heading after it, so it is
 * reported rather than followed.
 *
 * @param {string} source
 * @returns {{ lines: MarkdownLine[], unclosedFence: number | null }}
 */
export function markdownLines(source) {
  const texts = source
    .replace(/^﻿/, '')
    .split('\n')
    .map((text) => text.replace(/\r$/, ''));

  /** @type {{ char: string, length: number, line: number } | null} */
  let fence = null;
  /** @type {MarkdownLine[]} */
  const lines = [];

  for (const [index, text] of texts.entries()) {
    const number = index + 1;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (fence === null) {
      if (marker) fence = { char: marker[1][0], length: marker[1].length, line: number };
      lines.push({ text, number, fenced: fence !== null });
    } else {
      lines.push({ text, number, fenced: true });
      if (
        marker &&
        marker[1][0] === fence.char &&
        marker[1].length >= fence.length &&
        marker[2].trim() === ''
      ) {
        fence = null;
      }
    }
  }

  return { lines, unclosedFence: fence === null ? null : fence.line };
}

/**
 * The `## ` sections of a document by heading, each with the lines up to the next `#` or `##`
 * heading. A heading that appears twice keeps both, so the caller can refuse it.
 *
 * @param {MarkdownLine[]} lines
 * @returns {Map<string, { line: number, body: MarkdownLine[] }[]>}
 */
function sectionsOf(lines) {
  /** @type {Map<string, { line: number, body: MarkdownLine[] }[]>} */
  const sections = new Map();
  /** @type {MarkdownLine[] | null} */
  let body = null;
  for (const line of lines) {
    const heading = line.fenced ? null : /^(#{1,2}) +(.*?)\s*$/.exec(line.text);
    if (heading) {
      body = null;
      if (heading[1] === '##') {
        body = [];
        const list = sections.get(heading[2]) ?? [];
        list.push({ line: line.number, body });
        sections.set(heading[2], list);
      }
    } else if (body) {
      body.push(line);
    }
  }
  return sections;
}

/**
 * Groups lines into paragraphs: runs of non-blank lines.
 *
 * @param {MarkdownLine[]} lines
 * @returns {MarkdownLine[][]}
 */
function paragraphsOf(lines) {
  /** @type {MarkdownLine[][]} */
  const paragraphs = [];
  /** @type {MarkdownLine[] | null} */
  let current = null;
  for (const line of lines) {
    if (line.text.trim() === '') {
      current = null;
    } else {
      if (current === null) {
        current = [];
        paragraphs.push(current);
      }
      current.push(line);
    }
  }
  return paragraphs;
}

/**
 * The targets of the inline Markdown links in `text`, without a `#fragment`.
 *
 * @param {string} text
 * @returns {string[]}
 */
function linkTargets(text) {
  return [...text.matchAll(/\]\(\s*<?([^()\s<>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(
    (match) => match[1].split('#')[0],
  );
}

/**
 * The record file a link from inside the ADR directory names, or null when it names something
 * that is not a file directly in it. Only `name.md` and `./name.md` qualify, with an optional
 * fragment: a path that climbs out and back in is not how the index links a record.
 *
 * @param {string} target
 * @param {Set<string>} names every `.md` in the directory
 * @returns {string | null}
 */
function resolveLink(target, names) {
  const bare = target.split('#')[0].replace(/^\.\//, '');
  return !bare.includes('/') && names.has(bare) ? bare : null;
}

/**
 * Reads one record: its H1 title, status line, the pointer paragraph beneath the status, its date
 * and the headings of its corrections. Every part it cannot read is a problem, and that field is
 * left null.
 *
 * @param {string} name the file name, `NNNN-kebab-case-title.md`
 * @param {string} source
 * @returns {{ record: AdrRecord, problems: string[] }}
 */
export function readRecord(name, source) {
  /** @type {string[]} */
  const problems = [];
  /** @param {string} message */
  const say = (message) => problems.push(`${name}: ${message}`);

  const number = name.slice(0, 4);
  /** @type {AdrRecord} */
  const record = {
    name,
    number,
    title: null,
    status: null,
    pointer: null,
    date: null,
    corrections: null,
  };

  const { lines, unclosedFence } = markdownLines(source);
  if (unclosedFence !== null) {
    say(
      `the code fence opened on line ${unclosedFence} is never closed, so no heading after it ` +
        `can be read`,
    );
  }

  const first = lines.find((line) => line.text.trim() !== '');
  const h1 = first && !first.fenced ? /^# (\d{4})\. +(\S.*?)\s*$/.exec(first.text) : null;
  if (!h1) {
    const found = first
      ? `line ${first.number} reads \`${first.text.trim()}\``
      : 'the file is empty';
    say(`the first line is not an H1 of the form \`# ${number}. Title\` (${found})`);
  } else if (h1[1] !== number) {
    say(`the H1 is numbered ${h1[1]}, but the file name says ${number}`);
  } else {
    record.title = h1[2];
  }

  const sections = sectionsOf(lines);
  /**
   * @param {string} heading
   * @param {boolean} required
   */
  const section = (heading, required) => {
    const found = sections.get(heading) ?? [];
    if (found.length === 0 && required) say(`has no \`## ${heading}\` section`);
    if (found.length > 1) {
      say(
        `has ${found.length} \`## ${heading}\` sections ` +
          `(lines ${found.map((s) => s.line).join(', ')}); this check reads one`,
      );
    }
    return found.length === 1 ? found[0] : null;
  };

  const status = section('Status', true);
  if (status) {
    const [line, pointer] = paragraphsOf(status.body);
    if (!line) {
      say('`## Status` is empty');
    } else if (line.length > 1) {
      say(
        `the status runs over ${line.length} lines from line ${line[0].number}; it is one line, ` +
          `with a blank line before the pointer or anything else beneath it`,
      );
    } else {
      record.status = line[0].text.trim();
    }
    if (pointer) record.pointer = pointer.map((l) => l.text.trim()).join(' ');
  }

  const date = section('Date', true);
  if (date) {
    const [line] = paragraphsOf(date.body);
    if (!line) {
      say('`## Date` is empty');
    } else if (line.length > 1) {
      say(`the date runs over ${line.length} lines from line ${line[0].number}; it is one line`);
    } else if (!isRealDate(line[0].text.trim())) {
      say(`the date "${line[0].text.trim()}" under \`## Date\` is not a real YYYY-MM-DD date`);
    } else {
      record.date = line[0].text.trim();
    }
  }

  const corrections = section('Corrections', false);
  if (corrections) {
    /** @type {CorrectionHeading[]} */
    const headings = [];
    record.corrections = headings;
    for (const line of corrections.body) {
      if (line.fenced || !/^###(?:\s|$)/.test(line.text)) continue;
      const heading = /^### (\d{4}-\d{2}-\d{2})([a-z]?)(?:: +\S.*)?\s*$/.exec(line.text);
      if (!heading) {
        say(
          `cannot read the correction heading on line ${line.number} (\`${line.text.trim()}\`); ` +
            'write `### YYYY-MM-DD`, with a letter for a second correction that day ' +
            '(`### 2026-09-10b`) and an optional `: title`',
        );
      } else if (!isRealDate(heading[1])) {
        say(
          `the correction heading on line ${line.number} is dated ${heading[1]}, ` +
            'which is not a real date',
        );
      } else {
        headings.push({ date: heading[1], suffix: heading[2], line: line.number });
      }
    }
  }

  return { record, problems };
}

/**
 * Reads the rows of the index table, the one whose header is `| ADR | Title | Status | Date |`.
 * `rows` is null when there is no table it can read; a row it cannot read in part keeps the cells
 * it could, and a row without a readable number is left out, with a problem either way.
 *
 * @param {string} source the text of docs/adr/README.md
 * @returns {{ rows: IndexRow[] | null, problems: string[] }}
 */
export function readIndex(source) {
  const { lines } = markdownLines(source);
  const headers = lines.filter((line) => !line.fenced && INDEX_HEADER.test(line.text));

  if (headers.length === 0) {
    return {
      rows: null,
      problems: [
        `${INDEX}: has no index table with the header \`| ADR | Title | Status | Date |\``,
      ],
    };
  }
  if (headers.length > 1) {
    return {
      rows: null,
      problems: [
        `${INDEX}: has ${headers.length} index tables ` +
          `(lines ${headers.map((h) => h.number).join(', ')}); this check reads one`,
      ],
    };
  }

  const start = headers[0].number; // the line after the header, as an index into `lines`
  const delimiter = lines[start];
  if (!delimiter || !/^\|(?:\s*:?-+:?\s*\|){4}\s*$/.test(delimiter.text)) {
    return {
      rows: null,
      problems: [`${INDEX}: line ${start + 1} is not the table's delimiter row, \`| --- | ... |\``],
    };
  }

  /** @type {IndexRow[]} */
  const rows = [];
  /** @type {string[]} */
  const problems = [];

  for (const line of lines.slice(start + 1)) {
    if (!line.text.trimStart().startsWith('|')) break;
    /** @param {string} message */
    const say = (message) => problems.push(`${INDEX} line ${line.number}: ${message}`);

    const cells = splitRow(line.text);
    if (cells.length !== 4) {
      say(`has ${cells.length} cells, not 4 (ADR, Title, Status, Date)`);
      continue;
    }
    const [number, titleCell, status, date] = cells;

    if (!/^\d{4}$/.test(number)) {
      say(`cannot read the ADR number "${number}"; it is four digits`);
      continue;
    }

    /** @type {IndexRow} */
    const row = { number, title: null, target: null, status: null, date: null, line: line.number };

    const link = /^\[(.+)\]\(([^()\s]+)\)$/.exec(titleCell);
    if (!link) {
      say(`the ${number} row's title cell is not a link, \`[Title](${number}-title.md)\``);
    } else {
      row.title = link[1];
      row.target = link[2];
    }

    if (status === '') say(`the ${number} row's status cell is empty`);
    else row.status = status;

    if (!isRealDate(date)) say(`the ${number} row's date "${date}" is not a real YYYY-MM-DD date`);
    else row.date = date;

    rows.push(row);
  }

  if (rows.length === 0 && problems.length === 0) {
    problems.push(`${INDEX}: the index table has no rows`);
  }
  return { rows, problems };
}

/**
 * The cells of a table row, trimmed, with `\|` read as a literal pipe.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitRow(text) {
  let body = text.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll('\\|', '|'));
}

/**
 * The problems with one record on its own: its status form, its correction bookkeeping and the
 * pointer to the record that supersedes it.
 *
 * @param {AdrRecord} record
 * @param {Set<string>} names every `.md` in the directory
 * @returns {string[]}
 */
function recordProblems(record, names) {
  /** @type {string[]} */
  const problems = [];
  /** @param {string} message */
  const say = (message) => problems.push(`${record.name}: ${message}`);

  const { corrections } = record;
  if (corrections) {
    if (corrections.length === 0) {
      say('`## Corrections` has no `### YYYY-MM-DD` entry');
    }
    // Compared as plain strings: the dates are fixed-width, and a date alone sorts before the same
    // date with a letter.
    const labels = corrections.map(({ date, suffix }) => `${date}${suffix}`);
    for (let i = 1; i < corrections.length; i++) {
      if (labels[i] <= labels[i - 1]) {
        say(
          `the correction dated ${labels[i]} (line ${corrections[i].line}) comes after ` +
            `${labels[i - 1]} (line ${corrections[i - 1].line}); entries run oldest first, and ` +
            'a second one on the same day gets a letter (`### 2026-09-10b`)',
        );
      }
    }
  }

  if (record.status === null) return problems;
  const parsed = parseStatus(record.status);
  if ('error' in parsed) {
    say(parsed.error);
    return problems;
  }
  const { status } = parsed;

  if (status.corrected !== null) {
    if (corrections === null) {
      say(
        `the status says corrected ${status.corrected}, but the record has no ` +
          '`## Corrections` section',
      );
    } else if (corrections.length > 0) {
      const newest = corrections.reduce((a, b) => (b.date > a.date ? b : a));
      if (newest.date !== status.corrected) {
        say(
          `the status says corrected ${status.corrected}, but the newest \`## Corrections\` ` +
            `entry is dated ${newest.date} (line ${newest.line})`,
        );
      }
    }
  } else if (corrections !== null) {
    say(
      `has a \`## Corrections\` section, but its status "${record.status}" does not say ` +
        '`(corrected YYYY-MM-DD)`; ADR 0012 sets it to the date of the newest entry, in the ' +
        'record and the index',
    );
  }

  if (status.kind === 'Superseded' && status.supersededBy !== null) {
    const by = status.supersededBy;
    const successors = [...names]
      .filter((name) => RECORD_NAME.test(name) && name.startsWith(`${by}-`))
      .sort();
    if (by === record.number) {
      say('is superseded by itself');
    } else if (successors.length === 0) {
      say(`is superseded by ADR-${by}, but there is no ${by}-*.md in this directory`);
    } else if (record.pointer === null) {
      say(
        `is superseded by ADR-${by}, but has no pointer paragraph beneath its status saying ` +
          'which of its rules no longer apply (docs/adr/README.md, step 4)',
      );
    } else if (
      !linkTargets(record.pointer).some((target) => {
        const file = resolveLink(target, names);
        return file !== null && successors.includes(file);
      })
    ) {
      say(`the pointer beneath its status does not link the superseding record, ${successors[0]}`);
    }
  }

  return problems;
}

/**
 * Every problem with an ADR directory, given every `.md` file in it by name. Pure: the caller
 * reads the files.
 *
 * @param {Map<string, string>} files each `.md` file's name and text, the index included
 * @returns {string[]}
 */
export function collectProblems(files) {
  /** @type {string[]} */
  const problems = [];
  const names = new Set(files.keys());

  /** @type {Map<string, string[]>} */
  const filesByNumber = new Map();
  const recordNames = [...names].filter((name) => RECORD_NAME.test(name)).sort();
  for (const name of [...names].sort()) {
    if (name === INDEX) continue;
    if (!RECORD_NAME.test(name)) {
      problems.push(
        `${name}: is not named NNNN-kebab-case-title.md, so it is neither a record nor the index; ` +
          'rename it or move it out of the directory',
      );
      continue;
    }
    const number = name.slice(0, 4);
    filesByNumber.set(number, [...(filesByNumber.get(number) ?? []), name]);
  }
  for (const [number, list] of filesByNumber) {
    if (list.length > 1) {
      problems.push(
        `ADR ${number} has ${list.length} files (${list.join(', ')}); a number is never reused`,
      );
    }
  }
  if (recordNames.length === 0) {
    problems.push('found no records (NNNN-*.md), so this check verified nothing');
  }

  const indexSource = files.get(INDEX);
  /** @type {IndexRow[] | null} */
  let rows = null;
  if (indexSource === undefined) {
    problems.push(`${INDEX}: is missing, so no record can be checked against the index`);
  } else {
    const index = readIndex(indexSource);
    problems.push(...index.problems);
    rows = index.rows;
  }

  /** @type {Map<string, IndexRow[]>} */
  const rowsByNumber = new Map();
  for (const row of rows ?? []) {
    rowsByNumber.set(row.number, [...(rowsByNumber.get(row.number) ?? []), row]);
  }
  for (const [number, list] of rowsByNumber) {
    if (list.length > 1) {
      problems.push(
        `${INDEX}: ADR ${number} has ${list.length} rows ` +
          `(lines ${list.map((row) => row.line).join(', ')})`,
      );
    }
  }
  for (const row of rows ?? []) {
    /** @param {string} message */
    const say = (message) => problems.push(`${INDEX} line ${row.line}: ${message}`);
    if (!filesByNumber.has(row.number)) {
      say(`the ${row.number} row has no record file (no ${row.number}-*.md in this directory)`);
      continue;
    }
    if (row.target === null) continue;
    const file = resolveLink(row.target, names);
    if (file === null) {
      say(`the ${row.number} row links ${row.target}, which is not a file in this directory`);
    } else if (!RECORD_NAME.test(file)) {
      say(`the ${row.number} row links ${file}, which is not a record`);
    } else if (file.slice(0, 4) !== row.number) {
      say(`the ${row.number} row links ${file}, which is ADR ${file.slice(0, 4)}'s file`);
    }
  }

  for (const name of recordNames) {
    const { record, problems: unreadable } = readRecord(name, files.get(name) ?? '');
    problems.push(...unreadable, ...recordProblems(record, names));

    if (rows === null) continue;
    const matching = rowsByNumber.get(record.number) ?? [];
    if (matching.length === 0) {
      problems.push(`${name}: has no row in the index table`);
      continue;
    }
    // Two rows, or two files for one number, are already reported; comparing either against the
    // other would only repeat that.
    if (matching.length > 1 || (filesByNumber.get(record.number) ?? []).length > 1) continue;

    const [row] = matching;
    const where = `its index row (${INDEX} line ${row.line})`;
    if (record.status !== null && row.status !== null && record.status !== row.status) {
      problems.push(
        `${name}: the status reads "${record.status}", but ${where} reads "${row.status}"`,
      );
    }
    if (record.title !== null && row.title !== null && record.title !== row.title) {
      problems.push(`${name}: the H1 title is "${record.title}", but ${where} says "${row.title}"`);
    }
    if (record.date !== null && row.date !== null && record.date !== row.date) {
      problems.push(
        `${name}: the date under \`## Date\` is ${record.date}, but ${where} says ${row.date}`,
      );
    }
  }

  return problems;
}

/**
 * Reads every `.md` file in the directory.
 *
 * @param {string} dir
 * @returns {Map<string, string>}
 */
function readDirectory(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((name) => /\.md$/i.test(name));
  } catch (error) {
    throw new CheckError(`cannot list ${dir}: ${messageOf(error)}`);
  }
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const name of names) {
    try {
      files.set(name, readFileSync(join(dir, name), 'utf8'));
    } catch (error) {
      throw new CheckError(`cannot read ${join(dir, name)}: ${messageOf(error)}`);
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg === '' || arg.startsWith('-'))) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const dir = args.length === 1 ? resolve(args[0]) : DEFAULT_DIR;

  let problems;
  try {
    problems = collectProblems(readDirectory(dir));
  } catch (error) {
    if (!(error instanceof CheckError)) throw error;
    console.error(`ADR index check could not run: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (problems.length === 0) return;

  const shown = relative(process.cwd(), dir) || '.';
  console.error(`\nADR records disagree with their index or with ADR 0012 (${shown}):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nThis check never rewrites either side. Decide which one is wrong and fix it by hand; ' +
      'ADR 0012 says what an accepted record allows.\n',
  );
  process.exitCode = 1;
}

/**
 * Whether this module was started as the command, as opposed to imported by its tests. Both sides
 * go through `realpathSync`, for the reason check-allowbuilds-drift.mjs gives at the same guard: a
 * path through a symlinked directory would otherwise compare unequal, skip `main()` and exit 0
 * having checked nothing. What `realpathSync` throws is left uncaught for the same reason.
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (startedAsCommand()) main();
