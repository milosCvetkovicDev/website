/**
 * The post model's rules as one checker, `problemsIn(posts, today)`, run against the real `posts`
 * array and the fixtures, and shown to name each defect it exists for. The real array is empty
 * until the owner publishes, so it passes trivially; what proves the rules is the defect table,
 * where each broken copy of a fixture has to produce exactly one problem, the one it was broken for.
 *
 * Pure data with no DOM, so no jsdom window: building one costs about two seconds per worker.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { isWideTable } from '@/data/pages/table';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { formatContentDate, isPublishableContentDate } from '@/lib/content-date';
import { NO_PUBLISHED_POST_SLUG } from '@/lib/post-static-params';
import { draftPost, everyBlockPost, fixturePosts, hostileTitlePost } from '@/test/fixtures/posts';
import {
  buildPostIndex,
  FOOTER_LINES,
  getPost,
  hasPublishedPosts,
  posts,
  publishedPosts,
  type Inline,
  type Post,
  type PostBlock,
  type PostKind,
  type PublishedPost,
} from '../posts';

/** What the root layout's title template, `%s | Milos Cvetkovic`, adds to a page's title. */
const TITLE_SUFFIX = ' | Milos Cvetkovic';
/** Google cuts a title at about 600 px, some 60 characters, as page-metadata.test.ts holds. */
const TITLE_MAX = 60;
/**
 * #61's bounds for a summary. They are not a meta description's: 61b decides whether a summary can
 * double as one, which page-metadata.test.ts holds to 155 characters.
 */
const SUMMARY_MIN = 50;
const SUMMARY_MAX = 300;
/** Lowercase letters and digits in words joined by single hyphens: the `<slug>` in `/blog/<slug>`. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** One character of a URL as RFC 3986 writes it: ASCII, with anything else percent-encoded. */
const URL_CHARACTER = String.raw`(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/?#]|%[0-9A-Fa-f]{2})`;
/**
 * An https URL whose host is a dotted name, with an optional port and no user or password, or a
 * path on this site. Not `//host` or `/\host`, which a browser resolves to another site, and no
 * character a URL has to percent-encode: whitespace, `<`, `>`, `"`, a backtick, a backslash, a
 * control or direction character.
 */
const HREF = new RegExp(
  String.raw`^(?:https://[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?(?:[/?#]${URL_CHARACTER}*)?|/(?!/)${URL_CHARACTER}*)$`,
  'i',
);
/** Link text that says nothing of where the link goes, as a screen reader's list of links reads it. */
const VAGUE_LINK_TEXT = /^(?:here|click here|this|that|link|this link|more|read more)[.!:]?$/i;
/** A code block's language as a Markdown fence's info string and a `language-*` class can carry it. */
const LANGUAGE = /^[a-z0-9+#-]+$/i;
/** Marks that reorder or hide text: bidi controls, zero-width space, line and paragraph separators. */
const INVISIBLE_MARKS = new Set([
  0x061c, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066,
  0x2067, 0x2068, 0x2069, 0xfeff,
]);

const characters = (value: string) => [...value].length;

/**
 * Whether text holds a line break, a tab or another control, or an invisible mark. Only a code
 * block may: a line break anywhere else splits the Markdown twin's line where HTML shows a space.
 */
const hasInvisible = (value: string) =>
  [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) || INVISIBLE_MARKS.has(code);
  });
const INVISIBLE_PROBLEM = 'holds a line break, a control or a direction character';

/**
 * Problems with one line of prose: a title, a summary, a heading, a tag, or a table's caption, a
 * column name or a row header.
 */
function lineProblems(value: unknown, what: string): string[] {
  if (typeof value !== 'string' || !value.trim()) return [`${what} is empty`];
  if (hasInvisible(value)) return [`${what} ${INVISIBLE_PROBLEM}`];
  if (value !== value.trim() || value.includes('  ')) {
    return [`${what} has a space at an end or two in a row`];
  }
  return [];
}

/** The paths on this site a post may link to: the static routes, the case studies, the posts. */
function pagesFor(list: readonly Post[]): ReadonlySet<string> {
  return new Set([
    ...Object.keys(STATIC_ROUTE_UPDATED),
    ...caseStudies.map(({ slug }) => `/work/${slug}`),
    ...list.filter((post) => post.draft === false).map(({ slug }) => `/blog/${slug}`),
  ]);
}

/** Problems with a run of inline pieces: a paragraph, a quote or one list item. */
function inlineProblems(pieces: unknown, where: string, pages: ReadonlySet<string>): string[] {
  if (!Array.isArray(pieces) || pieces.length === 0) return [`${where} is empty`];
  const problems: string[] = [];
  let text = '';
  pieces.forEach((piece: unknown, index) => {
    const at = `${where}, piece ${index + 1}`;
    if (typeof piece === 'string') {
      if (hasInvisible(piece)) problems.push(`${at} ${INVISIBLE_PROBLEM}`);
      else text += piece;
    } else if (piece && typeof piece === 'object' && 'code' in piece) {
      // Checked before either kind's rules, so a renderer that tests for `href` first never meets
      // a link this checker read as code.
      if ('text' in piece || 'href' in piece) {
        problems.push(`${at} is both inline code and a link`);
        return;
      }
      const { code } = piece as { code: unknown };
      if (typeof code !== 'string' || !code.trim()) {
        problems.push(`${at}: the inline code is empty`);
      } else if (hasInvisible(code)) {
        problems.push(`${at}: the inline code ${INVISIBLE_PROBLEM}`);
      } else text += code;
    } else if (piece && typeof piece === 'object' && 'href' in piece) {
      const { text: label, href } = piece as { text: unknown; href: unknown };
      if (typeof label !== 'string' || !label.trim()) {
        problems.push(`${at}: the link has no text`);
      } else if (hasInvisible(label)) {
        problems.push(`${at}: the link text ${INVISIBLE_PROBLEM}`);
      } else if (VAGUE_LINK_TEXT.test(label.trim())) {
        problems.push(`${at}: the link text ${JSON.stringify(label)} does not say where it goes`);
      } else text += label;
      if (typeof href !== 'string' || !HREF.test(href)) {
        problems.push(
          `${at}: the link goes to ${JSON.stringify(href)}, which is neither an https URL nor a path on this site`,
        );
      } else if (href.startsWith('/') && !pages.has(href.split(/[?#]/)[0])) {
        problems.push(
          `${at}: the link goes to ${JSON.stringify(href)}, which is no page on this site`,
        );
      }
    } else {
      problems.push(`${at} is not text, code or a link`);
    }
  });
  if (problems.length === 0 && !text.trim()) problems.push(`${where} is empty`);
  return problems;
}

function blockProblems(block: PostBlock, where: string, pages: ReadonlySet<string>): string[] {
  switch (block.kind) {
    case 'heading': {
      const problems: string[] = [];
      if (block.level !== 2 && block.level !== 3) {
        problems.push(`${where}: heading level ${String(block.level)} is not 2 or 3`);
      }
      problems.push(...lineProblems(block.text, `${where}: the heading`));
      return problems;
    }
    case 'paragraph':
      return inlineProblems(block.content, `${where} (paragraph)`, pages);
    case 'quote':
      return inlineProblems(block.content, `${where} (quote)`, pages);
    case 'list':
      if (!Array.isArray(block.items) || block.items.length === 0) {
        return [`${where}: the list has no items`];
      }
      return block.items.flatMap((item, index) =>
        inlineProblems(item, `${where} (list item ${index + 1})`, pages),
      );
    case 'code': {
      const problems: string[] = [];
      if (typeof block.code !== 'string' || !block.code.trim()) {
        problems.push(`${where}: the code block is empty`);
      }
      const { language }: { language?: unknown } = block;
      if (language !== undefined && (typeof language !== 'string' || !LANGUAGE.test(language))) {
        problems.push(
          `${where}: the code language ${JSON.stringify(language)} is not a plain name such as ts`,
        );
      }
      return problems;
    }
    case 'table': {
      const problems = lineProblems(block.caption, `${where}: the table caption`);
      const { columns, rows }: { columns: unknown; rows: unknown } = block;
      if (!Array.isArray(columns) || columns.length < 2) {
        const count = Array.isArray(columns) ? columns.length : 0;
        problems.push(
          `${where}: the table has ${count} column${count === 1 ? '' : 's'}; it needs the row headers and a column of values`,
        );
        return problems;
      }
      // A reader moves between rows by their headers, and hears each cell with its column's name,
      // so two rows or two columns with one name could not be told apart (`data-table.test.tsx`
      // holds the site's own tables to unique row headers). Compared ignoring case, as headings and
      // tags are, since a screen reader says both alike; a blank one is reported as blank only.
      const names = new Set<string>();
      columns.forEach((column: unknown, index) => {
        const [problem] = lineProblems(column, `${where}: column ${index + 1}`);
        if (problem) {
          problems.push(problem);
          return;
        }
        const key = String(column).toLowerCase();
        if (names.has(key)) {
          problems.push(
            `${where}: column ${index + 1}, ${JSON.stringify(column)}, repeats an earlier column name`,
          );
        }
        names.add(key);
      });
      if (!Array.isArray(rows) || rows.length === 0) {
        return [...problems, `${where}: the table has no rows`];
      }
      // Below 640px a wide table draws no column names: each row is its header and first value
      // joined by a drawn " · ", then each other value on a line of its own. A blank first value
      // leaves the dot pointing at nothing, and a blank later one an empty line that shifts which
      // value a reader takes for which column. `stackable()` in `lib/serialise.ts` refuses the same
      // in the site's own tables, and `isWideTable` is the predicate both the page and it use.
      const stacks = isWideTable({ columns });
      const headers = new Set<string>();
      rows.forEach((row: unknown, index) => {
        const at = `${where}: row ${index + 1}`;
        if (!Array.isArray(row) || row.length !== columns.length) {
          problems.push(
            `${at} has ${Array.isArray(row) ? row.length : 0} cells for ${columns.length} columns`,
          );
          return;
        }
        const [headerProblem] = lineProblems(row[0], `${at}: the row header`);
        if (headerProblem) problems.push(headerProblem);
        else {
          const key = String(row[0]).toLowerCase();
          if (headers.has(key)) {
            problems.push(
              `${at}: the row header ${JSON.stringify(row[0])} repeats an earlier row header`,
            );
          }
          headers.add(key);
        }
        row.slice(1).forEach((cell: unknown, offset) => {
          const cellAt = `${at}, column ${offset + 2}`;
          if (typeof cell !== 'string') problems.push(`${cellAt} is not text`);
          else if (hasInvisible(cell)) problems.push(`${cellAt} ${INVISIBLE_PROBLEM}`);
          else if (stacks && !cell.trim()) {
            problems.push(
              `${cellAt} is blank, and a table of three or more columns cannot show a blank cell on a phone`,
            );
          }
        });
      });
      return problems;
    }
    default: {
      const { kind } = block as { kind?: unknown };
      return [`${where}: unknown block kind ${JSON.stringify(kind)}`];
    }
  }
}

/**
 * A post's dates, drafts included: a date a draft gives must already be a real day, so publishing
 * it cannot surprise anyone. Only a published post must have both, and only a published post is
 * held to "not in the future", which counts a day as begun once UTC+14 has reached it
 * (`isPublishableContentDate`).
 */
function dateProblems(post: Post, today: Date): string[] {
  const problems: string[] = [];
  const published = post.draft === false;
  const valid: Partial<Record<'publishedAt' | 'updatedAt', string>> = {};
  for (const field of ['publishedAt', 'updatedAt'] as const) {
    const value: unknown = post[field];
    if (value === undefined) {
      if (published) problems.push(`${post.slug}: a published post needs ${field}`);
    } else if (typeof value !== 'string' || formatContentDate(value) === null) {
      problems.push(
        `${post.slug}: ${field} ${JSON.stringify(value)} is not a real YYYY-MM-DD day from 2000 on`,
      );
    } else {
      valid[field] = value;
      if (published && !isPublishableContentDate(value, today)) {
        problems.push(`${post.slug}: ${field} ${value} is in the future`);
      }
    }
  }
  if (valid.publishedAt && valid.updatedAt && valid.updatedAt < valid.publishedAt) {
    problems.push(
      `${post.slug}: updatedAt ${valid.updatedAt} is before publishedAt ${valid.publishedAt}`,
    );
  }
  return problems;
}

/** The kinds a post may have: the keys of `FOOTER_LINES`, which names every kind once. */
const KINDS: readonly unknown[] = Object.keys(FOOTER_LINES);

/**
 * Jev or TypeSafe as their owners write them, as a whole word. No letter, mark, digit or underscore
 * may stand on either side, in any script: an ASCII `\b` would take the `đ` of "Jevđević" for a
 * word edge. So "Jevtić" and "TypeSafety" are not the names, and "Jev's" is.
 */
const JEV_NAMES = /(?<![\p{L}\p{M}\p{N}_])(?:Jev|TypeSafe)(?![\p{L}\p{M}\p{N}_])/u;

/**
 * Fields whose values a reader is never shown as text: identifiers, dates, flags. A link's `href`
 * is not one of them, because the Markdown twin prints a link's URL after its text. `slug` stays:
 * `SLUG` allows lowercase letters, digits and hyphens only, so a slug can never hold either name.
 */
const NOT_SHOWN = new Set([
  'slug',
  'kind',
  'draft',
  'publishedAt',
  'updatedAt',
  'level',
  'ordered',
]);

/**
 * Every string a post shows, each with its path in the post (`body[2].content[1].text`). The walk
 * is generic, so a block kind added later is covered without a change here.
 */
function shownTexts(value: unknown, path: string): [path: string, text: string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) => shownTexts(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      NOT_SHOWN.has(key) ? [] : shownTexts(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

function kindProblems(post: Post): string[] {
  const { kind }: { kind: unknown } = post;
  if (KINDS.includes(kind)) return [];
  const known = KINDS.map((each) => JSON.stringify(each)).join(' or ');
  return [`${post.slug}: kind must be ${known}, not ${JSON.stringify(kind)}`];
}

/** A published post that names Jev or TypeSafe must be `jev`, so that it carries the disclosure. */
function namingProblems(post: PublishedPost): string[] {
  if (post.kind === 'jev') return [];
  return shownTexts(post, '').flatMap(([path, text]) => {
    const name = JEV_NAMES.exec(text)?.[0];
    return name
      ? [
          `${post.slug}: ${path} names "${name}", so its kind must be "jev", not ${JSON.stringify(post.kind)}`,
        ]
      : [];
  });
}

/** What a published post must hold before anything renders it. */
function contentProblems(post: PublishedPost, pages: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const name = post.slug;
  problems.push(...lineProblems(post.title, `${name}: the title`));
  if (post.metaTitle !== undefined) {
    const [problem] = lineProblems(post.metaTitle, `${name}: metaTitle`);
    if (problem) {
      problems.push(
        problem.endsWith(' is empty') ? `${problem}; leave it out to use the title` : problem,
      );
    }
  }
  const shown: unknown = post.metaTitle ?? post.title;
  if (typeof shown === 'string') {
    const served = `${shown}${TITLE_SUFFIX}`;
    if (characters(served) > TITLE_MAX) {
      problems.push(
        `${name}: the served title "${served}" is ${characters(served)} characters, over ${TITLE_MAX}: shorten the title or set a metaTitle`,
      );
    }
  }
  const summaryProblems = lineProblems(post.summary, `${name}: the summary`);
  problems.push(...summaryProblems);
  if (summaryProblems.length === 0) {
    const summary = characters(post.summary);
    if (summary < SUMMARY_MIN || summary > SUMMARY_MAX) {
      problems.push(
        `${name}: the summary is ${summary} characters, outside ${SUMMARY_MIN}-${SUMMARY_MAX}`,
      );
    }
  }
  const { tags }: { tags: unknown } = post;
  if (!Array.isArray(tags)) {
    problems.push(`${name}: tags is not a list`);
  } else {
    const seen = new Set<string>();
    tags.forEach((tag: unknown, index) => {
      const [problem] = lineProblems(tag, `${name}: tag ${index + 1}`);
      if (problem) {
        problems.push(problem);
        return;
      }
      const key = String(tag).toLowerCase();
      if (seen.has(key)) {
        problems.push(`${name}: tag ${index + 1}, ${JSON.stringify(tag)}, repeats an earlier tag`);
      }
      seen.add(key);
    });
  }
  if (!Array.isArray(post.body) || post.body.length === 0) {
    problems.push(`${name}: the body has no blocks`);
    return problems;
  }
  // The page's one h1 is the title, so the body's headings start at 2, and a 3 needs a 2 above it:
  // a skipped level is an axe `heading-order` finding on the post page. Two headings with one text
  // would give their anchors one id.
  let underLevelTwo = false;
  const headings = new Set<string>();
  post.body.forEach((block: unknown, index) => {
    const where = `${name}: block ${index + 1}`;
    if (!block || typeof block !== 'object') {
      problems.push(`${where} is not a block`);
      return;
    }
    problems.push(...blockProblems(block as PostBlock, where, pages));
    const { kind, level, text } = block as { kind?: unknown; level?: unknown; text?: unknown };
    if (kind !== 'heading') return;
    if (level === 2) underLevelTwo = true;
    if (level === 3 && !underLevelTwo) {
      problems.push(`${where}: a level-3 heading comes before any level-2 heading`);
    }
    if (typeof text === 'string' && text.trim()) {
      const key = text.trim().toLowerCase();
      if (headings.has(key)) {
        problems.push(`${where}: the heading ${JSON.stringify(text)} repeats an earlier heading`);
      }
      headings.add(key);
    }
  });
  return problems;
}

/**
 * Every problem with `list` as of `today`, one message each, or none. A kind is checked on every
 * post, and the names only on a published one. A slug is checked on every post, since a draft
 * keeps its slug when it is published. A draft is otherwise held only to the dates it gives: it
 * renders nowhere, so its title, summary and body are checked once it is published, in the commit
 * that sets `draft: false`. A link to this site has to name a static route, a case study or a
 * published post in `list`, so a link to a draft is refused too.
 */
function problemsIn(list: readonly Post[], today: Date): string[] {
  const problems: string[] = [];
  const pages = pagesFor(list);
  const counts = new Map<string, number>();
  for (const { slug } of list) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  for (const [slug, count] of counts) {
    if (count > 1) problems.push(`slug "${slug}" is used by ${count} posts`);
  }
  for (const post of list) {
    if (typeof post.slug !== 'string' || !SLUG.test(post.slug)) {
      problems.push(
        `${post.slug}: slug ${JSON.stringify(post.slug)} is not lowercase words joined by single hyphens`,
      );
    }
    const { draft }: { draft: unknown } = post;
    if (draft !== true && draft !== false) {
      problems.push(`${post.slug}: draft must be true or false, not ${JSON.stringify(draft)}`);
    }
    problems.push(...kindProblems(post));
    problems.push(...dateProblems(post, today));
    if (post.draft === false)
      problems.push(...contentProblems(post, pages), ...namingProblems(post));
  }
  return problems;
}

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const POSTS_MODULE = join(SRC, 'data', 'posts');

const isClient = (source: string) => /^\s*['"]use client['"]/.test(source);

/** Where `from`, imported by `file`, points under `src`, without its extension; `''` for a package. */
function targetOf(file: string, from: string): string {
  const target = from.startsWith('@/')
    ? join(SRC, from.slice(2))
    : from.startsWith('.')
      ? resolve(dirname(file), from)
      : '';
  return target.replace(/\.tsx?$/, '');
}

/** The import and re-export statements of `source` that bring in values: not `import type`. */
function valueImports(source: string): { bindings: string; from: string; names: string[] }[] {
  const found: { bindings: string; from: string; names: string[] }[] = [];
  const statements = source.matchAll(
    /^(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm,
  );
  for (const [, typeOnly, bindings, from] of statements) {
    if (typeOnly) continue;
    const names = (/\{([^}]*)\}/.exec(bindings)?.[1] ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('type '))
      .map((part) => part.split(/\s+as\s+/)[0]);
    // `import { type A, type B } from` brings in nothing; a default or namespace import does.
    const braces = /\{[^}]*\}/.exec(bindings);
    const outside = bindings
      .replace(/\{[^}]*\}/, '')
      .replace(/,/g, '')
      .trim();
    if (names.length > 0 || outside || !braces) found.push({ bindings, from, names });
  }
  // A bare `import '...'` runs the module for its effects, which bundles it as surely.
  for (const [, from] of source.matchAll(/^import\s*['"]([^'"]+)['"]/gm)) {
    found.push({ bindings: '', from, names: [] });
  }
  return found;
}

/**
 * The server modules that carry the posts module's values to whatever imports them: those that
 * import it, then those that import one of them, and so on (`lib/metadata.ts` for
 * `hasPublishedPosts`, `lib/atom.ts` for `buildPostIndex`, and every page reading either). A client
 * component importing one bundles the posts as surely as importing them directly. Paths without
 * their extension, as `targetOf` returns them.
 */
function postsCarriers(files: readonly { file: string; source: string }[]): Set<string> {
  const carriers = new Set<string>();
  const carries = (target: string) =>
    target === POSTS_MODULE || carriers.has(target) || carriers.has(join(target, 'index'));
  let grew = true;
  while (grew) {
    grew = false;
    for (const { file, source } of files) {
      const self = file.replace(/\.tsx?$/, '');
      if (self === POSTS_MODULE || carriers.has(self) || isClient(source)) continue;
      if (valueImports(source).some(({ from }) => carries(targetOf(file, from)))) {
        carriers.add(self);
        grew = true;
      }
    }
  }
  return carriers;
}

/**
 * What one source file does against ADR 0028's third decision: import `posts` itself, or the whole
 * module as a namespace, rather than the index; or import the module's values into a client
 * component, which bundles the whole array, drafts and all, into JavaScript sent to the browser,
 * whether directly or through one of `carriers` (`postsCarriers`). A type-only import compiles
 * away, so it is always allowed.
 */
function postsImportProblems(
  file: string,
  source: string,
  carriers: ReadonlySet<string> = new Set(),
): string[] {
  const problems: string[] = [];
  const at = relative(SRC, file);
  const client = isClient(source);
  for (const { bindings, from, names } of valueImports(source)) {
    const target = targetOf(file, from);
    if (target === POSTS_MODULE) {
      if (names.includes('posts') || bindings.includes('*')) {
        problems.push(
          `${at}: reads posts itself; read publishedPosts, hasPublishedPosts or getPost`,
        );
      } else if (client) {
        problems.push(`${at}: a client component imports ${from}, which ships the drafts`);
      }
    } else if (client && (carriers.has(target) || carriers.has(join(target, 'index')))) {
      problems.push(
        `${at}: a client component imports ${from}, which imports the posts and ships the drafts`,
      );
    }
  }
  return problems;
}

/** A fixed day for the defect table, so "in the future" does not depend on when the suite runs. */
const TODAY = new Date('2026-09-28T12:00:00Z');

/** The every-block fixture with some fields replaced, cast so a test can break the types too. */
const published = (fields: Record<string, unknown>): Post =>
  ({ ...everyBlockPost, ...fields }) as unknown as Post;
const withBody = (...body: unknown[]): Post => published({ body });
const paragraph = (...content: unknown[]) => ({ kind: 'paragraph', content });
const heading = (level: unknown, text = `A level-${String(level)} heading`) => ({
  kind: 'heading',
  level,
  text,
});
const withLink = (href: string, text = 'the linked page') =>
  withBody(paragraph('See ', { text, href }, '.'));
const withTags = (...tags: unknown[]) => published({ tags });
const withCode = (language: unknown, code = 'const fixture = 1;') =>
  withBody({ kind: 'code', language, code });
const tableBlock = (fields: Record<string, unknown> = {}) => ({
  kind: 'table',
  caption: 'Fixture results',
  columns: ['Run', 'Tokens', 'Cost'],
  rows: [['First run', '1,234', '$0.10']],
  ...fields,
});
const withTable = (fields: Record<string, unknown>) => withBody(tableBlock(fields));
const withTitle = (title: string, metaTitle?: string) =>
  published(metaTitle === undefined ? { title } : { title, metaTitle });
const summaryOf = (length: number) => published({ summary: 'x'.repeat(length) });
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const defects: [string, Post[], RegExp][] = [
  [
    'a slug used twice',
    [everyBlockPost, { ...hostileTitlePost, slug: everyBlockPost.slug }],
    /^slug "fixture-every-block" is used by 2 posts$/,
  ],
  ...[
    'Fixture-post',
    'fixture--post',
    '-fixture',
    'fixture-',
    'fixture post',
    'fixture/post',
    'fixture_post',
    '',
  ].map((slug): [string, Post[], RegExp] => [
    `the slug ${JSON.stringify(slug)}`,
    [published({ slug })],
    /: slug ".*" is not lowercase words joined by single hyphens$/,
  ]),
  [
    'a draft flag that is neither true nor false',
    [published({ draft: undefined })],
    /: draft must be true or false, not undefined$/,
  ],
  [
    'a published post with no publishedAt',
    [published({ publishedAt: undefined })],
    /: a published post needs publishedAt$/,
  ],
  [
    'a published post with no updatedAt',
    [published({ updatedAt: undefined })],
    /: a published post needs updatedAt$/,
  ],
  [
    'a date that is not YYYY-MM-DD',
    [published({ publishedAt: '2026-8-03' })],
    /: publishedAt "2026-8-03" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a date that is not a real day',
    [published({ updatedAt: '2026-02-30' })],
    /: updatedAt "2026-02-30" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a date before 2000',
    [published({ publishedAt: '0026-08-03' })],
    /: publishedAt "0026-08-03" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a timestamp in place of a day',
    [published({ updatedAt: '2026-08-20T10:00:00Z' })],
    /: updatedAt "2026-08-20T10:00:00Z" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'an update before publication',
    [published({ publishedAt: '2026-08-20', updatedAt: '2026-08-03' })],
    /: updatedAt 2026-08-03 is before publishedAt 2026-08-20$/,
  ],
  [
    'an update in the future',
    [published({ updatedAt: '2026-10-05' })],
    /: updatedAt 2026-10-05 is in the future$/,
  ],
  [
    'a draft with a date that is not a real day',
    [{ ...draftPost, publishedAt: '2026-13-01' }],
    /^fixture-draft: publishedAt "2026-13-01" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a draft updated before it was published',
    [{ ...draftPost, publishedAt: '2026-09-02', updatedAt: '2026-09-01' }],
    /^fixture-draft: updatedAt 2026-09-01 is before publishedAt 2026-09-02$/,
  ],
  [
    'a summary one character too short',
    [summaryOf(SUMMARY_MIN - 1)],
    /: the summary is 49 characters, outside 50-300$/,
  ],
  [
    'a summary one character too long',
    [summaryOf(SUMMARY_MAX + 1)],
    /: the summary is 301 characters, outside 50-300$/,
  ],
  ['an empty title', [withTitle('  ')], /: the title is empty$/],
  [
    'an empty metaTitle',
    [withTitle('A title', '')],
    /: metaTitle is empty; leave it out to use the title$/,
  ],
  [
    'a served title one character too long',
    [withTitle('x'.repeat(TITLE_MAX - characters(TITLE_SUFFIX) + 1))],
    /: the served title ".*" is 61 characters, over 60: shorten the title or set a metaTitle$/,
  ],
  [
    'a metaTitle that is itself too long',
    [withTitle('Short', 'y'.repeat(TITLE_MAX))],
    /: the served title ".*" is 78 characters, over 60/,
  ],
  ['an empty body', [withBody()], /: the body has no blocks$/],
  [
    'a level-1 heading',
    [withBody(heading(1), paragraph('Text.'))],
    /: block 1: heading level 1 is not 2 or 3$/,
  ],
  [
    'a level-4 heading',
    [withBody(heading(2), heading(4))],
    /: block 2: heading level 4 is not 2 or 3$/,
  ],
  [
    'a level-3 heading before any level-2 heading',
    [withBody(paragraph('Text.'), heading(3), heading(2))],
    /: block 2: a level-3 heading comes before any level-2 heading$/,
  ],
  ['an empty heading', [withBody(heading(2, ' '))], /: block 1: the heading is empty$/],
  ['a paragraph with no pieces', [withBody(paragraph())], /: block 1 \(paragraph\) is empty$/],
  [
    'a paragraph of blank text',
    [withBody(paragraph(' ', ''))],
    /: block 1 \(paragraph\) is empty$/,
  ],
  [
    'a quote with no pieces',
    [withBody({ kind: 'quote', content: [] })],
    /: block 1 \(quote\) is empty$/,
  ],
  [
    'a list with no items',
    [withBody({ kind: 'list', items: [] })],
    /: block 1: the list has no items$/,
  ],
  [
    'an empty list item',
    [withBody({ kind: 'list', items: [['One.'], []] })],
    /: block 1 \(list item 2\) is empty$/,
  ],
  [
    'an empty code block',
    [withBody({ kind: 'code', language: 'ts', code: '\n' })],
    /: block 1: the code block is empty$/,
  ],
  [
    'a table with no caption',
    [withTable({ caption: '' })],
    /: block 1: the table caption is empty$/,
  ],
  [
    'a table with one column',
    [withTable({ columns: ['Run'], rows: [['First run']] })],
    /: block 1: the table has 1 column; it needs the row headers and a column of values$/,
  ],
  [
    'a table with an empty column name',
    [withTable({ columns: ['Run', '', 'Cost'] })],
    /: block 1: column 2 is empty$/,
  ],
  ['a table with no rows', [withTable({ rows: [] })], /: block 1: the table has no rows$/],
  [
    'a short table row',
    [withTable({ rows: [['First run', '1,234']] })],
    /: block 1: row 1 has 2 cells for 3 columns$/,
  ],
  [
    'a table row with no header',
    [withTable({ rows: [['', '1,234', '$0.10']] })],
    /: block 1: row 1: the row header is empty$/,
  ],
  [
    'a blank cell in a table of three columns',
    [withTable({ rows: [['First run', ' ', '$0.10']] })],
    /: block 1: row 1, column 2 is blank, and a table of three or more columns cannot show a blank cell on a phone$/,
  ],
  [
    'a table cell with a line break',
    [withTable({ rows: [['First run', '1,234\n5', '$0.10']] })],
    /: block 1: row 1, column 2 holds a line break, a control or a direction character$/,
  ],
  [
    'a table row longer than its columns',
    [withTable({ rows: [['First run', '1,234', '$0.10', 'Extra']] })],
    /: block 1: row 1 has 4 cells for 3 columns$/,
  ],
  [
    'a blank last cell in a table of three columns',
    [withTable({ rows: [['First run', '1,234', '']] })],
    /: block 1: row 1, column 3 is blank, and a table of three or more columns cannot show a blank cell on a phone$/,
  ],
  [
    'a table cell that is not text',
    [withTable({ rows: [['First run', 1234, '$0.10']] })],
    /: block 1: row 1, column 2 is not text$/,
  ],
  [
    'a column name used twice, in another case',
    [withTable({ columns: ['Run', 'Cost', 'cost'], rows: [['First run', '$0.10', '$0.20']] })],
    /: block 1: column 3, "cost", repeats an earlier column name$/,
  ],
  [
    'a row header used twice, in another case',
    [
      withTable({
        rows: [
          ['First run', '1,234', '$0.10'],
          ['first run', '987', '$0.08'],
        ],
      }),
    ],
    /: block 1: row 2: the row header "first run" repeats an earlier row header$/,
  ],
  [
    'a row header with two spaces in a row',
    [withTable({ rows: [['First  run', '1,234', '$0.10']] })],
    /: block 1: row 1: the row header has a space at an end or two in a row$/,
  ],
  [
    'an empty piece of inline code',
    [withBody(paragraph('Run ', { code: '' }, '.'))],
    /: block 1 \(paragraph\), piece 2: the inline code is empty$/,
  ],
  [
    'a link with no text',
    [withBody(paragraph('See ', { text: ' ', href: '/work' }, '.'))],
    /: block 1 \(paragraph\), piece 2: the link has no text$/,
  ],
  [
    'an inline piece of no known kind',
    [withBody(paragraph({ bold: 'Text' }))],
    /: block 1 \(paragraph\), piece 1 is not text, code or a link$/,
  ],
  [
    'a block of no known kind',
    [withBody({ kind: 'html', content: '<p>Text.</p>' })],
    /: block 1: unknown block kind "html"$/,
  ],
  ...[
    'http://example.com',
    'example.com',
    'work',
    '#section',
    '//example.com',
    '/\\example.com',
    'javascript:alert(1)',
    'mailto:someone@example.com',
    'https://',
    'https:///path',
    'https://exa mple.com',
    '/work page',
    '',
    '/a<b',
    '/a"b',
    '/a`b',
    '/a\u0001b',
    '/work\u200b',
    'https://u:p@example.com',
    'https://miloscvetkovic.dev@evil.example/',
    'https://localhost:3000/',
    'https://example.com/\u202egnp.exe',
    'https://ex\u00e4mple.com',
  ].map((href): [string, Post[], RegExp] => [
    `a link to ${JSON.stringify(href)}`,
    [withLink(href)],
    /, piece 2: the link goes to ".*", which is neither an https URL nor a path on this site$/,
  ]),
  ...['/wrok', '/work/', '/work/no-such-study', '/blog/no-such-post'].map(
    (href): [string, Post[], RegExp] => [
      `a link to ${href}, which is no page`,
      [withLink(href)],
      /, piece 2: the link goes to ".*", which is no page on this site$/,
    ],
  ),
  [
    'a link to a draft',
    [withLink('/blog/fixture-draft'), draftPost],
    /, piece 2: the link goes to "\/blog\/fixture-draft", which is no page on this site$/,
  ],
  [
    'a piece that is both inline code and a link',
    [withBody(paragraph('See ', { code: 'x', text: 'y', href: 'javascript:alert(1)' }, '.'))],
    /: block 1 \(paragraph\), piece 2 is both inline code and a link$/,
  ],
  ...['here', 'Click here.', 'this', 'Read more'].map((text): [string, Post[], RegExp] => [
    `the link text ${JSON.stringify(text)}`,
    [withLink('/work', text)],
    /, piece 2: the link text ".*" does not say where it goes$/,
  ]),
  [
    'a line break in running text',
    [withBody(paragraph('One line\nand another.'))],
    /: block 1 \(paragraph\), piece 1 holds a line break, a control or a direction character$/,
  ],
  [
    'a direction override in running text',
    [withBody(paragraph('Text \u202ereversed.'))],
    /: block 1 \(paragraph\), piece 1 holds a line break, a control or a direction character$/,
  ],
  [
    'a line break in inline code',
    [withBody(paragraph('Run ', { code: 'a\nb' }, '.'))],
    /, piece 2: the inline code holds a line break, a control or a direction character$/,
  ],
  [
    'a tab in link text',
    [withLink('/work', 'the\twork page')],
    /, piece 2: the link text holds a line break, a control or a direction character$/,
  ],
  [
    'a line break in a heading',
    [withBody(heading(2, 'Two\nlines'))],
    /: block 1: the heading holds a line break, a control or a direction character$/,
  ],
  [
    'a heading with a leading space',
    [withBody(heading(2, ' Padded'))],
    /: block 1: the heading has a space at an end or two in a row$/,
  ],
  [
    'a heading that repeats an earlier one',
    [withBody(heading(2, 'Results'), paragraph('Text.'), heading(2, 'results'))],
    /: block 3: the heading "results" repeats an earlier heading$/,
  ],
  [
    'a title with two spaces in a row',
    [withTitle('A  title')],
    /: the title has a space at an end or two in a row$/,
  ],
  [
    'a title with a line break',
    [withTitle('A\ntitle')],
    /: the title holds a line break, a control or a direction character$/,
  ],
  [
    'a metaTitle with a trailing space',
    [withTitle('A title', 'Short ')],
    /: metaTitle has a space at an end or two in a row$/,
  ],
  [
    'a summary with a leading space',
    [published({ summary: ` ${'x'.repeat(SUMMARY_MIN)}` })],
    /: the summary has a space at an end or two in a row$/,
  ],
  ['a missing title', [published({ title: undefined })], /: the title is empty$/],
  ['a missing summary', [published({ summary: undefined })], /: the summary is empty$/],
  [
    'a null metaTitle',
    [published({ metaTitle: null })],
    /: metaTitle is empty; leave it out to use the title$/,
  ],
  ['tags that are not a list', [published({ tags: 'Fixture' })], /: tags is not a list$/],
  ['a blank tag', [withTags('Fixture', ' ')], /: tag 2 is empty$/],
  [
    'a tag with a leading space',
    [withTags(' Fixture')],
    /: tag 1 has a space at an end or two in a row$/,
  ],
  [
    'a tag repeated in another case',
    [withTags('Testing', 'testing')],
    /: tag 2, "testing", repeats an earlier tag$/,
  ],
  ...['', 'c sharp', 'ts\n# injected', 'ts`'].map((language): [string, Post[], RegExp] => [
    `the code language ${JSON.stringify(language)}`,
    [withCode(language)],
    /: block 1: the code language ".*" is not a plain name such as ts$/,
  ]),
  ['a body entry that is not a block', [withBody(null)], /: block 1 is not a block$/],
  // Each with the value the problem has to report, written out rather than computed.
  ...(
    [
      [undefined, 'undefined'],
      ['Jev', '"Jev"'],
      ['typesafe', '"typesafe"'],
      ['', '""'],
    ] as const
  ).map(([kind, reported]): [string, Post[], RegExp] => [
    `the kind ${reported}`,
    [published({ kind })],
    new RegExp(`^fixture-every-block: kind must be "own" or "jev", not ${escapeRegExp(reported)}$`),
  ]),
  // A draft's kind is checked too: it keeps its kind when it is published.
  [
    'the kind "x" on a draft',
    [{ ...draftPost, kind: 'x' } as unknown as Post],
    /^fixture-draft: kind must be "own" or "jev", not "x"$/,
  ],
  // Each place a post shows text. A name in any of them makes an `own` post a defect (ADR 0034).
  ...(
    [
      ['the title', { title: 'Fixture: what TypeSafe measures' }, 'title', 'TypeSafe'],
      [
        'metaTitle',
        { title: 'Fixture: a title', metaTitle: 'Fixture: Jev in short' },
        'metaTitle',
        'Jev',
      ],
      ['the summary', { summary: `${everyBlockPost.summary} It mentions Jev.` }, 'summary', 'Jev'],
      ['a tag', { tags: ['Fixture', 'Jev'] }, 'tags[1]', 'Jev'],
      ['a heading', { body: [heading(2, 'What Jev gets right')] }, 'body[0].text', 'Jev'],
      ['a paragraph', { body: [paragraph("Jev's numbers.")] }, 'body[0].content[0]', 'Jev'],
      [
        'link text',
        {
          body: [
            paragraph('See ', { text: 'the TypeSafe docs', href: 'https://example.com' }, '.'),
          ],
        },
        'body[0].content[1].text',
        'TypeSafe',
      ],
      // The twin prints a link's URL after its text, so the URL is text the post shows too.
      [
        'a link target',
        {
          body: [
            paragraph(
              'See ',
              { text: 'the example page', href: 'https://example.com/TypeSafe' },
              '.',
            ),
          ],
        },
        'body[0].content[1].href',
        'TypeSafe',
      ],
      [
        'inline code',
        { body: [paragraph('Run ', { code: 'TypeSafe.check()' }, '.')] },
        'body[0].content[1].code',
        'TypeSafe',
      ],
      [
        'a list item',
        { body: [{ kind: 'list', items: [['Ask Jev.']] }] },
        'body[0].items[0][0]',
        'Jev',
      ],
      ['a code block', { body: [{ kind: 'code', code: 'model = "Jev"' }] }, 'body[0].code', 'Jev'],
      // The page names the code figure by its language, and the twin's fence carries it.
      [
        'a code language',
        { body: [{ kind: 'code', language: 'TypeSafe', code: 'x' }] },
        'body[0].language',
        'TypeSafe',
      ],
      [
        'a quote',
        { body: [{ kind: 'quote', content: ['TypeSafe said so.'] }] },
        'body[0].content[0]',
        'TypeSafe',
      ],
      [
        'a table caption',
        { body: [tableBlock({ caption: 'What Jev measured' })] },
        'body[0].caption',
        'Jev',
      ],
      [
        'a table column',
        { body: [tableBlock({ columns: ['Run', 'TypeSafe', 'Cost'] })] },
        'body[0].columns[1]',
        'TypeSafe',
      ],
      [
        'a table cell',
        { body: [tableBlock({ rows: [['First run', 'Jev', '$0.10']] })] },
        'body[0].rows[0][1]',
        'Jev',
      ],
      [
        'a table row header',
        { body: [tableBlock({ rows: [['Jev run', '1,234', '$0.10']] })] },
        'body[0].rows[0][0]',
        'Jev',
      ],
    ] as const
  ).map(([place, fields, path, name]): [string, Post[], RegExp] => [
    `${name} named in ${place} of an own post`,
    [published(fields)],
    new RegExp(
      `^fixture-every-block: ${escapeRegExp(path)} names "${name}", so its kind must be "jev", not "own"$`,
    ),
  ]),
];

const accepted: [string, Post[]][] = [
  ['a draft with no dates and no body', [draftPost]],
  [
    'a draft dated in the future',
    [{ ...draftPost, publishedAt: '2027-01-04', updatedAt: '2027-01-04' }],
  ],
  // At 12:00 UTC on the 28th it is already the 29th in UTC+14, so a post may carry that date.
  ['a date that has begun in UTC+14', [published({ updatedAt: '2026-09-29' })]],
  ['a summary of exactly 50 characters', [summaryOf(SUMMARY_MIN)]],
  ['a summary of exactly 300 characters', [summaryOf(SUMMARY_MAX)]],
  [
    'a served title of exactly 60 characters',
    [withTitle('x'.repeat(TITLE_MAX - characters(TITLE_SUFFIX)))],
  ],
  ['a long title with a short metaTitle', [withTitle('x'.repeat(TITLE_MAX), 'Short')]],
  ...[
    '/',
    '/work/self-healing-agent',
    '/blog#top',
    'https://example.com',
    'https://a.b/c?d=e#f',
    '/work?view=all#top',
    'https://example.com:8443/wiki/A_(b)',
    'https://example.com/%E2%9C%93',
  ].map((href): [string, Post[]] => [`a link to ${href}`, [withLink(href)]]),
  ['a link to a published post', [withLink('/blog/fixture-hostile-title'), hostileTitlePost]],
  [
    'a title with an emoji joined by zero-width joiners',
    [withTitle('Fixture \u{1f468}\u200d\u{1f4bb}')],
  ],
  ['a tag of two words', [withTags('Web performance', 'Testing')]],
  ['no tags', [withTags()]],
  ...['c++', 'c#', 'objective-c', 'TS'].map((language): [string, Post[]] => [
    `the code language ${language}`,
    [withCode(language)],
  ]),
  ['code with backticks and a fence in it', [withCode('md', '```ts\nconst a = `b`;\n```')]],
  [
    'a two-column table with a blank cell',
    [withTable({ columns: ['Run', 'Note'], rows: [['First run', '']] })],
  ],
  ['a table cell with | and * in it', [withTable({ rows: [['First run', 'a | b', '*']] })]],
  [
    'headings with one text at different places in two posts',
    [
      withBody(heading(2, 'Results')),
      { ...hostileTitlePost, body: [{ kind: 'heading', level: 2, text: 'Results' }] },
    ],
  ],
  [
    'a jev post that names TypeSafe and Jev',
    [published({ kind: 'jev', title: 'Fixture: TypeSafe and Jev' })],
  ],
  ['a jev post that names neither', [published({ kind: 'jev' })]],
  // A draft renders nowhere, so the names are checked once it is published.
  ['a draft that names Jev', [{ ...draftPost, title: 'Fixture: Jev' }]],
  // Not the names: a surname that starts with one, whether the letter after it is ASCII or not, a
  // longer word, another case.
  ...['Jevtić', 'Jevđević', 'Jevremović', 'TypeSafety', 'typesafe', 'type-safe', 'JEV'].map(
    (word): [string, Post[]] => [
      `${word} in an own post`,
      [withBody(paragraph(`A sentence with ${word} in it.`))],
    ],
  ),
  // Not the names either: a letter, digit, underscore or combining mark against one edge.
  ...[
    ['a letter before Jev', 'ŠJev'],
    ['a digit before Jev', '2Jev'],
    ['an underscore before Jev', '_Jev'],
    ['a combining acute accent before Jev', 'e\u0301Jev'],
    ['a letter before TypeSafe', 'MyTypeSafe'],
    ['a digit after Jev', 'Jev2'],
    ['an underscore after Jev', 'Jev_'],
    ['a combining acute accent after Jev', 'Jev\u0301'],
    ['a digit after TypeSafe', 'TypeSafe2'],
    ['an underscore after TypeSafe', 'TypeSafe_'],
  ].map(([edge, word]): [string, Post[]] => [
    `${edge} in an own post`,
    [withBody(paragraph(`A sentence with ${word} in it.`))],
  ]),
  // The match is case-sensitive (ADR 0034), so a lowercase domain in a link's URL is not the name.
  [
    'an own post linking to a lowercase typesafe domain',
    [withLink('https://typesafe.dev/docs', 'their docs')],
  ],
];

describe('posts', () => {
  it('pass the post checker', () => {
    // The live clock is deliberate: "not in the future" is a statement about the day the suite runs.
    expect(problemsIn(posts, new Date())).toEqual([]);
  });

  it('publish exactly what buildPostIndex selects from them', () => {
    const index = buildPostIndex(posts);
    expect(publishedPosts).toEqual(index.publishedPosts);
    expect(hasPublishedPosts).toBe(index.hasPublishedPosts);
    expect(hasPublishedPosts).toBe(publishedPosts.length > 0);
    expect(publishedPosts.every((post) => post.draft === false)).toBe(true);
  });

  it('find every published post by its slug, and nothing at an unknown one', () => {
    for (const post of publishedPosts) expect(getPost(post.slug)).toBe(post);
    expect(getPost('does-not-exist')).toBeUndefined();
    for (const post of posts.filter((candidate) => candidate.draft)) {
      expect(getPost(post.slug), post.slug).toBeUndefined();
    }
  });

  it('can never take the placeholder slug the development server is given', () => {
    // `postStaticParams` hands `next dev` this slug while nothing is published; the slug rule is
    // what keeps a real post from ever answering at it.
    expect(SLUG.test(NO_PUBLISHED_POST_SLUG)).toBe(false);
    expect(getPost(NO_PUBLISHED_POST_SLUG)).toBeUndefined();
  });
});

describe('buildPostIndex', () => {
  const index = buildPostIndex(fixturePosts);

  it('lists the published posts newest first and leaves the draft out', () => {
    expect(index.publishedPosts.map(({ slug }) => slug)).toEqual([
      'fixture-hostile-title',
      'fixture-every-block',
    ]);
    expect(index.hasPublishedPosts).toBe(true);
  });

  it('finds a published post, and nothing for a draft or an unknown slug', () => {
    expect(index.getPost('fixture-every-block')).toBe(everyBlockPost);
    expect(index.getPost('fixture-draft')).toBeUndefined();
    expect(index.getPost('does-not-exist')).toBeUndefined();
  });

  it('orders posts published on one day by the newer update, then by slug', () => {
    const day = { publishedAt: '2026-09-01', updatedAt: '2026-09-01' };
    const a = { ...everyBlockPost, ...day, slug: 'a' };
    const b = { ...everyBlockPost, ...day, slug: 'b' };
    const c = { ...everyBlockPost, ...day, slug: 'c', updatedAt: '2026-09-03' };
    expect(buildPostIndex([b, a, c]).publishedPosts.map(({ slug }) => slug)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('does not reorder the list it is given', () => {
    const list = [...fixturePosts];
    buildPostIndex(list);
    expect(list).toEqual(fixturePosts);
  });

  it('has nothing published when there are no posts, or only drafts', () => {
    for (const list of [[], [draftPost]]) {
      const empty = buildPostIndex(list);
      expect(empty.publishedPosts).toEqual([]);
      expect(empty.hasPublishedPosts).toBe(false);
      expect(empty.getPost('fixture-draft')).toBeUndefined();
    }
  });
});

describe('the post fixtures', () => {
  const publishedFixtures = fixturePosts.filter((post) => post.draft === false);
  const blocks = publishedFixtures.flatMap(({ body }) => body);

  it('pass the post checker', () => {
    expect(problemsIn(fixturePosts, new Date())).toEqual([]);
  });

  it('hold every block kind, both heading levels, both list styles and both code forms', () => {
    // `satisfies` fails typecheck when a kind is added to PostBlock without being added here.
    const kinds = {
      heading: true,
      paragraph: true,
      list: true,
      code: true,
      quote: true,
      table: true,
    } satisfies Record<PostBlock['kind'], true>;
    expect(new Set(blocks.map(({ kind }) => kind))).toEqual(new Set(Object.keys(kinds)));
    const headings = blocks.filter((block) => block.kind === 'heading');
    expect(new Set(headings.map(({ level }) => level))).toEqual(new Set([2, 3]));
    const lists = blocks.filter((block) => block.kind === 'list');
    expect(new Set(lists.map(({ ordered }) => Boolean(ordered)))).toEqual(new Set([true, false]));
    const code = blocks.filter((block) => block.kind === 'code');
    expect(new Set(code.map(({ language }) => language === undefined))).toEqual(
      new Set([true, false]),
    );
  });

  it('hold every inline kind, and links of both allowed forms', () => {
    function inlineKind(piece: Inline): 'text' | 'code' | 'link' {
      if (typeof piece === 'string') return 'text';
      if (piece.code !== undefined) return 'code';
      if ('href' in piece) return 'link';
      // Fails typecheck when a kind is added to Inline without being named above.
      return piece satisfies never;
    }
    const pieces = blocks.flatMap((block) => {
      if (block.kind === 'paragraph' || block.kind === 'quote') return block.content;
      if (block.kind === 'list') return block.items.flat();
      return [];
    });
    expect(new Set(pieces.map(inlineKind))).toEqual(new Set(['text', 'code', 'link']));
    const hrefs = pieces.flatMap((piece) =>
      typeof piece === 'object' && piece.href !== undefined ? [piece.href] : [],
    );
    expect(hrefs.some((href) => href.startsWith('/'))).toBe(true);
    expect(hrefs.some((href) => href.startsWith('https://'))).toBe(true);
  });

  it('hold a published title with &, < and ", a draft, and two published posts oldest first', () => {
    expect(publishedFixtures.map(({ title }) => title)).toContainEqual(
      expect.stringMatching(/&.*<.*"/),
    );
    expect(fixturePosts.filter((post) => post.draft)).toHaveLength(1);
    expect(publishedFixtures).toHaveLength(2);
    const [older, newer] = publishedFixtures;
    expect(older.publishedAt < newer.publishedAt).toBe(true);
  });

  it('hold a published post of each kind', () => {
    // `satisfies` fails typecheck when a kind is added to PostKind without being added here.
    const kinds = { own: true, jev: true } satisfies Record<PostKind, true>;
    expect(new Set(publishedFixtures.map(({ kind }) => kind))).toEqual(new Set(Object.keys(kinds)));
  });
});

describe('problemsIn', () => {
  it.each(defects)('names %s, and nothing else', (_, list, pattern) => {
    const problems = problemsIn(list, TODAY);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
  });

  it.each(accepted)('accepts %s', (_, list) => {
    expect(problemsIn(list, TODAY)).toEqual([]);
  });

  it('refuses a piece that is both code and a link at typecheck, and when a cast lets it through', () => {
    // @ts-expect-error `never` on the other kind's keys: a piece is code or a link, not both.
    const mixed: Inline = { code: 'x', text: 'y', href: 'javascript:alert(1)' };
    expect(problemsIn([withBody(paragraph(mixed))], TODAY)).toEqual([
      expect.stringMatching(/, piece 1 is both inline code and a link$/),
    ]);
  });

  it('names every defect in one post, not only the first', () => {
    const problems = problemsIn(
      [published({ slug: 'Bad', summary: 'Short.', body: [], updatedAt: '2026-02-30' })],
      TODAY,
    );
    expect(problems).toEqual([
      'Bad: slug "Bad" is not lowercase words joined by single hyphens',
      'Bad: updatedAt "2026-02-30" is not a real YYYY-MM-DD day from 2000 on',
      'Bad: the summary is 6 characters, outside 50-300',
      'Bad: the body has no blocks',
    ]);
  });
});

describe('imports of the posts module', () => {
  const sources = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (name) => /\.tsx?$/.test(name) && !/(?:^|[\\/])(?:__tests__|test)[\\/]/.test(name),
  );
  const page = join(SRC, 'app', 'blog', 'page.tsx');

  it('read the index, never posts itself, and never from a client component', () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources.map((name) => join('data', 'posts.ts') === name)).toContain(true);
    const files = sources.map((name) => ({
      file: join(SRC, name),
      source: readFileSync(join(SRC, name), 'utf8'),
    }));
    const carriers = postsCarriers(files);
    // The two modules that bring the posts into every head and into the feed, found by the walk.
    expect(carriers).toContain(join(SRC, 'lib', 'metadata'));
    expect(carriers).toContain(join(SRC, 'lib', 'atom'));
    const offenders = files.flatMap(({ file, source }) =>
      postsImportProblems(file, source, carriers),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    ['by name', "'use client';\nimport { SITE_NAME } from '@/lib/metadata';"],
    ['relatively', "'use client';\nimport { buildAtomFeed } from '../../lib/atom';"],
    ['for its effects', "'use client';\nimport '@/lib/metadata';"],
  ])('names a client component importing a module that carries the posts, %s', (_, source) => {
    const carriers = new Set([join(SRC, 'lib', 'metadata'), join(SRC, 'lib', 'atom')]);
    expect(postsImportProblems(page, source, carriers)).toEqual([
      expect.stringMatching(/a client component imports .*, which imports the posts/),
    ]);
    // A server module may import it, and a client one may import its types.
    expect(postsImportProblems(page, source.replace("'use client';\n", ''), carriers)).toEqual([]);
    expect(
      postsImportProblems(
        page,
        "'use client';\nimport type { Metadata } from '@/lib/metadata';",
        carriers,
      ),
    ).toEqual([]);
  });

  it('finds the carriers through any number of server modules, and stops at a client one', () => {
    const at = (path: string) => join(SRC, path);
    const carriers = postsCarriers([
      { file: at('lib/a.ts'), source: "import { hasPublishedPosts } from '@/data/posts';" },
      { file: at('lib/b.ts'), source: "import { a } from './a';" },
      { file: at('lib/c.ts'), source: "import type { a } from './a';" },
      { file: at('lib/d.tsx'), source: "'use client';\nimport { b } from './b';" },
      { file: at('lib/e.ts'), source: "import { d } from './d';" },
    ]);
    expect([...carriers].sort()).toEqual([at('lib/a'), at('lib/b')]);
  });

  it.each([
    ['posts by name', "import { posts } from '@/data/posts';"],
    ['posts under another name', "import { getPost, posts as all } from '../../data/posts';"],
    ['the module as a namespace', "import * as data from '@/data/posts';"],
    ['a re-export of posts', "export { posts } from '@/data/posts';"],
    [
      'the index into a client component',
      "'use client';\nimport { publishedPosts } from '@/data/posts';",
    ],
    ['the module into a client component for its effects', "'use client';\nimport '@/data/posts';"],
    [
      'the index into a client component across lines',
      "'use client';\nimport {\n  getPost,\n  hasPublishedPosts,\n} from '../../data/posts';",
    ],
  ])('names an import of %s', (_, source) => {
    expect(postsImportProblems(page, source)).toHaveLength(1);
  });

  it.each([
    ['the index', "import { getPost, publishedPosts } from '@/data/posts';"],
    ['types into a client component', "'use client';\nimport type { Post } from '@/data/posts';"],
    [
      'a named type into a client component',
      "'use client';\nimport { type Post } from '@/data/posts';",
    ],
    ['posts from another module', "import { posts } from '@/data/other-posts';"],
  ])('allows an import of %s', (_, source) => {
    expect(postsImportProblems(page, source)).toEqual([]);
  });
});

describe('FOOTER_LINES', () => {
  it("ends a jev post with the owner's disclosure, word for word, and an own post with nothing", () => {
    expect(FOOTER_LINES).toEqual({ own: [], jev: ['I have no relationship with TypeSafe.'] });
  });

  it('holds lines the post checker accepts as text', () => {
    for (const line of Object.values(FOOTER_LINES).flat()) {
      expect(lineProblems(line, 'a footer line')).toEqual([]);
    }
  });
});
