#!/usr/bin/env node
// Checks the architecture decision records against a base commit, for the two rules of ADR 0012
// that a single tree cannot show being broken (issue #185):
//
//   1. An accepted record's `## Decision` is never edited. It is superseded, or a false statement
//      in it is annotated under `## Corrections`.
//   2. `## Corrections` is append-only. An entry is never reworded or removed, and a new one goes
//      after the last.
//
// `pnpm check:adrs` (check-adr-index.mjs) reads one tree, so it cannot see either. This script
// reads the records at a base commit and at the head, matches them by number, and for every record
// whose status at the base is Accepted or Superseded, in either form, corrected or not, reports:
//
//   - a record deleted at the head, or one whose status went back to Proposed or Withdrawn there
//     (ADR 0012 withdraws a record only before it is accepted, and an exemption reached in one pull
//     request would free the Decision in the next);
//   - a `## Decision` whose text differs from the base's. Runs of whitespace count as one space, so
//     a re-wrap or a re-padded table passes and any other change, a word or a Markdown mark, fails;
//   - a `## Corrections` whose text above its first `###` entry differs, or whose base entries are
//     not, in order and unchanged, the first entries at the head: an entry reworded, removed, or with
//     another inserted before it. Removing the whole section is the same failure.
//
// A record that was Proposed or Withdrawn at the base, or did not exist there, is exempt: its
// Decision has not been accepted yet. The rest of a record (Context, Consequences, Alternatives
// considered) ADR 0012 lets a correction edit, and whether an edit there is a correction is a
// reviewer's call, not this check's.
//
// Run with `pnpm check:adr-history`, or
// `node scripts/check-adr-history.mjs [--base <ref>] [--head <ref>] [adr-directory]`. The repository
// is the one the working directory sits in, or the directory argument when there is one, and the
// records are read from its `docs/adr` unless the argument names another directory. The base is
// `--base`, or else the merge base of the head and origin/main; the head is `--head`, a commit, or
// else the working tree, uncommitted edits included. CI passes `--base HEAD^1` (ci.yml says why).
//
// Exit codes follow check-adr-index.mjs: 0 when every protected record kept its Decision and its
// Corrections, with one line naming the base and how many records were compared; 1 when one did
// not, with every problem listed; 2 when the check could not run (no repository, a ref git cannot
// resolve, such as a parent a shallow clone lacks, a git failure) or on a usage error. It never
// exits 0 because it could not see: a status, section or fence it cannot read on either side is a
// problem, never a skip. And it never rewrites anything.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CheckError,
  markdownLines,
  parseStatus,
  readDirectory,
  readRecord,
  sectionsOf,
} from './check-adr-index.mjs';

const USAGE =
  'usage: node scripts/check-adr-history.mjs [--base <ref>] [--head <ref>] [adr-directory]';
/** Where the records live, relative to the repository's top level. */
const DEFAULT_DIR = join('docs', 'adr');
/**
 * A record file, matched by its number. Looser than check:adrs' name rule on purpose: a record
 * renamed to a name that rule refuses is still compared here, and check:adrs reports the name.
 */
const RECORD = /^(\d{4})-[^/]*\.md$/;
/** A `### ` heading that opens a `## Corrections` entry: check-adr-index.mjs' own test. */
const ENTRY = /^###(?:\s|$)/;
/** The base statuses whose Decision and Corrections are frozen: both were accepted. */
const PROTECTED = new Set(['Accepted', 'Superseded']);

/** @typedef {import('./check-adr-index.mjs').MarkdownLine} MarkdownLine */

/**
 * One side of the comparison, read: its lines, the line of a fence that never closes, its `## `
 * sections and its status line, or null when no single status line can be read.
 *
 * @typedef {{
 *   unclosedFence: number | null,
 *   sections: Map<string, { line: number, body: MarkdownLine[] }[]>,
 *   status: string | null,
 * }} Side
 */

/**
 * Where two runs of lines first differ, word by word: the line on each side holding the first word
 * that differs, or null on a side whose words ran out first.
 *
 * @typedef {{ base: MarkdownLine | null, head: MarkdownLine | null }} Difference
 */

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs git in `cwd` and returns what it printed. Any failure, git missing included, is a
 * CheckError carrying git's own message.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const stderr =
      error !== null && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr ?? '')
            .trim()
            .replace(/\s*\n\s*/g, '; ')
        : '';
    throw new CheckError(`git ${args.join(' ')} failed: ${stderr || messageOf(error)}`);
  }
}

/**
 * The commit a ref names.
 *
 * @param {string} top the repository's top level
 * @param {string} ref
 * @param {string} flag the option the ref came from, for the message
 * @returns {string}
 */
function resolveCommit(top, ref, flag) {
  try {
    return git(top, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new CheckError(
      `cannot resolve ${flag} ${ref} to a commit in ${top} (a shallow clone lacks the history ` +
        'before its depth: fetch more of it)',
    );
  }
}

/**
 * The merge base of `head` and origin/main: what a pull request's records are compared with when
 * no base is given. Never origin/main itself, which may hold records the branch has not seen.
 *
 * @param {string} top
 * @param {string} head a commit, or `HEAD`
 * @returns {string}
 */
function mergeBase(top, head) {
  try {
    git(top, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}']);
  } catch {
    throw new CheckError('there is no origin/main to take the merge base with: pass --base <ref>');
  }
  try {
    return git(top, ['merge-base', head, 'refs/remotes/origin/main']).trim();
  } catch (error) {
    throw new CheckError(
      `cannot find the merge base of ${head} and origin/main (${messageOf(error)}): ` +
        'pass --base <ref>',
    );
  }
}

/**
 * The record files directly in `dir` at a commit, by name. A directory the commit does not have is
 * a CheckError: a base or head without the records cannot be compared.
 *
 * @param {string} top
 * @param {string} commit
 * @param {string} dir the directory relative to the top level, with `/` separators; '' for the top
 * @returns {Map<string, string>}
 */
function filesAt(top, commit, dir) {
  const listing = git(top, ['ls-tree', '-z', `${commit}:${dir}`]);
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const entry of listing.split('\0')) {
    if (entry === '') continue;
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t([^]*)$/.exec(entry);
    if (!match) throw new CheckError(`cannot read the git ls-tree entry "${entry}"`);
    const [, mode, type, object, name] = match;
    // A symbolic link is a blob too, holding the link's target rather than a record.
    if (type !== 'blob' || mode === '120000' || !RECORD.test(name)) continue;
    files.set(name, git(top, ['cat-file', 'blob', object]));
  }
  return files;
}

/**
 * The record files in a directory of the working tree, by name.
 *
 * @param {string} dir an absolute path
 * @returns {Map<string, string>}
 */
function filesInWorkingTree(dir) {
  const { files } = readDirectory(dir);
  return new Map([...files].filter(([name]) => RECORD.test(name)));
}

/**
 * @param {string} name
 * @param {string} source
 * @returns {Side}
 */
function readSide(name, source) {
  const { lines, unclosedFence } = markdownLines(source);
  return {
    unclosedFence,
    sections: sectionsOf(lines),
    status: readRecord(name, source).record.status,
  };
}

/**
 * The status of one side, or why it cannot be read.
 *
 * @param {Side} side
 * @returns {ReturnType<typeof parseStatus>}
 */
function statusOf(side) {
  if (side.status !== null) return parseStatus(side.status);
  const found = side.sections.get('Status') ?? [];
  if (found.length !== 1) {
    return {
      error:
        found.length === 0
          ? 'there is no `## Status` section'
          : `there are ${found.length} \`## Status\` sections`,
    };
  }
  return { error: 'it is empty, or its status runs over more than one line' };
}

/**
 * The words of some lines, each with the line it sits on. Comparing these is comparing the text
 * with every run of whitespace, line breaks included, taken as one space.
 *
 * @param {MarkdownLine[]} lines
 * @returns {{ word: string, line: MarkdownLine }[]}
 */
function wordsOf(lines) {
  return lines.flatMap((line) =>
    line.text
      .split(/\s+/)
      .filter((word) => word !== '')
      .map((word) => ({ word, line })),
  );
}

/**
 * Where the base's lines and the head's first differ, or null when they hold the same words.
 *
 * @param {MarkdownLine[]} base
 * @param {MarkdownLine[]} head
 * @returns {Difference | null}
 */
function firstDifference(base, head) {
  const a = wordsOf(base);
  const b = wordsOf(head);
  let i = 0;
  while (i < a.length && i < b.length && a[i].word === b[i].word) i += 1;
  if (i === a.length && i === b.length) return null;
  return { base: a[i]?.line ?? null, head: b[i]?.line ?? null };
}

/**
 * @param {Difference} difference
 * @returns {string}
 */
function describe(difference) {
  /**
   * @param {string} side
   * @param {MarkdownLine | null} line
   */
  const quote = (side, line) =>
    line === null
      ? `the ${side} ends there`
      : `${side} line ${line.number} reads "${line.text.trim()}"`;
  return `${quote('base', difference.base)}, ${quote('head', difference.head)}`;
}

/**
 * A `## Corrections` body split into the text above its first entry and its entries, each a
 * `### ` heading and the lines up to the next one. A heading inside a code fence is text.
 *
 * @param {MarkdownLine[]} body
 * @returns {{ preamble: MarkdownLine[], entries: { heading: string, lines: MarkdownLine[] }[] }}
 */
function entriesOf(body) {
  /** @type {MarkdownLine[]} */
  const preamble = [];
  /** @type {{ heading: string, lines: MarkdownLine[] }[]} */
  const entries = [];
  for (const line of body) {
    if (!line.fenced && ENTRY.test(line.text)) {
      entries.push({ heading: line.text.trim(), lines: [line] });
    } else if (entries.length > 0) {
      entries[entries.length - 1].lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { preamble, entries };
}

/**
 * What is wrong with the head's `## Corrections` against the base's, or null when the head keeps
 * the base's text above the entries and the base's entries, unchanged, as its first ones.
 *
 * @param {MarkdownLine[]} baseBody
 * @param {MarkdownLine[]} headBody
 * @returns {string | null}
 */
function correctionsProblem(baseBody, headBody) {
  const base = entriesOf(baseBody);
  const head = entriesOf(headBody);

  const above = firstDifference(base.preamble, head.preamble);
  if (above) return `the text above the first entry changed (${describe(above)})`;

  /**
   * @param {{ lines: MarkdownLine[] }} a
   * @param {{ lines: MarkdownLine[] }} b
   */
  const same = (a, b) => firstDifference(a.lines, b.lines) === null;
  for (const [i, entry] of base.entries.entries()) {
    const at = head.entries[i];
    if (at && same(entry, at)) continue;
    const name = `\`${entry.heading}\``;
    if (head.entries.some((later, j) => j > i && same(entry, later))) {
      return (
        `an entry, \`${at.heading}\`, was inserted before the entry ${name}; ` +
        'a new entry goes after the last one'
      );
    }
    if (!at || base.entries.some((later, j) => j > i && same(later, at))) {
      return `the entry ${name} was removed`;
    }
    const heading = firstDifference([entry.lines[0]], [at.lines[0]]);
    if (heading === null) {
      const difference = firstDifference(entry.lines, at.lines);
      return `the entry ${name} was reworded (${difference ? describe(difference) : ''})`;
    }
    return (
      `the entry ${name} was removed or its heading reworded: ` +
      `the head has \`${at.heading}\` in its place`
    );
  }
  return null;
}

/**
 * Compares the records at the base with those at the head, and returns every problem and how many
 * records the base protected.
 *
 * @param {Map<string, string>} baseFiles the base's record files, by name
 * @param {Map<string, string>} headFiles the head's record files, by name
 * @param {string} dir the directory relative to the top level, for the messages
 * @returns {{ problems: string[], compared: number, exempt: number }}
 */
export function compareRecords(baseFiles, headFiles, dir) {
  /** @type {string[]} */
  const problems = [];
  let compared = 0;
  let exempt = 0;
  /** @param {string} name */
  const path = (name) => (dir === '' ? name : `${dir}/${name}`);

  /** @param {Map<string, string>} files */
  const byNumber = (files) => {
    /** @type {Map<string, string[]>} */
    const numbers = new Map();
    for (const name of [...files.keys()].sort()) {
      const number = name.slice(0, 4);
      numbers.set(number, [...(numbers.get(number) ?? []), name]);
    }
    return numbers;
  };
  const baseNumbers = byNumber(baseFiles);
  const headNumbers = byNumber(headFiles);

  for (const [number, names] of baseNumbers) {
    if (names.length > 1) {
      problems.push(
        `${names.map(path).join(', ')}: ADR ${number} has ${names.length} files at the base; ` +
          'this check compares one',
      );
      continue;
    }
    const [baseName] = names;
    const base = readSide(baseName, baseFiles.get(baseName) ?? '');
    const baseStatus = statusOf(base);
    if ('error' in baseStatus) {
      problems.push(
        `${path(baseName)}: \`## Status\` at the base cannot be read, so this check cannot tell ` +
          `whether its Decision is frozen: ${baseStatus.error}`,
      );
      continue;
    }
    if (!PROTECTED.has(baseStatus.status.kind)) {
      exempt += 1;
      continue;
    }
    compared += 1;
    const was = `"${base.status}" at the base`;

    const headNames = headNumbers.get(number) ?? [];
    if (headNames.length === 0) {
      problems.push(
        `${path(baseName)}: ADR ${number} was ${was} and is deleted at the head; an accepted ` +
          'record is superseded, never deleted (ADR 0012)',
      );
      continue;
    }
    if (headNames.length > 1) {
      problems.push(
        `${headNames.map(path).join(', ')}: ADR ${number} has ${headNames.length} files at the ` +
          'head; this check compares one',
      );
      continue;
    }
    const [headName] = headNames;
    const shown =
      headName === baseName ? path(headName) : `${path(headName)} (${baseName} at the base)`;
    /** @param {string} message */
    const say = (message) => problems.push(`${shown}: ${message}`);
    const head = readSide(headName, headFiles.get(headName) ?? '');

    /**
     * @param {'base' | 'head'} which
     * @param {number} line
     */
    const unclosed = (which, line) =>
      say(
        `the code fence opened on line ${line} at the ${which} is never closed, so no section ` +
          'after it can be read',
      );
    if (base.unclosedFence !== null) unclosed('base', base.unclosedFence);
    if (head.unclosedFence !== null) unclosed('head', head.unclosedFence);
    if (base.unclosedFence !== null || head.unclosedFence !== null) continue;

    const headStatus = statusOf(head);
    if ('error' in headStatus) {
      say(
        `\`## Status\` at the head cannot be read, so this check cannot tell whether the record ` +
          `still stands: ${headStatus.error}`,
      );
    } else if (!PROTECTED.has(headStatus.status.kind)) {
      say(
        `\`## Status\` reads "${head.status}" at the head, where it was ${was}; an accepted ` +
          'record never goes back to Proposed or Withdrawn (ADR 0012)',
      );
    }

    /**
     * The one `## <heading>` section of a side, or null with a problem when it has none or several.
     *
     * @param {Side} side
     * @param {'base' | 'head'} which
     * @param {string} heading
     * @param {string} missing what to say when the side has none
     */
    const only = (side, which, heading, missing) => {
      const found = side.sections.get(heading) ?? [];
      if (found.length === 1) return found[0];
      say(
        found.length === 0
          ? `has no \`## ${heading}\` section at the ${which}; ${missing}`
          : `has ${found.length} \`## ${heading}\` sections at the ${which} ` +
              `(lines ${found.map((s) => s.line).join(', ')}); this check compares one`,
      );
      return null;
    };

    const baseDecision = only(
      base,
      'base',
      'Decision',
      'there is no accepted Decision to hold it to',
    );
    const headDecision =
      baseDecision &&
      only(
        head,
        'head',
        'Decision',
        'it was renamed, removed or put inside a code fence, and an accepted Decision is never ' +
          'edited (ADR 0012)',
      );
    if (baseDecision && headDecision) {
      const difference = firstDifference(baseDecision.body, headDecision.body);
      if (difference) {
        say(
          `\`## Decision\` differs from the base (${describe(difference)}); an accepted ` +
            'Decision is never edited (ADR 0012): supersede the record, or quote a false ' +
            'statement in a new `## Corrections` entry',
        );
      }
    }

    const baseCorrections = base.sections.get('Corrections') ?? [];
    if (baseCorrections.length === 0) continue;
    const baseSection = only(base, 'base', 'Corrections', '');
    const headSection =
      baseSection &&
      only(
        head,
        'head',
        'Corrections',
        'it was removed, and `## Corrections` is append-only (ADR 0012)',
      );
    if (baseSection && headSection) {
      const problem = correctionsProblem(baseSection.body, headSection.body);
      if (problem) {
        say(
          `\`## Corrections\`: ${problem}; it is append-only (ADR 0012): an error in an ` +
            'entry is fixed by a further entry after the last one',
        );
      }
    }
  }

  return { problems, compared, exempt };
}

/**
 * @typedef {{ base: string | null, head: string | null, dir: string | null }} Options
 */

/**
 * Reads the arguments, or returns null on a usage error.
 *
 * @param {string[]} argv
 * @returns {Options | null}
 */
function parseArgs(argv) {
  const args = [...argv];
  // `pnpm check:adr-history -- --base <ref>` passes the `--` on to the script.
  if (args[0] === '--') args.shift();
  /** @type {Options} */
  const options = { base: null, head: null, dir: null };
  for (let arg = args.shift(); arg !== undefined; arg = args.shift()) {
    const flag = /^--(base|head)(?:=([^]*))?$/.exec(arg);
    if (flag) {
      const value = flag[2] ?? args.shift();
      if (value === undefined || value === '' || value.startsWith('-')) return null;
      if (flag[1] === 'base') {
        if (options.base !== null) return null;
        options.base = value;
      } else {
        if (options.head !== null) return null;
        options.head = value;
      }
    } else if (arg === '' || arg.startsWith('-') || options.dir !== null) {
      return null;
    } else {
      options.dir = arg;
    }
  }
  return options;
}

/**
 * Finds the repository and the records, resolves the base and the head, and compares them.
 *
 * @param {Options} options
 */
function check(options) {
  /** @type {string | null} */
  let given = null;
  if (options.dir !== null) {
    try {
      given = realpathSync(resolve(options.dir));
    } catch (error) {
      throw new CheckError(`cannot read ${options.dir}: ${messageOf(error)}`);
    }
  }
  const shown = git(given ?? process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  let top;
  try {
    top = realpathSync(shown);
  } catch (error) {
    throw new CheckError(`cannot read the repository at ${shown}: ${messageOf(error)}`);
  }
  const adrDir = given ?? join(top, DEFAULT_DIR);
  const inRepo = relative(top, adrDir);
  if (inRepo === '..' || inRepo.startsWith(`..${sep}`) || isAbsolute(inRepo)) {
    throw new CheckError(`${adrDir} is not inside the repository at ${top}`);
  }
  const dir = inRepo.split(sep).join('/');

  const headCommit = options.head === null ? null : resolveCommit(top, options.head, '--head');
  const baseCommit =
    options.base === null
      ? mergeBase(top, headCommit ?? 'HEAD')
      : resolveCommit(top, options.base, '--base');
  const baseFiles = filesAt(top, baseCommit, dir);
  const headFiles =
    headCommit === null ? filesInWorkingTree(adrDir) : filesAt(top, headCommit, dir);
  return {
    ...compareRecords(baseFiles, headFiles, dir),
    baseCommit,
    head: headCommit ?? 'the working tree',
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let result;
  try {
    result = check(options);
  } catch (error) {
    if (!(error instanceof CheckError)) throw error;
    console.error(`ADR history check could not run: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const { problems, compared, exempt, baseCommit, head } = result;
  if (problems.length === 0) {
    const records = `${compared} record${compared === 1 ? '' : 's'}`;
    console.log(
      `ADR history check: base ${baseCommit}, head ${head}: ${records} accepted or superseded ` +
        `at the base kept their Decision and earlier Corrections (${exempt} exempt).`,
    );
    return;
  }

  console.error(
    `\nADR records changed what ADR 0012 freezes (base ${baseCommit}, head ${head}):\n`,
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nThis check never rewrites anything. An accepted Decision is changed by superseding the ' +
      'record, and a correction by a further dated entry after the last; see ADR 0012.\n',
  );
  process.exitCode = 1;
}

/**
 * Whether this module was started as the command, as opposed to imported. Both sides go through
 * `realpathSync`, for the reason check-adr-index.mjs gives at the same guard.
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (startedAsCommand()) main();
