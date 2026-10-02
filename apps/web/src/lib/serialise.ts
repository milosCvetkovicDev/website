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
import { cellText } from '@/data/pages/table';
import type {
  InlineLink,
  Paragraph,
  PageRecord,
  PageSection,
  Table,
  TableCell,
} from '@/data/pages/types';
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

function link({ text: label, href }: InlineLink): string {
  // A twin is read away from the site, so an on-site path becomes an absolute URL.
  let url: string;
  if (href.startsWith('/') && !href.startsWith('//')) {
    url = absoluteUrl(href);
  } else if (EXTERNAL_URL.test(href)) {
    url = href;
  } else {
    throw new Error(
      `serialise: the link "${href}" is neither a path on this site nor an http(s) or mailto URL`,
    );
  }
  const visibleLabel = text(label).trim();
  if (!visibleLabel) throw new Error(`serialise: the link to "${href}" has no text`);
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

function heading(level: 1 | 2, value: string): string {
  const title = nonEmpty(inline(value), `a level-${level} heading`);
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
 * A cell as the page reads it (`cellText()`), so the twin and `components/scroll-table.tsx` word it
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
 * A table: a `Table:` caption line (Pandoc's), unless the caption only repeats the heading above
 * it, then the columns and rows. `where` names the table in an error. The caption, every column and
 * every row header must have text: the page renders each as a name, a `<caption>` or a `<th>`, and
 * an empty one is an unnamed header to a screen reader and a gap in the twin.
 */
function table(
  heading: string,
  { caption, columns, rows }: Table,
  where = `the table under "${heading}"`,
): string {
  if (columns.length === 0) {
    throw new Error(`renderSections: ${where} has no columns`);
  }
  const name = nonEmpty(inline(caption), `the caption of ${where}`);
  columns.forEach((column, index) => nonEmpty(inline(column), `column ${index + 1} of ${where}`));
  entries(rows, where);
  rows.forEach((row, index) => {
    if (row.length !== columns.length) {
      throw new Error(
        `renderSections: row ${index + 1} of ${where} has ${row.length} cells for ${columns.length} columns`,
      );
    }
    nonEmpty(inline(row[0]), `the header of row ${index + 1} of ${where}`);
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
    heading(1, title),
    paragraph(summary, `${caller}: the summary of ${path}`),
    `Source: ${absoluteUrl(path)}`,
  ]);
}

/** A page's sections, each under a `##` heading. Empty for none. */
export function renderSections(sections: readonly PageSection[]): string {
  return blocks(sections.flatMap(section));
}

/**
 * A static route's twin, from its page record. The H1 is the route's own title, without the
 * layout's `%s | Milos Cvetkovic` template: that suffix names the site in a browser tab, and the
 * twin names the site on its Source line instead.
 */
export function pageToMarkdown(page: PageRecord): string {
  const title = typeof page.title === 'string' ? page.title : page.title?.absolute;
  if (typeof title !== 'string') {
    throw new Error(`pageToMarkdown: the record for ${page.path} has no title`);
  }
  return document([
    opening(title, page.summary, page.path, 'pageToMarkdown'),
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

/**
 * Entries joined with `, `, as the page's chips would read aloud. An entry holding a comma would
 * read as two, and no entries at all as a blank, so both throw.
 */
function commaList(list: readonly string[], what: string): string {
  entries(list, what).forEach((entry) => {
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
