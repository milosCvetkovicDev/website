#!/usr/bin/env node
// The publish check (D8 of docs/plans/2026-10-06-blog-publishing-design.md, ADR 0034). It compares
// an approved blog draft with the Markdown twin the site serves for the post, and fails on any
// difference in the words.
//
//   node scripts/post-draft-check.mjs --kind own|jev <draft.md> <twin.md>
//
// First it reports any syntax the post format refuses, in the draft as written. The comparison
// cannot see it: a literal `**bold**` kept in the entry is escaped by the twin and unescaped again
// here, and so is the `##` of a `> ## Results` quote whose entry holds the text `## Results`.
// Then it compares the slug, the title, the summary, the body and the footer, after undoing on both
// sides only what the serialiser does on purpose. The canonical form keeps every block's kind, and
// keeps text apart from code spans and links, so a block kind changed or a link or code span the
// entry flattened into plain text is a difference. Exit 0 when they agree, quietly; 1 with the
// differences or refused syntax; 2 when the check could not run, whatever stopped it.
//
// The dates are not compared: D9 sets them on the day the pull request opens. `--kind` is the
// writing room tracker's kind (D2), never read back from `posts.ts`; D4's naming check in
// `posts.test.ts` is the backstop for a Jev post marked `own`. Plain Node, no dependencies.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The lines a post of each kind ends with: a copy of `FOOTER_LINES` in
 * `apps/web/src/data/posts.ts`, which a plain script cannot import.
 * `apps/web/src/lib/__tests__/post-draft.test.ts` fails when the two differ.
 * @type {Readonly<Record<'own' | 'jev', readonly string[]>>}
 */
export const FOOTER_LINES = Object.freeze({
  own: Object.freeze([]),
  jev: Object.freeze(['I have no relationship with TypeSafe.']),
});

/** The check could not run (exit 2), not differences or refused syntax (exit 1). */
export class CannotRun extends Error {}

/** A backslash escape of ASCII punctuation, which CommonMark reads as the character itself. */
const ESCAPE = /\\([!-/:-@[-`{-~])/g;

/** A code fence's opening line: three or more backticks or tildes, then the info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** An ATX heading: its run of `#`, then its text without the optional closing run. */
const HEADING = /^ {0,3}(#{1,6})(?: +(.*?))?(?: +#+)? *$/;

/** A list item's first line: its marker, then its text. */
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)]) +(.*)$/;

/** A thematic break: three or more `-`, `*` or `_`, with spaces between them or not. */
const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;

/** A pipe table's delimiter row, with or without alignment colons and outer pipes. */
const DELIMITER_ROW = /^ {0,3}\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;

const USAGE = 'usage: node scripts/post-draft-check.mjs --kind own|jev <draft.md> <twin.md>\n';

/** @param {string} source */
const normalise = (source) => source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

/**
 * The fence a line opens, or null. A backtick fence's info string cannot hold a backtick, so such a
 * line is text.
 * @param {string} line
 */
function opensFence(line) {
  const match = FENCE.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { run: match[1], info: match[2].trim() };
}

/**
 * @param {string} line
 * @param {string} fence the run that opened it
 */
function closesFence(line, fence) {
  const run = /^ {0,3}(`+|~+) *$/.exec(line)?.[1];
  return run !== undefined && run[0] === fence[0] && run.length >= fence.length;
}

/** @param {string} code */
const longestRun = (code) => Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));

/**
 * Inline code as the serialiser writes it: one backtick more than its longest run, and a space inside
 * each end when it starts or ends with a backtick or a space.
 * @param {string} code
 */
function codeSpan(code) {
  const ticks = '`'.repeat(longestRun(code) + 1);
  const pad = /^[ `]|[ `]$/.test(code) ? ' ' : '';
  return `${ticks}${pad}${code}${pad}${ticks}`;
}

/**
 * A fenced code block in the shortest backtick fence that holds it, three at least.
 * @param {string} code
 */
function codeFence(code) {
  const fence = '`'.repeat(Math.max(3, longestRun(code) + 1));
  return `${fence}\n${code}\n${fence}`;
}

/**
 * Where the first run of exactly `length` backticks at or after `from` starts, or -1.
 * @param {string} source
 * @param {number} from
 * @param {number} length
 */
function closingRun(source, from, length) {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let match = runs.exec(source); match; match = runs.exec(source)) {
    if (match[0].length === length) return match.index;
  }
  return -1;
}

/**
 * The inline link whose `[` is at `at`: its label as written, its destination with the escapes
 * removed, and the index after its `)`. Null when no link opens there. The label may hold code spans
 * and balanced brackets; the destination has no whitespace, as the serialiser writes it.
 * @param {string} source
 * @param {number} at
 * @returns {{ label: string, href: string, end: number } | null}
 */
function linkAt(source, at) {
  let depth = 0;
  let close = at + 1;
  for (; close < source.length; close += 1) {
    const char = source[close];
    if (char === '\\') {
      close += 1;
    } else if (char === '`') {
      const run = /^`+/.exec(source.slice(close))?.[0] ?? '`';
      const end = closingRun(source, close + run.length, run.length);
      close = (end === -1 ? close : end) + run.length - 1;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  if (source[close] !== ']' || source[close + 1] !== '(') return null;
  let href = '';
  let parens = 0;
  for (let index = close + 2; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\' && /^[!-/:-@[-`{-~]$/.test(source[index + 1] ?? '')) {
      href += source[index + 1];
      index += 1;
    } else if (/\s/.test(char)) {
      return null;
    } else if (char === ')' && parens === 0) {
      return { label: source.slice(at + 1, close), href, end: index + 1 };
    } else {
      if (char === '(') parens += 1;
      if (char === ')') parens -= 1;
      href += char;
    }
  }
  return null;
}

/**
 * @typedef {{ text: string }} TextRun Text as written, its escapes kept.
 * @typedef {{ code: string }} CodeSpan
 * @typedef {{ label: Token[], href: string }} Link Its label holds text and code spans only.
 * @typedef {TextRun | CodeSpan | Link} Token
 */

/**
 * A run of inline Markdown as text, code spans and links. A backslash escape stays in its text, so
 * an escaped backtick or bracket never opens a span or a link. A backtick run with no closing run of
 * the same length is text, as is a `[` that opens no inline link, as CommonMark has it.
 * @param {string} source
 * @param {boolean} [links] false inside a link's label, which cannot hold another link
 * @returns {Token[]}
 */
export function inlineTokens(source, links = true) {
  /** @type {Token[]} */
  const tokens = [];
  let text = '';
  const flush = () => {
    if (text) tokens.push({ text });
    text = '';
  };
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    const link = char === '[' && links ? linkAt(source, at) : null;
    if (char === '\\' && at + 1 < source.length) {
      text += source.slice(at, at + 2);
      at += 2;
    } else if (char === '`') {
      const run = /^`+/.exec(source.slice(at))?.[0] ?? '`';
      const close = closingRun(source, at + run.length, run.length);
      if (close === -1) {
        text += run;
        at += run.length;
      } else {
        flush();
        const code = source.slice(at + run.length, close).replace(/\n/g, ' ');
        tokens.push({ code: /^ .* $/s.test(code) && code.trim() ? code.slice(1, -1) : code });
        at = close + run.length;
      }
    } else if (link) {
      flush();
      tokens.push({ label: inlineTokens(link.label, false), href: link.href });
      at = link.end;
    } else {
      text += char;
      at += 1;
    }
  }
  flush();
  return tokens;
}

/**
 * Plain text in canonical form: runs of spaces, tabs and line breaks collapsed to one space, as the
 * serialiser's `text()` collapses them, and every backslash, backtick and bracket escaped. A
 * no-break or thin space is kept, because the page shows it. Only a real code span or link writes
 * those three bare, so text that reads like one never equals one.
 * @param {string} value
 */
const canonicalText = (value) => value.replace(/[ \t\r\n]+/g, ' ').replace(/[\\`[\]]/g, '\\$&');

/**
 * A link destination in canonical form: on the twin's origin it is the path a draft writes, and a
 * backslash or parenthesis is escaped, so that the destination ends at the first bare `)`.
 * @param {string} href
 * @param {string} origin
 */
function canonicalHref(href, origin) {
  let path = href;
  if (href === origin) path = '/';
  else if (href.startsWith(`${origin}/`)) path = href.slice(origin.length);
  return path.replace(/[\\()]/g, '\\$&');
}

/**
 * @param {Token[]} tokens
 * @param {string} origin
 * @returns {string}
 */
function canonicalTokens(tokens, origin) {
  return tokens
    .map((token) => {
      if ('code' in token) return codeSpan(token.code);
      if ('label' in token) {
        const label = canonicalTokens(token.label, origin).trim();
        return `[${label}](${canonicalHref(token.href, origin)})`;
      }
      return canonicalText(token.text.replace(ESCAPE, '$1'));
    })
    .join('');
}

/**
 * Inline Markdown in canonical form. Text has its escapes removed and is written as
 * `canonicalText()` writes it, code spans as the serialiser writes them with their content
 * untouched, and links as Markdown links, a link on the twin's origin by its path.
 * @param {string} source
 * @param {string} origin
 */
export function canonicalInline(source, origin) {
  return canonicalTokens(inlineTokens(source), origin).trim();
}

/**
 * Markdown split into blocks at blank lines, each block a list of lines. A fenced code block is kept
 * whole, whatever blank or `---` lines it holds. A fence left open runs to the end, as in CommonMark.
 * @param {string} markdown
 * @returns {string[][]}
 */
export function splitBlocks(markdown) {
  /** @type {string[][]} */
  const blocks = [];
  /** @type {string[]} */
  let current = [];
  /** @type {string | null} */
  let fence = null;
  const flush = () => {
    if (current.length) blocks.push(current);
    current = [];
  };
  for (const line of normalise(markdown).split('\n')) {
    if (fence !== null) {
      current.push(line);
      if (closesFence(line, fence)) {
        fence = null;
        flush();
      }
      continue;
    }
    const opened = opensFence(line);
    if (opened) {
      flush();
      fence = opened.run;
      current.push(line);
    } else if (!line.trim()) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

/** @param {string[]} lines */
const isTable = (lines) =>
  lines.length > 1 &&
  lines[0].includes('|') &&
  lines[1].includes('|') &&
  DELIMITER_ROW.test(lines[1]);

/**
 * A pipe table row's cells as written, trimmed. GFM splits a row at each unescaped `|` before it
 * reads any inline syntax, so nothing in one cell pairs with anything in the next.
 * @param {string} line
 */
function tableCells(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/**
 * A pipe table row with its cells trimmed and in canonical form, or the delimiter row as `---`s.
 * Every backslash and pipe in a cell is escaped, so a row reads back as exactly its cells; a
 * backslash that canonical text has already escaped shows doubled, on both sides alike. A body row
 * with fewer cells than `width` gets empty ones, as GFM pads it. A longer one keeps the extra cells
 * that GFM drops, so it differs from the twin's row: a difference that fails safe.
 * @param {string} line
 * @param {boolean} delimiter
 * @param {number} width the delimiter row's cell count for a body row, or 0 to leave it as written
 * @param {string} origin
 */
function tableRow(line, delimiter, width, origin) {
  const cells = tableCells(line);
  while (cells.length < width) cells.push('');
  const shown = delimiter
    ? cells.map(() => '---')
    : cells.map((cell) => canonicalInline(cell, origin).replace(/[\\|]/g, '\\$&'));
  return `| ${shown.join(' | ')} |`;
}

/**
 * A table in canonical form, under its `Table:` caption line when it has one.
 * @param {string[]} lines the header row, the delimiter row and the body rows
 * @param {string | null} caption
 * @param {string} origin
 */
function canonicalTable(lines, caption, origin) {
  const captioned = caption === null ? [] : [`Table: ${canonicalInline(caption.slice(7), origin)}`];
  const width = tableCells(lines[1]).length;
  const rows = lines.map((line, index) =>
    tableRow(line, index === 1, index > 1 ? width : 0, origin),
  );
  return ['table:', ...captioned, ...rows].join('\n');
}

/**
 * How many spaces a line starts with. A list item's line with fewer than the item's text column
 * leaves that item.
 * @param {string} line
 */
const leadingSpaces = (line) => line.length - line.replace(/^ +/, '').length;

/**
 * The column where a list item's text starts: after its marker and the spaces that follow it, or
 * one space after the marker when five or more follow, which make the text indented code.
 * @param {string} line a list item's first line
 */
function itemIndent(line) {
  const match = /^( {0,3})([-*+]|\d{1,9}[.)])( +)/.exec(line);
  if (!match) return 0;
  const spaces = match[3].length;
  return match[1].length + match[2].length + (spaces > 4 ? 1 : spaces);
}

/**
 * Whether a later line of a list starts an item, as CommonMark reads it. A line indented to the
 * current item's text is inside that item, where it continues the paragraph unless it can interrupt
 * one: a bullet with text, or an ordered item from 1 (`1.`, `01.`) with text, either of which nests
 * a list. So `  1995. It was` there continues the item. A line indented less leaves the item and
 * starts an item at any list marker, whatever its number; without a marker it is a lazy
 * continuation. After an ordered item, a number with the same `.` or `)` starts the next item of
 * the same list. A marker of the other kind, such as a number after a bullet item, starts a new
 * list in CommonMark, which this check keeps in the same block; that fails safe, since
 * `canonicalList()` keeps each item's kind, so no twin's list equals it. A change of bullet
 * character, or from `.` to `)`, starts a new list of the same kind, which a post cannot hold
 * beside another, so `refusedSyntax()` refuses it.
 * @param {string} line
 * @param {number} indent the column where the current item's text starts
 */
function startsItem(line, indent) {
  if (leadingSpaces(line) < indent) return LIST_ITEM.test(line);
  return /^ {0,3}(?:[-*+]|0*1[.)]) +\S/.test(line.slice(indent));
}

/**
 * A list with `-` for every bullet, ordered items numbered from 1, and each item's lines joined. A
 * later line starts an item only where `startsItem()` says CommonMark starts one.
 * @param {string[]} lines
 * @param {string} origin
 */
function canonicalList(lines, origin) {
  /** @type {{ ordered: boolean, text: string[] }[]} */
  const items = [];
  let indent = 0;
  for (const line of lines) {
    const item = items.length === 0 || startsItem(line, indent) ? LIST_ITEM.exec(line) : null;
    if (item) {
      items.push({ ordered: /\d/.test(item[1]), text: [item[2]] });
      indent = itemIndent(line);
    } else {
      items[items.length - 1]?.text.push(line);
    }
  }
  let number = 0;
  const shown = items.map(({ ordered, text }) => {
    const marker = ordered ? `${(number += 1)}.` : '-';
    return `${marker} ${canonicalInline(text.join('\n'), origin)}`;
  });
  return [items[0]?.ordered ? 'list ordered:' : 'list bullet:', ...shown].join('\n');
}

/**
 * One block in canonical form: a line naming its kind, then its content. A block of one kind never
 * equals a block of another, so a heading, quote or list item written as a paragraph is a
 * difference.
 * @param {string[]} lines
 * @param {string} origin
 * @returns {string}
 */
function canonicalBlock(lines, origin) {
  const [first] = lines;
  const opened = opensFence(first);
  if (opened) {
    const closed = lines.length > 1 && closesFence(lines[lines.length - 1], opened.run);
    const code = lines.slice(1, closed ? -1 : lines.length).join('\n');
    return `code${opened.info ? ` ${opened.info}` : ''}:\n${codeFence(code)}`;
  }
  if (first.startsWith('Table: ') && isTable(lines.slice(1))) {
    return canonicalTable(lines.slice(1), first, origin);
  }
  if (isTable(lines)) return canonicalTable(lines, null, origin);
  const heading = HEADING.exec(first);
  if (heading && lines.length === 1) {
    const level = heading[1].length;
    return `heading ${level}:\n${heading[1]} ${canonicalInline(heading[2] ?? '', origin)}`;
  }
  if (LIST_ITEM.test(first)) return canonicalList(lines, origin);
  if (/^ {0,3}>/.test(first)) {
    const quoted = lines.map((line) => line.replace(/^ {0,3}> ?/, '')).join('\n');
    return `quote:\n> ${canonicalInline(quoted, origin)}`;
  }
  return `paragraph:\n${canonicalInline(lines.join('\n'), origin)}`;
}

/**
 * Blocks in canonical form: the form in which the two sides are compared. A `Table:` line is its
 * table's caption whether a blank line separates them or not.
 * @param {string[][]} blocks
 * @param {string} origin
 */
export function canonicalise(blocks, origin) {
  /** @type {string[]} */
  const canonical = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const lines = blocks[index];
    const next = blocks[index + 1];
    if (lines.length === 1 && lines[0].startsWith('Table: ') && next && isTable(next)) {
      canonical.push(canonicalTable(next, lines[0], origin));
      index += 1;
    } else {
      canonical.push(canonicalBlock(lines, origin));
    }
  }
  return canonical;
}

/**
 * A front-matter value without its YAML quotes: `"…"` with its `\"` and `\\` escapes, or `'…'`
 * with its `''`. Prettier writes the single-quoted form, the writing room may write either. YAML
 * reads more than this: a ` #` that starts a comment in an unquoted value, and escapes such as `\t`
 * or `\u00e9` in a double-quoted one. Each of those is refused, so the value is never misread.
 * @param {string} value
 * @param {string} at the value's line, for a message
 */
function unquote(value, at) {
  if (/^".*"$/.test(value)) {
    for (const [escape, char] of value.slice(1, -1).matchAll(/\\([\s\S]?)/g)) {
      if (char !== '"' && char !== '\\') {
        throw new CannotRun(
          `${at}: the escape ${escape} in a double-quoted value; ` +
            'write the character itself, as only \\" and \\\\ are read',
        );
      }
    }
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
  if (/(?:^|[ \t])#/.test(value)) {
    throw new CannotRun(
      `${at}: " #" starts a YAML comment in an unquoted value; quote it or drop the comment`,
    );
  }
  return value;
}

/** A line of three or more dashes, perhaps with spaces or tabs after them: meant as a fence. */
const FENCE_LIKE = /^-{3,}[ \t]*$/;

/** What a front-matter line may be, for a message that refuses one. */
const TAKES = 'the front matter takes key: value lines, and lists written [a, b]';

/**
 * The draft's front matter and body. Front matter is flat `key: value` lines between two lines of
 * exactly `---`, the first of them the file's first line; a list is written `[a, b]` on its key's
 * line, and a value may be quoted as YAML quotes it. No key comes twice, and the body is not empty.
 * @param {string} source
 * @returns {{ front: Map<string, string>, body: string, firstBodyLine: number }}
 */
export function parseDraft(source) {
  const lines = normalise(source).split('\n');
  const close = lines.findIndex((line, index) => index > 0 && FENCE_LIKE.test(line));
  for (const index of [0, close]) {
    const line = index === -1 ? '' : lines[index];
    if (FENCE_LIKE.test(line) && line !== '---') {
      throw new CannotRun(
        `line ${index + 1}: a front matter fence is ${JSON.stringify(line)}; write exactly ---`,
      );
    }
  }
  if (lines[0] !== '---' || close === -1) {
    throw new CannotRun('the draft does not open with front matter between two --- lines');
  }
  /** @type {Map<string, string>} */
  const front = new Map();
  lines.slice(1, close).forEach((line, index) => {
    const at = `line ${index + 2}`;
    if (!line.trim()) return;
    if (/^\s*#/.test(line)) throw new CannotRun(`${at}: a comment; ${TAKES}`);
    if (/^\s*-(?:\s|$)/.test(line)) throw new CannotRun(`${at}: a YAML block list item; ${TAKES}`);
    const pair = /^([A-Za-z][\w-]*): *(.*)$/.exec(line);
    if (!pair) throw new CannotRun(`${at}: ${JSON.stringify(line)} is not key: value; ${TAKES}`);
    const [key, value] = [pair[1], pair[2].trim()];
    if (/^[|>][-+0-9]*$/.test(value)) {
      throw new CannotRun(`${at}: a folded or literal value (${value}); ${TAKES}`);
    }
    if (front.has(key))
      throw new CannotRun(`${at}: the key ${key} appears twice in the front matter`);
    front.set(key, unquote(value, at));
  });
  const body = lines.slice(close + 1).join('\n');
  if (!body.trim()) throw new CannotRun('the draft has no body after its front matter');
  return { front, body, firstBodyLine: close + 2 };
}

/**
 * The served twin's parts, as `postToMarkdown` writes them: the `#` title, the summary, the
 * `Source:` line (on-site links are written on its origin, and its path is `/blog/<slug>`),
 * the Published and Updated lines, the body, whether a `---` rule outside a code block ends it, and
 * the footer lines that follow the last such rule.
 * @param {string} source
 */
export function parseTwin(source) {
  const [title, summary, sourceLine, dates, ...rest] = splitBlocks(source);
  const heading = title?.length === 1 ? /^# (.+)$/.exec(title[0]) : null;
  const url = sourceLine?.length === 1 ? /^Source: (https?:\/\/\S+)$/.exec(sourceLine[0]) : null;
  if (!heading || !summary || !url) {
    throw new CannotRun('the twin does not open with a # title, a summary and a Source: line');
  }
  if (
    dates?.length !== 2 ||
    !/^- Published: \d{4}-\d{2}-\d{2}$/.test(dates[0]) ||
    !/^- Updated: \d{4}-\d{2}-\d{2}$/.test(dates[1])
  ) {
    throw new CannotRun('the twin has no Published and Updated lines after its Source line');
  }
  let page;
  try {
    page = new URL(url[1]);
  } catch {
    throw new CannotRun(`the twin's Source line names no URL: ${url[1]}`);
  }
  // Any origin, since a preview or a local server serves twins too, but only a post's own path.
  const path = /^\/blog\/([^/]+)$/.exec(page.pathname);
  if (!path) throw new CannotRun(`the twin's Source URL is not /blog/<slug>: ${url[1]}`);
  const rule = rest.map((block) => block.length === 1 && block[0] === '---').lastIndexOf(true);
  const body = rule === -1 ? rest : rest.slice(0, rule);
  if (body.length === 0) {
    throw new CannotRun('the twin has no body after its Published and Updated lines');
  }
  return {
    origin: page.origin,
    slug: path[1],
    title: heading[1],
    summary: summary.join('\n'),
    body,
    ruled: rule !== -1,
    footer: rule === -1 ? [] : rest.slice(rule + 1).map((block) => block.join('\n')),
  };
}

/** @type {[RegExp, string][]} */
const REFUSED_LINES = [
  [/^ {0,3}#(?: |$)/, 'a level-1 heading: the title, in the front matter, is the only one'],
  [/^ {0,3}#{4,6}(?: |$)/, 'a heading below level 3'],
  // After any `>` and list markers too: a definition in a quote or a list item still defines the
  // label, and turns a `[label]` anywhere in the post into a link.
  [
    /^ {0,3}(?:(?:>|[-*+] |\d{1,9}[.)] ) *)*\[[^\]]+\]:/,
    'a reference-style link definition or a footnote',
  ],
  // Only a line that can interrupt the item's paragraph nests a list: see `startsItem()`.
  [/^ {2,}(?:[-*+]|0*1[.)]) +\S/, 'a nested list'],
  [/^ {0,3}> *$/, 'an empty quote line, which makes a quote of more than one paragraph'],
  [/^ *\t/, 'a line indented with a tab; indent with spaces'],
  // A tab anywhere else: CommonMark reads `-\tItem` as a list item, and the diff would show a
  // tab in a code span as a space. A fence keeps its tabs.
  [/^ *[^ \t].*\t/, 'a tab; write a space, or put the text in a code fence'],
];

/** @type {[RegExp, string][]} */
const REFUSED_INLINE = [
  [/!\[/, 'an image'],
  // An email autolink's address may start with a digit or a mark: `<2026@example.com>`.
  [/<(?:[A-Za-z!?/]|[\w.!#$%&'*+/=?^`{|}~-]+@)/, 'raw HTML, an HTML comment or an autolink'],
  [/\[\^/, 'a footnote'],
  [/\]\[/, 'a reference-style link'],
  [/\*/, 'an emphasis marker *; write \\* for the character'],
  [/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u, 'an emphasis marker _; write \\_ for the character'],
  [
    /&(?:#\d+|#[Xx][\dA-Fa-f]+|[A-Za-z][\dA-Za-z]*);/,
    'an entity reference; write the character itself, or \\& for an ampersand',
  ],
];

/** @typedef {'heading' | 'list' | 'quote' | 'caption' | 'table' | 'paragraph' | 'code'} BlockKind */

/**
 * The kind of block a line opens after a blank line, as `canonicalBlock` reads it.
 * @param {string} line
 * @param {string} next the line after it
 * @returns {BlockKind}
 */
function blockKind(line, next) {
  if (HEADING.test(line)) return 'heading';
  if (LIST_ITEM.test(line)) return 'list';
  if (/^ {0,3}>/.test(line)) return 'quote';
  if (line.startsWith('Table: ') && next.includes('|')) return 'caption';
  if (isTable([line, next])) return 'table';
  return 'paragraph';
}

/**
 * Whether `line` may follow a line of `block` with no blank line between them. Nothing follows a
 * heading or a closing fence. A paragraph's next line must not start a block of its own: a heading,
 * a list item (an ordered one only from 1, as CommonMark has it), a quote, a fence or a table row.
 * A list's next item, a quote's next `>` line and a table's next row continue them.
 * @param {BlockKind} block
 * @param {string} line
 */
function continues(block, line) {
  if (block === 'heading' || block === 'code' || opensFence(line)) return false;
  if (HEADING.test(line)) return false;
  if (/^ {0,3}(?:[-*+]|0*1[.)]) +\S/.test(line)) return block === 'list';
  if (/^ {0,3}>/.test(line)) return block === 'quote';
  if (/^ {0,3}\|/.test(line) || (line.includes('|') && DELIMITER_ROW.test(line))) {
    return block === 'table' || block === 'caption';
  }
  return true;
}

/**
 * The block that `content` opens inside a list item or quote, or null. `content` is a list item's
 * text after its marker and one space, or a quote line's after its `>` and one space. The entry
 * holds such syntax as text and the twin escapes its first mark, so the two bodies agree and only
 * this refusal catches it. A quote's later lines continue its paragraph, as CommonMark has it: a
 * `---` or `===` line makes the paragraph a setext heading, a delimiter row makes its last line a
 * table's header (GFM), and only a bullet or an item from 1 (`1.`, `01.`) with text starts a list,
 * so `> 1995. It was` stays text there.
 * @param {string} content
 * @param {boolean} first whether `content` starts the item or quote
 * @returns {string | null}
 */
function nestedBlock(content, first) {
  if (HEADING.test(content)) return 'a heading';
  if (/^ {0,3}>/.test(content)) return 'a quote';
  if (opensFence(content)) return 'a code fence';
  if (!first && /^ {0,3}(?:=+|-+) *$/.test(content)) return 'a setext heading underline';
  if (!first && content.includes('|') && DELIMITER_ROW.test(content)) return 'a table';
  if (RULE.test(content)) return 'a --- rule';
  if (
    first
      ? /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?: |$)/.test(content)
      : /^ {0,3}(?:[-*+]|0*1[.)]) +\S/.test(content)
  ) {
    return 'a list';
  }
  if (first && /^ {4,}\S/.test(content)) return 'indented code';
  return null;
}

/**
 * Running text as the refusals read it: escapes dropped, a code span as a space, and a link as its
 * label in brackets, or as a space when `labels` is false.
 * @param {Token[]} tokens
 * @param {boolean} labels
 * @returns {string}
 */
function prose(tokens, labels) {
  return tokens
    .map((token) => {
      if ('code' in token) return ' ';
      if ('label' in token) return labels ? `[${prose(token.label, true)}]` : ' ';
      return token.text.replace(ESCAPE, '');
    })
    .join('');
}

/** CommonMark's Unicode whitespace: a `Zs` space, a tab, a line feed, a form feed or a return. */
const WHITESPACE = /[\p{Zs}\t\n\f\r]/u;

/**
 * The spans in which GFM pairs `~` as strikethrough: the run of text, where each code span, escape
 * and link stands as one character that is not a space, and each link's text on its own.
 * @param {Token[]} tokens
 * @returns {string[]}
 */
function tildeSpans(tokens) {
  const labels = /** @type {string[]} */ ([]);
  const span = tokens
    .map((token) => {
      if ('code' in token) return 'c';
      if ('label' in token) {
        labels.push(...tildeSpans(token.label));
        return 'l';
      }
      return token.text.replace(ESCAPE, 'e');
    })
    .join('');
  return [span, ...labels];
}

/**
 * Whether GFM may strike part of `span` through: a run of one or two `~` that can open, followed
 * later by a run of the same length that can close. A run of three or more stays text. A run can
 * open unless whitespace or the span's end follows it, and close unless whitespace or the span's
 * start comes before it: CommonMark's flanking rules without their punctuation clauses, so that
 * the check refuses a few pairs GFM leaves as text and misses none it strikes.
 * @param {string} span
 */
function strikes(span) {
  /** @type {Set<number>} */
  const opened = new Set();
  for (const run of span.matchAll(/~+/g)) {
    const length = run[0].length;
    if (length > 2) continue;
    const before = span[run.index - 1];
    const after = span[run.index + length];
    if (opened.has(length) && before !== undefined && !WHITESPACE.test(before)) return true;
    if (after !== undefined && !WHITESPACE.test(after)) opened.add(length);
  }
  return false;
}

/**
 * The unescaped `](` in running text as written, by kind: `opened` when an unescaped `[` before it
 * is still open, so that CommonMark may read it as a link's end, and `stray` when none is. Each `[`
 * opens a bracket and each `]` closes the last one open, never below none; an escape is skipped.
 * @param {string} text
 */
function linkCloses(text) {
  const found = { opened: false, stray: false };
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') index += 1;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      if (text[index + 1] === '(') {
        if (depth > 0) found.opened = true;
        else found.stray = true;
      }
      depth = Math.max(0, depth - 1);
    }
  }
  return found;
}

/**
 * Running text or a link's label as written, its escapes kept and each code span or link a space,
 * for reading it again for links. `prose()` drops each escape whole, which would read `[b]\!(c)` as
 * a link.
 * @param {Token[]} tokens
 */
const written = (tokens) => tokens.map((token) => ('text' in token ? token.text : ' ')).join('');

/**
 * The refused inline syntax in one run of text: a heading, a table row or caption, or the lines of a
 * paragraph, list item or quote joined, so a code span or link wrapped onto the next line is read
 * whole. Code spans, escapes and link destinations are left alone.
 * @param {string} source
 * @param {string} at where the run is, for the messages
 * @param {BlockKind} block
 * @returns {string[]}
 */
function refusedInline(source, at, block) {
  /** @type {string[]} */
  const problems = [];
  const tokens = inlineTokens(source);
  if (tokens.some((token) => !('text' in token))) {
    if (block === 'heading') problems.push(`${at}: a heading is plain text: no code or links`);
    if (block === 'caption' || block === 'table') {
      problems.push(`${at}: a table's caption and cells are plain text: no code or links`);
    }
  }
  const labels = tokens.flatMap((token) => ('label' in token ? [token.label] : []));
  if (labels.some((label) => label.some((token) => 'code' in token))) {
    problems.push(`${at}: link text is plain text: no code`);
  }
  // Each label read again with links allowed, so a link inside it is a link token.
  const reread = labels.map((label) => inlineTokens(written(label)));
  if (reread.some((label) => label.some((token) => 'label' in token))) {
    problems.push(`${at}: a link inside a link's text`);
  }
  // A `](` that `linkAt()` did not take stays text on both sides. After an unescaped `[` that no
  // `]` has closed, CommonMark can still read it as the end of a link that `linkAt()` does not,
  // one with a title or spaces around its destination. With no open `[` before it, CommonMark
  // leaves it text as well; it is refused anyway, by its own message, as escaping the `]` costs
  // nothing. An escaped `\]` is text.
  const closes = [tokens, ...reread].map((run) => linkCloses(written(run)));
  if (closes.some(({ opened }) => opened)) {
    problems.push(
      `${at}: a link title or spaces around a link's destination; the post format has neither`,
    );
  }
  if (closes.some(({ stray }) => stray)) {
    problems.push(`${at}: a \`](\` with no open \`[\` before it: escape the \`]\` as \`\\]\``);
  }
  const text = prose(tokens, true);
  for (const [pattern, what] of REFUSED_INLINE) {
    if (pattern.test(text)) problems.push(`${at}: ${what}`);
  }
  // GFM pairs one or two `~` on each side as strikethrough, `~a~` as well as `~~a~~`, inside one
  // paragraph, item, quote, heading, caption, table cell or link text, where the page shows the
  // tildes. A table's cells are read one by one, as GFM splits the row before its inline syntax.
  const spans =
    block === 'table'
      ? tableCells(source).flatMap((cell) => tildeSpans(inlineTokens(cell)))
      : tildeSpans(tokens);
  if (spans.some(strikes)) {
    problems.push(
      `${at}: a pair of ~ that GFM may read as strikethrough; write \\~ for the character`,
    );
  }
  // GFM links a bare `www.` address too, after a space, `(`, a bracket or an emphasis mark.
  if (/https?:\/\/|(?:^|[\s*_~([\]])www\.[\p{L}\p{N}_-]/iu.test(prose(tokens, false))) {
    problems.push(`${at}: a bare URL, which GFM makes a link; write it as a link or as code`);
  }
  // And a bare email address; one inside `<…>` is an autolink, reported above.
  if (/(?<![<\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(prose(tokens, false))) {
    problems.push(`${at}: an email address, which GFM makes a link; write it as a link or as code`);
  }
  return problems;
}

/**
 * Every use of syntax the post format refuses, in the draft's body as written, by line. Code is
 * left alone: fenced blocks entirely, and code spans, escapes and link destinations in running text.
 * @param {string} body
 * @param {number} [firstLine] the draft's line number for the body's first line
 * @returns {string[]}
 */
export function refusedSyntax(body, firstLine = 1) {
  /** @type {string[]} */
  const problems = [];
  const lines = body.split('\n');
  /** @type {string | null} */
  let fence = null;
  /** the line the open code fence started on, for a fence that is never closed */
  let fenceAt = '';
  /** @type {BlockKind | null} the block the line above belongs to; null after a blank line */
  let block = null;
  /** @type {{ kind: BlockKind, from: number, to: number, text: string[] } | null} */
  let run = null;
  /** whether the list item or quote the line belongs to already has a block refused inside it */
  let nested = false;
  /** the column where the current list item's text starts, for `startsItem()` */
  let indent = 0;
  /** the last character of the current list's marker: its bullet, or its `.` or `)` */
  let marker = '';
  /** the marker of the list that the blank lines above this line end, if they end one */
  let ended = '';
  const endRun = () => {
    if (run) {
      const [from, to] = [firstLine + run.from, firstLine + run.to];
      const at = from === to ? `line ${from}` : `lines ${from}-${to}`;
      problems.push(...refusedInline(run.text.join('\n'), at, run.kind));
    }
    run = null;
  };
  lines.forEach((line, index) => {
    const at = `line ${firstLine + index}`;
    if (fence !== null) {
      if (closesFence(line, fence)) {
        fence = null;
        block = 'code';
      }
      return;
    }
    if (!line.trim()) {
      // A blank line is read before `REFUSED_LINES`: refuse its tab here, as the front matter does.
      if (line.includes('\t')) problems.push(`${at}: a tab on a blank line; leave the line empty`);
      // `trim()` strips any Unicode space; a CommonMark blank line holds only spaces and tabs.
      const other = [...new Set(line.match(/[^ \t]/gu))].map(codePoint);
      if (other.length > 0) {
        problems.push(
          `${at}: a line of ${other.join(' and ')} looks blank ` +
            'but is text to Markdown; leave it empty',
        );
      }
      endRun();
      if (block === 'list') ended = marker;
      block = null;
      return;
    }
    const after = ended;
    ended = '';
    const previous = lines[index - 1] ?? '';
    const next = lines[index + 1] ?? '';
    const above = block;
    if (block !== null && !continues(block, line)) {
      problems.push(`${at}: start each block after a blank line`);
      block = null;
    }
    const opened = opensFence(line);
    if (opened) {
      // CommonMark strips as many spaces from each line of a fence indented by one to three as the
      // fence has, which the twin's fence at the margin does not. A fence at a list item's text
      // belongs to the item: on the item's next line the rule for a block without a blank line
      // above reports it, and after a blank line it is a code block inside the item, whose lines
      // at the margin would close it and leave the item.
      const spaces = leadingSpaces(line);
      const inItem = (above === 'list' || after !== '') && spaces >= indent;
      if (inItem && above !== 'list') {
        problems.push(`${at}: a code fence inside a list item`);
      } else if (spaces > 0 && !inItem) {
        const unit = spaces === 1 ? 'space' : 'spaces';
        problems.push(
          `${at}: a code fence indented by ${spaces} ${unit}; ` +
            `remove the ${spaces} ${unit} from the fence and from each of its lines`,
        );
      }
      endRun();
      fence = opened.run;
      fenceAt = at;
      return;
    }
    const opening = block === null;
    if (block === null) {
      endRun();
      block = blockKind(line, next);
      // An item of the same kind after a blank line joins the list above as a loose one, or starts
      // a list beside it when the marker changes; a post holds neither.
      const mark = block === 'list' ? (LIST_ITEM.exec(line)?.[1].slice(-1) ?? '') : '';
      if (mark && after && /[-*+]/.test(mark) === /[-*+]/.test(after)) {
        problems.push(
          `${at}: a blank line between list items makes one loose list in Markdown, ` +
            'or two lists when the marker changes, and a post holds neither; remove the blank line',
        );
      }
      const start = /^ {0,3}(\d{1,9})[.)] /.exec(line)?.[1];
      if (block === 'list' && start !== undefined && Number(start) !== 1) {
        problems.push(`${at}: an ordered list that starts at ${start}; the page numbers it from 1`);
      }
    } else if (block === 'caption') {
      block = 'table';
    }
    // GFM reads a table only when its header row has as many cells as its delimiter row.
    if (block === 'table' && (opening || above === 'caption') && DELIMITER_ROW.test(next)) {
      const [header, delimiter] = [tableCells(line).length, tableCells(next).length];
      if (header !== delimiter) {
        problems.push(
          `${at}: not a table: the header row has ${header} ${header === 1 ? 'cell' : 'cells'} ` +
            `and the delimiter row ${delimiter}`,
        );
      }
    }
    for (const [pattern, what] of REFUSED_LINES) {
      if (pattern.test(line)) problems.push(`${at}: ${what}`);
    }
    if (/^ {0,3}(?:=+|-+) *$/.test(line) && previous.trim()) {
      problems.push(
        `${at}: a setext heading underline; write ## or ### before the heading instead`,
      );
    } else if (RULE.test(line)) {
      problems.push(`${at}: a --- rule; the site adds the footer's rule itself`);
    }
    if (/^ {2,}\S/.test(line) && !previous.trim()) {
      problems.push(
        `${at}: an indented block: a second paragraph in a list item, or code without a fence`,
      );
    }
    const item =
      block === 'list' && (opening || startsItem(line, indent)) ? LIST_ITEM.exec(line) : null;
    if (item) {
      // An item left of the last one's text stays in its list only with the same bullet, or the
      // same `.` or `)`; one of its kind starts a new list beside it, which a post cannot hold.
      const mark = item[1].slice(-1);
      if (opening) {
        marker = mark;
      } else if (leadingSpaces(line) < indent) {
        if (mark !== marker && /[-*+]/.test(mark) === /[-*+]/.test(marker)) {
          problems.push(
            `${at}: a change of bullet or delimiter starts a new list in Markdown, ` +
              'which a post cannot hold next to another list of its kind',
          );
        }
        marker = mark;
      }
      indent = itemIndent(line);
    }
    // Two spaces or an unescaped backslash end a line in a hard break only when the next line goes
    // on with the same paragraph, item or quote; before a blank line, an item or a row they do not.
    const backslashes = /\\*$/.exec(line)?.[0].length ?? 0;
    if (
      (/ {2,}$/.test(line) || backslashes % 2 === 1) &&
      (block === 'paragraph' || block === 'list' || block === 'quote') &&
      next.trim() &&
      continues(block, next) &&
      !(block === 'list' && startsItem(next, indent))
    ) {
      problems.push(`${at}: a hard line break`);
    }
    // GFM renders an item opening with `[ ]`, `[x]` or `[X]` as a checkbox, which a post has not.
    if (item && /^\[[ xX]\](?: |$)/.test(item[2])) {
      problems.push(
        `${at}: a task list item, which GFM renders as a checkbox; escape the bracket as \\[`,
      );
    }
    if (item || (block === 'quote' && /^ {0,3}>/.test(line))) {
      if (item || opening) nested = false;
      // A whole line of `- ---` is a rule, reported above, rather than a list item holding one.
      const content = item
        ? line.replace(/^ {0,3}(?:[-*+]|\d{1,9}[.)]) /, '')
        : line.replace(/^ {0,3}> ?/, '');
      const what =
        nested || RULE.test(line) ? null : nestedBlock(content, Boolean(item) || opening);
      if (what) {
        problems.push(`${at}: ${what} inside a ${item ? 'list item' : 'quote'}`);
        nested = true;
      }
    }
    if (block === 'heading' || block === 'caption' || block === 'table' || item) endRun();
    const text = item ? item[2] : block === 'quote' ? line.replace(/^ {0,3}> ?/, '') : line;
    if (run) {
      run.to = index;
      run.text.push(text);
    } else {
      run = { kind: block, from: index, to: index, text: [text] };
    }
    if (block === 'heading' || block === 'caption' || block === 'table') endRun();
  });
  endRun();
  if (fence !== null)
    problems.push(`${fenceAt}: the code fence opened with ${fence} is never closed`);
  return problems;
}

/** A character that prints as a space and is not one, such as a no-break space or a thin space. */
/**
 * A character that prints as a space and is not one (`\p{Zs}`), or prints as nothing at all
 * (`\p{Cf}`: a soft hyphen, a zero-width space, a word joiner).
 */
const SPACE_LIKE = /(?! )[\p{Zs}\p{Cf}]/u;

/**
 * The `?` line that goes under a changed line holding a character that prints as a space and is
 * not one, or prints as nothing, as Python's difflib marks a line: a `^` under each such character,
 * a tab kept as a tab so the marks stay in their columns, then the characters' code points. Null
 * for a line without one. Without it, a no-break space against a space, or a word with a
 * zero-width space against the same word without, shows as two identical lines.
 * @param {string} line
 * @returns {string | null}
 */
function spaceGuide(line) {
  const chars = Array.from(line);
  const marked = [...new Set(chars.filter((char) => SPACE_LIKE.test(char)))];
  if (marked.length === 0) return null;
  const guide = chars.map((char) => {
    if (char === '\t') return '\t';
    return SPACE_LIKE.test(char) ? '^' : ' ';
  });
  return `? ${guide.join('').trimEnd()} ${marked.map(codePoint).join(', ')}`;
}

/**
 * A character's code point as Unicode writes it, `U+00A0`.
 * @param {string} char
 */
function codePoint(char) {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * A line diff of `a` against `b`, as `-` and `+` lines with two lines of context, or '' when they
 * are equal. A changed line holding a character that prints as a space and is not one is followed
 * by its `spaceGuide()`.
 * @param {string[]} a
 * @param {string[]} b
 */
export function lineDiff(a, b) {
  const common = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      common[i][j] =
        a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  /** @type {[' ' | '-' | '+', string][]} */
  const steps = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      steps.push([' ', a[i]]);
      i += 1;
      j += 1;
    } else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) {
      steps.push(['-', a[i]]);
      i += 1;
    } else {
      steps.push(['+', b[j]]);
      j += 1;
    }
  }
  const changed = steps.map(([mark]) => mark !== ' ');
  if (!changed.includes(true)) return '';
  return steps
    .filter((_, index) => changed.slice(Math.max(0, index - 2), index + 3).includes(true))
    .flatMap(([mark, line]) => {
      const guide = mark === ' ' ? null : spaceGuide(line);
      return guide === null ? [`${mark} ${line}`] : [`${mark} ${line}`, guide];
    })
    .join('\n');
}

/** The front-matter keys every draft gives, each with more than spaces in it. */
const REQUIRED = ['title', 'slug', 'description'];

/**
 * Every way the twin differs from the approved draft, and every use of refused syntax in the draft.
 * None when the twin serves the approved words. Front-matter values are plain text, as the entry's
 * strings are, so they are compared as text runs.
 * @param {string} draftSource
 * @param {string} twinSource
 * @param {'own' | 'jev'} kind
 * @returns {string[]}
 */
export function differences(draftSource, twinSource, kind) {
  const draft = parseDraft(draftSource);
  const twin = parseTwin(twinSource);
  const [title = '', slug = '', description = ''] = REQUIRED.map((key) => draft.front.get(key));
  const missing = REQUIRED.filter((key) => !draft.front.get(key)?.trim());
  if (missing.length > 0) {
    const names = missing.join(', ').replace(/, (?=[^,]*$)/, ' and ');
    throw new CannotRun(
      `the front matter's ${names} ${missing.length === 1 ? 'is' : 'are'} missing or blank`,
    );
  }
  const problems = normalise(draftSource)
    .split('\n')
    .slice(0, draft.firstBodyLine - 1)
    .flatMap((line, index) =>
      line.includes('\t') ? [`line ${index + 1}: a tab in the front matter; write a space`] : [],
    );
  problems.push(...refusedSyntax(draft.body, draft.firstBodyLine));
  /** @param {string} value */
  const plain = (value) => canonicalText(value).trim();
  /** @type {[string, string, string][]} */
  const fields = [
    ['slug', slug, twin.slug],
    ['title', plain(title), canonicalInline(twin.title, twin.origin)],
    ['summary', plain(description), canonicalInline(twin.summary, twin.origin)],
  ];
  for (const [what, want, got] of fields) {
    if (want !== got) {
      problems.push(`the ${what} differs (- draft, + twin):\n${lineDiff([want], [got])}`);
    }
  }
  const body = lineDiff(
    canonicalise(splitBlocks(draft.body), twin.origin).join('\n\n').split('\n'),
    canonicalise(twin.body, twin.origin).join('\n\n').split('\n'),
  );
  if (body) problems.push(`the body differs (- draft, + twin):\n${body}`);
  const footer = twin.footer.map((line) => canonicalInline(line, twin.origin));
  const expected = FOOTER_LINES[kind];
  if (twin.ruled && footer.length === 0) {
    // The serialiser writes the rule only before a kind's lines, so a bare rule is a difference.
    const ends = expected.length === 0 ? 'has no footer' : `ends with ${JSON.stringify(expected)}`;
    problems.push(
      `the footer is a --- rule with nothing after it, but a post of kind ${kind} ${ends}`,
    );
  } else if (JSON.stringify(footer) !== JSON.stringify(expected.map(plain))) {
    problems.push(
      `the footer is ${JSON.stringify(footer)}, but a post of kind ${kind} ends with ${JSON.stringify(expected)}`,
    );
  }
  return problems;
}

/**
 * The check as a command: its exit status and what it prints. Exit 1 means differences or refused
 * syntax and nothing else, so every error, an unreadable file as much as a bug, exits 2 with its
 * message, and a bug with its stack too.
 * @param {string[]} argv the arguments after the script's path
 * @param {(path: string) => string} [read]
 * @returns {{ status: 0 | 1 | 2, output: string }}
 */
export function check(argv, read = (path) => readFileSync(path, 'utf8')) {
  const at = argv.indexOf('--kind');
  const kind = at === -1 ? undefined : argv[at + 1];
  const files = at === -1 ? argv : argv.filter((_, index) => index !== at && index !== at + 1);
  if ((kind !== 'own' && kind !== 'jev') || files.length !== 2) return { status: 2, output: USAGE };
  try {
    const [draftSource, twinSource] = files.map((path) => readNamed(read, path));
    const problems = differences(draftSource, twinSource, kind);
    return problems.length === 0
      ? { status: 0, output: '' }
      : { status: 1, output: `${problems.join('\n\n')}\n` };
  } catch (error) {
    return { status: 2, output: `post-draft-check: ${failure(error)}\n` };
  }
}

/**
 * The file at `path`, or a `CannotRun` that names it when the system refuses it: Node's message
 * for a directory read as a file says `EISDIR` and not which file.
 * @param {(path: string) => string} read
 * @param {string} path
 */
function readNamed(read, path) {
  try {
    return read(path);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && typeof error.code === 'string')) throw error;
    const named = error.message.includes(`'${path}'`) ? '' : ` '${path}'`;
    throw new CannotRun(`${error.message}${named}`);
  }
}

/**
 * What follows `post-draft-check:` for an error: a `CannotRun`'s message alone, as it names its
 * cause; for anything else, a fault in the check, the message and then the stack.
 * @param {unknown} error
 */
function failure(error) {
  if (error instanceof CannotRun) return error.message;
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ''}`.trimEnd();
  return String(error);
}

function main() {
  const { status, output } = check(process.argv.slice(2));
  if (output) (status === 2 ? process.stderr : process.stdout).write(output);
  process.exitCode = status;
}

/**
 * True when Node started this file, not when a test imported it. `realpathSync` for the reason
 * check-allowbuilds-drift.mjs documents: Node resolves `import.meta.url` and leaves
 * `process.argv[1]` as typed, so a path through a symlinked directory would otherwise skip `main()`
 * and exit 0 in silence. What `realpathSync` throws is not swallowed, for the same reason: the call
 * below reports it with its stack and exits 2, as for any fault, rather than Node's uncaught 1.
 *
 * @returns {boolean}
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

try {
  if (startedAsCommand()) main();
} catch (error) {
  process.stderr.write(`post-draft-check: ${failure(error)}\n`);
  process.exitCode = 2;
}
