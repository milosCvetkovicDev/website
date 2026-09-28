import { formatMetric, type CaseStudy } from '@/data/case-studies';
import type { InlineLink, Paragraph, PageRecord, PageSection } from '@/data/pages/types';

/**
 * The one module that writes Markdown (#59). Every Markdown twin renders its body here from the
 * content modules, so a twin and its page read one source and no route handler builds Markdown of
 * its own. Every string it is handed is plain text: it escapes whatever Markdown would read as
 * syntax, so the text a reader sees is the text in the module.
 *
 * Each document opens the same way: `# <title>`, the summary paragraph, then `Source:` and the
 * absolute canonical URL of the HTML page it mirrors. A server module like `metadata.ts`.
 */

// RFC 7763 registers text/markdown with a required charset. Written here and nowhere else, so no
// twin can be served as text/plain by a handler that set its own header.
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

// The shape of `PATHNAME` in metadata.ts, which keeps its own private: a leading slash, no trailing
// one (the root aside), no query, no fragment, no origin, no dot. A twin exists for exactly the
// paths a canonical can name; `lib/__tests__/serialise.test.ts` holds the two to the same answers.
const PATHNAME = /^\/(?:[\w-]+(?:\/[\w-]+)*)?$/;

function assertPathname(path: string, caller: string): void {
  if (!PATHNAME.test(path)) {
    throw new Error(`${caller}: "${path}" is not a clean pathname such as /work or /`);
  }
}

/** Where a route's twin is served: `/` → `/index.md`, `/about` → `/about/index.md`. */
export function markdownTwinPath(routePath: string): string {
  assertPathname(routePath, 'markdownTwinPath');
  return routePath === '/' ? '/index.md' : `${routePath}/index.md`;
}

/** A Markdown body as a response, with the one content type every twin is served with. */
export function markdownResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE } });
}

/**
 * The absolute URL of a path on this site. The origin resolves exactly as `app/sitemap.ts` and
 * `app/robots.ts` resolve theirs, so a preview build names production like the sitemap does, and
 * the root is the bare origin, as its served canonical is. `metadataBase` cannot help here: it
 * resolves URLs in the head, and a Markdown body is plain text.
 */
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`absoluteUrl: "${path}" is not a path on this site`);
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';
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

// Spaces and parentheses end a link destination, and `<`, `>` and `\` change how it is read.
const URL_SYNTAX = /[ \t\r\n()<>\\]/g;

function link({ text: label, href }: InlineLink): string {
  // A twin is read away from the site, so an on-site path becomes an absolute URL.
  const url = href.startsWith('/') && !href.startsWith('//') ? absoluteUrl(href) : href;
  const destination = url.replace(
    URL_SYNTAX,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
  return `[${text(label).trim()}](${destination})`;
}

/** A paragraph's pieces joined as written, each piece carrying its own spaces. */
function inline(paragraph: Paragraph): string {
  const pieces = typeof paragraph === 'string' ? [paragraph] : paragraph;
  return pieces
    .map((piece) => (typeof piece === 'string' ? text(piece) : link(piece)))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function paragraph(value: Paragraph): string {
  return block(inline(value));
}

function heading(level: 1 | 2, value: string): string {
  // A run of `#` after a space ends an ATX heading's text and is dropped as its closing sequence.
  return `${'#'.repeat(level)} ${inline(value).replace(/(^| )(#+)$/, '$1\\$2')}`;
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${paragraph(item)}`).join('\n');
}

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${paragraph(item)}`).join('\n');
}

function table(
  title: string,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  if (columns.length === 0) {
    throw new Error(`renderSections: the table under "${title}" has no columns`);
  }
  rows.forEach((row, index) => {
    if (row.length !== columns.length) {
      throw new Error(
        `renderSections: row ${index + 1} of the table under "${title}" has ${row.length} cells for ${columns.length} columns`,
      );
    }
  });
  const line = (cells: readonly string[]) => `| ${cells.map(inline).join(' | ')} |`;
  return [line(columns), line(columns.map(() => '---')), ...rows.map(line)].join('\n');
}

function section(content: PageSection): string[] {
  switch (content.kind) {
    case 'prose':
      return [heading(2, content.heading), ...content.paragraphs.map(paragraph)];
    case 'list':
      return [
        heading(2, content.heading),
        content.items
          .map(({ term, description }) => {
            const item = `- **${inline(term)}**`;
            return description ? `${item}: ${inline(description)}` : item;
          })
          .join('\n'),
      ];
    case 'table':
      return [heading(2, content.heading), table(content.heading, content.columns, content.rows)];
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
  return blocks([heading(1, title), paragraph(summary), `Source: ${absoluteUrl(path)}`]);
}

/** A page's sections, each under a `##` heading. Empty for none. */
export function renderSections(sections: readonly PageSection[]): string {
  return blocks(sections.flatMap(section));
}

/** A static route's twin, from its page record. */
export function pageToMarkdown(page: PageRecord): string {
  const title = typeof page.title === 'string' ? page.title : page.title.absolute;
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
 * `formatMetric()`, the function the cards use, so the twin cannot render a figure differently.
 * `lib/__tests__/serialise.test.ts` fails when a study holds a value the twin does not show.
 */
export function caseStudyToMarkdown(caseStudy: CaseStudy): string {
  const { highlight, howItWorks, lessons } = caseStudy;
  const facts: [label: string, value: string][] = [
    ['Tagline', caseStudy.tagline],
    ['Category', highlight.category],
    ['Status', highlight.status],
    ['Metric', `${formatMetric(highlight.metric)} ${highlight.metric.label}`],
    ['Tags', caseStudy.tags.join(', ')],
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
    facts.map(([label, value]) => `- ${label}: ${inline(value)}`).join('\n'),
    heading(2, CASE_STUDY_HEADINGS.challenge),
    paragraph(caseStudy.challenge),
    heading(2, CASE_STUDY_HEADINGS.approach),
    paragraph(caseStudy.approach),
    ...(howItWorks?.length
      ? [heading(2, CASE_STUDY_HEADINGS.howItWorks), numbered(howItWorks)]
      : []),
    heading(2, CASE_STUDY_HEADINGS.contributions),
    bullets(caseStudy.contributions),
    heading(2, CASE_STUDY_HEADINGS.impact),
    bullets(caseStudy.impact),
    ...(lessons?.length ? [heading(2, CASE_STUDY_HEADINGS.lessons), bullets(lessons)] : []),
    heading(2, CASE_STUDY_HEADINGS.techStack),
    table(
      CASE_STUDY_HEADINGS.techStack,
      ['Category', 'Items'],
      caseStudy.techStack.map(({ category, items }) => [category, items.join(', ')]),
    ),
  ]);
}
