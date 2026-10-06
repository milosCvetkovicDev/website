import {
  caseStudies,
  formatMetric,
  formatMetricScope,
  oneLine,
  techStackTable,
  type CaseStudy,
  type CaseStudyHighlight,
  type CaseStudyMetric,
  type MetricDefinition,
} from '@/data/case-studies';
import { OWNER_TODO } from '@/data/owner-todo';
import { cellText, isWideTable, leadOf } from '@/data/pages/table';
import type {
  InlineLink,
  Paragraph,
  PageRecord,
  PageSection,
  Table,
  TableCell,
  TableRow,
} from '@/data/pages/types';
import { FOOTER_LINES, type Inline, type PostBlock, type PublishedPost } from '@/data/posts';
import { assertPathname, markdownTwinPath } from './pathname';
import { siteOrigin } from './site-origin';

/**
 * The one module that writes Markdown (#59) and the case studies as JSON (#60). Every Markdown twin
 * renders its body here from the content modules, so a twin and its page read one source and no
 * route handler builds Markdown of its own. Every string it is handed is plain text: it escapes
 * whatever Markdown would read as syntax, so the text a reader sees is the text in the module.
 *
 * Each document opens the same way: `# <title>`, the summary paragraph, then `Source:` and the
 * absolute canonical URL of the HTML page it mirrors. A server module like `metadata.ts`.
 */

// RFC 7763 registers text/markdown with a required charset. Written here and nowhere else, so no
// twin can be served as text/plain by a handler that set its own header.
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

// RFC 8259 defines no charset parameter for application/json: JSON on the wire is UTF-8.
const JSON_CONTENT_TYPE = 'application/json';

// Where a twin is served, re-exported as part of this module's interface (#59). It lives in
// `pathname.ts`, which has no imports, so `metadata.ts` and the e2e helpers can read it without
// loading the content modules this one renders.
export { markdownTwinPath };

/** A Markdown body as a response, with the one content type every twin is served with. */
export function markdownResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE } });
}

/**
 * A value as a JSON response, with the one content type every JSON representation is served with.
 * A value JSON cannot write (`undefined`, a function) throws rather than serve an empty body as
 * JSON, and so does a BigInt or a cycle, with `JSON.stringify`'s own error; each fails the prerender.
 */
export function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  if (typeof body !== 'string') {
    throw new Error(
      `jsonResponse: ${typeof value} is not a JSON value, so there is no body to serve`,
    );
  }
  return new Response(body, { headers: { 'Content-Type': JSON_CONTENT_TYPE } });
}

/**
 * The absolute URL of a path on this site. The origin is `siteOrigin()`'s, from the variable and the
 * fallback `app/sitemap.ts` and `app/robots.ts` read, so a preview build names production like the sitemap
 * does, and the root is the bare origin, as its served canonical is. `metadataBase` cannot help
 * here: it resolves URLs in the head, and a Markdown body is plain text.
 */
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`absoluteUrl: "${path}" is not a path on this site`);
  }
  const origin = siteOrigin();
  return path === '/' ? origin : `${origin}${path}`;
}

// Inline syntax anywhere in a line: code spans, emphasis, links, autolinks and raw HTML, GFM's table
// cell separator and strikethrough, and the backslash itself. An `&` is syntax only when it opens an
// entity such as `&copy;`.
const INLINE_SYNTAX = /[\\`*_[\]<>|~]|&(?=#?\w+;)/g;

/** Plain text as Markdown that displays as written, on one line so it cannot open a block. */
function text(value: string): string {
  return value.replace(/[ \t\r\n]+/g, ' ').replace(INLINE_SYNTAX, '\\$&');
}

/**
 * A line that starts with `#`, `-`, `+` or a number and `.` or `)` opens a heading, a list or a
 * thematic break; escaping its first mark leaves it a paragraph. (`*` and `>` are escaped anywhere.)
 */
function block(line: string): string {
  return line.replace(/^[#+-]/, '\\$&').replace(/^(\d+)([.)])/, '$1\\$2');
}

// An absolute URL a twin may link to: a web page or a mail address. A relative path or a fragment
// would resolve against the twin's own URL, and any other scheme has no business in a document.
const EXTERNAL_URL = /^(?:https?:\/\/[^\s/?#]|mailto:\S)/i;

/**
 * A link destination as written. A backslash escapes `(`, `)` and `\` without changing the URL, and
 * whitespace, `<` and `>`, which cannot stand in one, are percent-encoded as a browser would.
 */
function destination(url: string): string {
  return url.replace(/[\\()]/g, '\\$&').replace(/[\s<>]/g, (mark) => encodeURIComponent(mark));
}

/** A link; `where`, when given, names the block it stands in, as a post's errors do. */
function link({ text: label, href }: InlineLink, where?: string): string {
  const at = where ? ` in ${where}` : '';
  // A twin is read away from the site, so an on-site path becomes an absolute URL.
  let url: string;
  if (href.startsWith('/') && !href.startsWith('//')) {
    url = absoluteUrl(href);
  } else if (EXTERNAL_URL.test(href)) {
    url = href;
  } else {
    throw new Error(
      `serialise: the link "${href}"${at} is neither a path on this site nor an http(s) or mailto URL`,
    );
  }
  const visibleLabel = text(label).trim();
  if (!visibleLabel) throw new Error(`serialise: the link to "${href}"${at} has no text`);
  return `[${visibleLabel}](${destination(url)})`;
}

/** A paragraph's pieces joined as written, each piece carrying its own spaces. */
function inline(paragraph: Paragraph): string {
  const pieces = (typeof paragraph === 'string' ? [paragraph] : paragraph).filter(
    (piece) => piece !== '',
  );
  return pieces
    .map((piece, index) => {
      if (typeof piece !== 'string') return link(piece);
      // `!` right before a link's `[` would make the link an image.
      return typeof pieces[index + 1] === 'object' ? text(piece).replace(/!$/, '\\!') : text(piece);
    })
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Text that must not render empty: an empty heading, term or paragraph is a gap in the twin. */
function nonEmpty(markdown: string, what: string): string {
  if (!markdown) throw new Error(`serialise: ${what} is empty`);
  return markdown;
}

/** A list that must not render empty: a heading with nothing under it is a gap in the twin. */
function entries<T>(list: readonly T[], what: string): readonly T[] {
  if (list.length === 0) throw new Error(`serialise: ${what} is empty`);
  return list;
}

function paragraph(value: Paragraph, what: string): string {
  return block(nonEmpty(inline(value), what));
}

/** A heading; `what` names it in an error, as in `postToMarkdown: the title of /blog/<slug>`. */
function heading(level: 1 | 2 | 3, value: string, what = `a level-${level} heading`): string {
  const title = nonEmpty(inline(value), what);
  // A run of `#` after a space ends an ATX heading's text and is dropped as its closing sequence.
  return `${'#'.repeat(level)} ${title.replace(/(^| )(#+)$/, '$1\\$2')}`;
}

/** A bulleted list; `what` names it in an error, as in `Impact of nx-remote-cache`. */
function bullets(items: readonly string[], what: string): string {
  return entries(items, what)
    .map((item, index) => `- ${paragraph(item, `item ${index + 1} of ${what}`)}`)
    .join('\n');
}

function numbered(items: readonly string[], what: string): string {
  return entries(items, what)
    .map((item, index) => `${index + 1}. ${paragraph(item, `step ${index + 1} of ${what}`)}`)
    .join('\n');
}

/**
 * A cell as the page reads it (`cellText()`), so the twin and `components/data-table.tsx` word it
 * alike: a list as its entries joined with `, `, which no entry may hold, a lead as a sentence
 * before the text, an icon left out. A plain cell may be blank, as a table's can; a decorated one
 * must have text, or its icon or lead would stand for a value the twin cannot write.
 */
function cell(value: TableCell, what: string): string {
  if (typeof value === 'string') return value;
  if ('text' in value) {
    nonEmpty(inline(value.text), what);
    return cellText(value);
  }
  return commaList(value, what);
}

/**
 * A table as its caption, `name`, and its columns and rows, `markdown`; the caller decides whether
 * a `Table:` caption line (Pandoc's) goes above them, as `table()` and a post's table do. `where`
 * names the table in an error. The caption, every column and every row header must have text: the
 * page renders each as a name, a `<caption>` or a `<th>`, and an empty one is an unnamed header to
 * a screen reader and a gap in the twin. A table needs a data column as well as its header column,
 * or its column header would head no cell.
 *
 * A wide table (`isWideTable()`) also has to fit the layout `components/data-table.tsx` stacks it
 * into on a phone, where its row header and first cell run on as one line after a drawn " · ": that
 * first cell must be text, not a list (drawn as a block of chips) nor a cell with a lead (set on a
 * line of its own), either of which would break the line after the dot; and no cell may be blank,
 * which would leave the dot pointing at nothing or an empty line in the row. Every table the site
 * renders comes through here when its twin is written, a page's or a case study's through
 * `table()` and a post's through `postBlock()`, so writing the twin refuses such a row.
 */
function captionedTable(
  { caption, columns, rows }: Table,
  where: string,
): { name: string; markdown: string } {
  if (columns.length === 0) {
    throw new Error(`serialise: ${where} has no columns`);
  }
  if (columns.length === 1) {
    throw new Error(`serialise: ${where} has one column, row headers with no cell to head`);
  }
  const name = nonEmpty(inline(caption), `the caption of ${where}`);
  columns.forEach((column, index) => nonEmpty(inline(column), `column ${index + 1} of ${where}`));
  entries(rows, where);
  rows.forEach((row, index) => {
    if (row.length !== columns.length) {
      throw new Error(
        `serialise: row ${index + 1} of ${where} has ${row.length} cells for ${columns.length} columns`,
      );
    }
    nonEmpty(inline(row[0]), `the header of row ${index + 1} of ${where}`);
    if (isWideTable({ columns })) stackable(row, columns, `row ${index + 1} of ${where}`);
  });
  const line = (cells: readonly string[]) => `| ${cells.map(inline).join(' | ')} |`;
  const markdown = [
    line(columns),
    line(columns.map(() => '---')),
    ...rows.map((row, index) =>
      line(
        row.map((value, column) =>
          cell(value, `the ${columns[column]} of row ${index + 1} of ${where}`),
        ),
      ),
    ),
  ].join('\n');
  return { name, markdown };
}

/** A page table: its caption line is left out when the section's heading already names it (#58). */
function table(heading: string, content: Table, where = `the table under "${heading}"`): string {
  const { name, markdown } = captionedTable(content, where);
  return name === inline(heading) ? markdown : `Table: ${name}\n\n${markdown}`;
}

function section(content: PageSection): string[] {
  switch (content.kind) {
    case 'prose':
      return [
        heading(2, content.heading),
        ...entries(content.paragraphs, `the section "${content.heading}"`).map((value) =>
          paragraph(value, `a paragraph under "${content.heading}"`),
        ),
      ];
    case 'list':
      return [
        heading(2, content.heading),
        entries(content.items, `the list under "${content.heading}"`)
          .map(({ term, description }) => {
            const item = `- **${nonEmpty(inline(term), `a term under "${content.heading}"`)}**`;
            const said = inline(description);
            return said ? `${item}: ${said}` : item;
          })
          .join('\n'),
      ];
    case 'table':
      return [heading(2, content.heading), table(content.heading, content)];
    default: {
      // The types rule this out; a record cast from elsewhere must not lose a section silently.
      const unknown: never = content;
      throw new Error(
        `renderSections: no renderer for the section kind "${(unknown as { kind: string }).kind}"`,
      );
    }
  }
}

/** Blocks separated by one blank line, with the empty ones left out. */
function blocks(parts: readonly string[]): string {
  return parts.filter(Boolean).join('\n\n');
}

/** A whole document, ending in one newline. */
function document(parts: readonly string[]): string {
  return `${blocks(parts)}\n`;
}

/** The opening every twin shares: its title, its summary and the page it mirrors. */
function opening(title: string, summary: string, path: string, caller: string): string {
  assertPathname(path, caller);
  return blocks([
    heading(1, title, `${caller}: the title of ${path}`),
    paragraph(summary, `${caller}: the summary of ${path}`),
    `Source: ${absoluteUrl(path)}`,
  ]);
}

/** A page's sections, each under a `##` heading. Empty for none. */
export function renderSections(sections: readonly PageSection[]): string {
  return blocks(sections.flatMap(section));
}

/**
 * A record's own title: the string, or the `absolute` one a record sets to skip the template.
 * `caller` names the twin's writer in an error.
 */
function titleOf(page: PageRecord, caller: string): string {
  const title = typeof page.title === 'string' ? page.title : page.title?.absolute;
  if (typeof title !== 'string') {
    throw new Error(`${caller}: the record for ${page.path} has no title`);
  }
  return title;
}

/**
 * A static route's twin, from its page record. The H1 is the route's own title, without the
 * layout's `%s | Milos Cvetkovic` template: that suffix names the site in a browser tab, and the
 * twin names the site on its Source line instead.
 */
export function pageToMarkdown(page: PageRecord): string {
  return document([
    opening(titleOf(page, 'pageToMarkdown'), page.summary, page.path, 'pageToMarkdown'),
    renderSections(page.sections),
  ]);
}

// The section headings `app/work/[slug]/page.tsx` renders, so the twin reads like the page.
const CASE_STUDY_HEADINGS = {
  challenge: 'The Challenge',
  approach: 'My Approach',
  howItWorks: 'How It Works',
  contributions: 'Key Contributions',
  impact: 'Impact',
  lessons: 'Lessons',
  techStack: 'Tech Stack',
} as const;

/**
 * A case study's twin: every field of the study, including those the page shows only in its
 * metadata and JSON-LD (the tagline, the highlight, the dates). The metric goes through
 * `formatMetric()`, the function the cards use, so the twin cannot render a figure differently, and
 * its basis follows on a line of its own, as the page's metric panel prints it under the figure.
 * `lib/__tests__/serialise.test.ts` fails when a study holds a value the twin does not show.
 */
export function caseStudyToMarkdown(caseStudy: CaseStudy): string {
  const { highlight, howItWorks, lessons, slug } = caseStudy;
  const where = (what: string) => `${what} of ${slug}`;
  const facts: [label: string, value: string][] = [
    ['Tagline', caseStudy.tagline],
    ['Category', highlight.category],
    ['Status', highlight.status],
    ['Metric', `${formatMetric(highlight.metric)} ${highlight.metric.label}`],
    ['Basis', highlight.metric.basis],
    ['Tags', commaList(caseStudy.tags, where('the tags'))],
    ['Published', caseStudy.publishedAt],
    ['Updated', caseStudy.updatedAt],
  ];

  return document([
    opening(
      caseStudy.title,
      caseStudy.description,
      `/work/${caseStudy.slug}`,
      'caseStudyToMarkdown',
    ),
    facts
      .map(([label, value]) => `- ${label}: ${nonEmpty(inline(value), where(`the ${label}`))}`)
      .join('\n'),
    heading(2, CASE_STUDY_HEADINGS.challenge),
    paragraph(caseStudy.challenge, where('the challenge')),
    heading(2, CASE_STUDY_HEADINGS.approach),
    paragraph(caseStudy.approach, where('the approach')),
    ...(howItWorks?.length
      ? [heading(2, CASE_STUDY_HEADINGS.howItWorks), numbered(howItWorks, where('How It Works'))]
      : []),
    heading(2, CASE_STUDY_HEADINGS.contributions),
    bullets(caseStudy.contributions, where('Key Contributions')),
    heading(2, CASE_STUDY_HEADINGS.impact),
    bullets(caseStudy.impact, where('Impact')),
    ...(lessons?.length
      ? [heading(2, CASE_STUDY_HEADINGS.lessons), bullets(lessons, where('Lessons'))]
      : []),
    heading(2, CASE_STUDY_HEADINGS.techStack),
    // The page's table whole (#58): its caption, columns and rows, checked here so an error names
    // the study, and so the page and the twin read one array.
    table(CASE_STUDY_HEADINGS.techStack, techStackTable(caseStudy), where('the tech stack')),
  ]);
}

/** The longest run of backticks in `code`, so that a fence or a code span can be one longer. */
const longestBacktickRun = (code: string) =>
  Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));

/**
 * Inline code as a code span: one backtick more than its longest run, and a space inside each end
 * when the code starts or ends with a backtick or a space, which CommonMark strips again.
 */
function codeSpan(code: string): string {
  const ticks = '`'.repeat(longestBacktickRun(code) + 1);
  const pad = /^[ `]|[ `]$/.test(code) ? ' ' : '';
  return `${ticks}${pad}${code}${pad}${ticks}`;
}

/**
 * A fenced code block, whose fence is one backtick longer than the code's longest run, three at
 * least.
 */
function codeBlock(code: string, language = ''): string {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(code) + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

/**
 * A run of a post's inline pieces: text as `text()` writes it, code spans, and links; `where` names
 * the block in a link's error. It cannot reuse `inline()`, which has no code piece and collapses
 * every run of spaces in the joined line: a code span's spaces are code, and must stay as written.
 */
function postInline(content: readonly Inline[], where: string): string {
  const pieces = content.filter((piece) => piece !== '');
  return pieces
    .map((piece, index) => {
      if (typeof piece !== 'string') {
        return piece.code !== undefined ? codeSpan(piece.code) : link(piece, where);
      }
      const next = pieces[index + 1];
      // `!` right before a link's `[` would make the link an image.
      return typeof next === 'object' && next.code === undefined
        ? text(piece).replace(/!$/, '\\!')
        : text(piece);
    })
    .join('')
    .trim();
}

/** One block of a post; `where` is its place, as in `block 3 of <slug>`, for an error. */
function postBlock(content: PostBlock, where: string): string {
  switch (content.kind) {
    case 'heading':
      return heading(content.level, content.text, `the level-${content.level} heading at ${where}`);
    case 'paragraph':
      return block(nonEmpty(postInline(content.content, where), where));
    case 'list':
      return entries(content.items, where)
        .map((item, index) => {
          const marker = content.ordered ? `${index + 1}.` : '-';
          const at = `item ${index + 1} of ${where}`;
          return `${marker} ${block(nonEmpty(postInline(item, at), at))}`;
        })
        .join('\n');
    case 'code':
      return codeBlock(nonEmpty(content.code, where), content.language);
    case 'quote':
      return `> ${block(nonEmpty(postInline(content.content, where), where))}`;
    case 'table': {
      // Always captioned, even under a heading of the same words, so a draft's `Table:` line and
      // the twin's compare line for line (D6 of the publishing design).
      const { name, markdown } = captionedTable(content, `the table at ${where}`);
      return `Table: ${name}\n\n${markdown}`;
    }
    default: {
      // The types rule this out; a post cast from elsewhere must not lose a block silently.
      const unknown: never = content;
      throw new Error(
        `postToMarkdown: no writer for the block kind "${(unknown as { kind: string }).kind}" at ${where}`,
      );
    }
  }
}

/** A post's body as Markdown, block after block; `slug` names the post in an error. */
export function postBodyToMarkdown(body: readonly PostBlock[], slug: string): string {
  return blocks(
    entries(body, `the body of ${slug}`).map((content, index) =>
      postBlock(content, `block ${index + 1} of ${slug}`),
    ),
  );
}

/**
 * A post's twin (61e, ADR 0034): the opening every twin shares, the post's dates, its body, and,
 * for a kind with footer lines, a `---` rule and each line, as the page ends its article.
 * `scripts/post-draft-check.mjs` compares an approved draft with this output, and
 * `src/lib/__tests__/post-draft.test.ts` keeps the two in step.
 */
export function postToMarkdown(post: PublishedPost): string {
  const footer = FOOTER_LINES[post.kind];
  return document([
    opening(post.title, post.summary, `/blog/${post.slug}`, 'postToMarkdown'),
    `- Published: ${post.publishedAt}\n- Updated: ${post.updatedAt}`,
    postBodyToMarkdown(post.body, post.slug),
    ...(footer.length > 0
      ? ['---', ...footer.map((line) => paragraph(line, `a footer line of ${post.slug}`))]
      : []),
  ]);
}

/**
 * `/blog`'s twin. While no post is published it is the record, Coming Soon card included, as the
 * page shows. After that it lists the posts in the order given, which `publishedPosts` keeps
 * newest first, as the page does: the title as a heading, the day it was published and its URL,
 * then its summary.
 */
export function blogToMarkdown(page: PageRecord, list: readonly PublishedPost[]): string {
  if (list.length === 0) return pageToMarkdown(page);
  return document([
    opening(titleOf(page, 'blogToMarkdown'), page.summary, page.path, 'blogToMarkdown'),
    ...list.flatMap((post) => [
      heading(2, post.title, `blogToMarkdown: the title of ${post.slug}`),
      `- Published: ${post.publishedAt}\n- URL: ${absoluteUrl(`/blog/${post.slug}`)}`,
      paragraph(post.summary, `blogToMarkdown: the summary of ${post.slug}`),
    ]),
  ]);
}

/**
 * Refuses a wide table's row that its stacked layout on a phone could not draw (see
 * `captionedTable()`).
 */
function stackable([, first, ...rest]: TableRow, columns: readonly string[], where: string): void {
  const what = (column: number) => `serialise: the ${columns[column]} of ${where}`;
  if (Array.isArray(first)) {
    throw new Error(`${what(1)} is a list, which cannot run on after the row header on a phone`);
  }
  if (typeof first === 'object' && 'text' in first && leadOf(first)) {
    throw new Error(`${what(1)} has a lead, which cannot run on after the row header on a phone`);
  }
  [first, ...rest].forEach((value, index) => {
    if (typeof value === 'string' && !value.trim()) {
      throw new Error(`${what(index + 1)} is blank, which a stacked row on a phone cannot draw`);
    }
  });
}

/**
 * Entries joined with `, `, as the page's chips would read aloud. An entry holding a comma would
 * read as two, and a blank entry or no entries at all as a gap, so each throws.
 */
function commaList(list: readonly string[], what: string): string {
  entries(list, what).forEach((entry) => {
    // A blank entry would be an empty chip on the page and a gap between two commas in the twin.
    if (!entry.trim()) throw new Error(`serialise: an entry in ${what} is empty`);
    if (entry.includes(',')) {
      throw new Error(`serialise: "${entry}" in ${what} holds a comma and would read as two`);
    }
  });
  return list.join(', ');
}

/** A case study's metric with the text `formatMetric()` renders for it, as the cards show it. */
export type CaseStudyMetricJson = CaseStudyMetric & { formatted: string };

/** A metric definition that can be stated: the owner's window and method. */
export type StatedMetricDefinition = Extract<MetricDefinition, { state: 'defined' }>;

/**
 * One case study as JSON (#60): every field of `CaseStudy` as the data module holds it, except that
 * the metric also carries its rendering and a metric definition that cannot be stated is `null`,
 * plus the absolute URLs of the study's page (`url`) and of its Markdown twin (`markdown`).
 */
export type CaseStudyJson = Omit<CaseStudy, 'highlight' | 'metricDefinition'> & {
  highlight: Omit<CaseStudyHighlight, 'metric'> & { metric: CaseStudyMetricJson };
  metricDefinition: StatedMetricDefinition | null;
  url: string;
  markdown: string;
};

/**
 * A metric definition as it may be served: its window, and its method on one line as the page's
 * sentence states it, once `formatMetricScope()`, the one producer of that sentence, could state
 * it. Called with no basis, it returns `null` exactly when the definition cannot be stated. It is
 * `null` while the definition is the owner's placeholder, has a window that is not two days in
 * order, or has a method with nothing statable in it, because a placeholder marker never reaches
 * served output (`data/owner-todo.ts`) and the JSON states nothing the page would not.
 */
function statedDefinition(definition: MetricDefinition): StatedMetricDefinition | null {
  return definition.state === 'defined' && formatMetricScope(null, definition) !== null
    ? { ...definition, method: oneLine(definition.method) }
    : null;
}

/**
 * A case study as JSON, for `/work/<slug>/index.json` and as one entry of `/case-studies.json`. The
 * fields are the data module's own, so a program reads the same facts the page shows without an
 * HTML parser, and the metric goes through `formatMetric()`, the function the cards and the twin
 * use, so no reader renders a figure differently. The URLs are absolute from the origin
 * `metadataBase` resolves (`absoluteUrl()`), because the JSON is read away from the site.
 * `lib/__tests__/case-studies-json.test.ts` fails when a study holds a key the JSON does not carry.
 */
export function caseStudyToJson(caseStudy: CaseStudy): CaseStudyJson {
  const { highlight, metricDefinition, slug } = caseStudy;
  // JSON writes NaN and Infinity as `null`, which `CaseStudyMetricJson` says a value never is, so
  // the prerender fails instead; `data/__tests__/case-studies.test.ts` fails such a data edit first.
  if (!Number.isFinite(highlight.metric.value)) {
    throw new Error(
      `caseStudyToJson(${slug}): the metric value ${highlight.metric.value} is not finite`,
    );
  }
  const page = `/work/${slug}`;
  const entry: CaseStudyJson = {
    ...caseStudy,
    highlight: {
      ...highlight,
      metric: { ...highlight.metric, formatted: formatMetric(highlight.metric) },
    },
    metricDefinition: statedDefinition(metricDefinition),
    url: absoluteUrl(page),
    markdown: absoluteUrl(markdownTwinPath(page)),
  };
  // Every other field is served as the data holds it, so a registered `ownerTodo()` in its prose
  // would reach the JSON: the prerender fails rather than publish it (`data/owner-todo.ts`).
  if (JSON.stringify(entry).includes(OWNER_TODO)) {
    throw new Error(`caseStudyToJson(${slug}): a field still holds ${OWNER_TODO}, never served`);
  }
  return entry;
}

/** Every case study as JSON, in the data module's order: the body of `/case-studies.json`. */
export function caseStudiesToJson(): CaseStudyJson[] {
  return caseStudies.map((caseStudy) => caseStudyToJson(caseStudy));
}
