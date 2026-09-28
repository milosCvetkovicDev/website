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

// A copy of `PATHNAME` in metadata.ts, which keeps its own private until #59's metadata slice can
// export it: a leading slash, no trailing one (the root aside), no query, no fragment, no origin, no
// dot. A twin exists for exactly the paths a canonical can name; `lib/__tests__/serialise.test.ts`
// compares the two over a list of paths chosen to sit on the pattern's edges.
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
 * The absolute URL of a path on this site. The origin comes from the variable and the fallback
 * `app/sitemap.ts` and `app/robots.ts` read, so a preview build names production like the sitemap
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

/**
 * `NEXT_PUBLIC_SITE_URL`, or production when it is unset or blank, as the bare origin. A trailing
 * slash is dropped, so `https://x.dev/` cannot write `https://x.dev//about`; anything that is not an
 * http(s) origin (no scheme, a path, a query) throws at build time rather than ship broken URLs.
 */
function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://miloscvetkovic.dev';
  let url: URL | undefined;
  try {
    url = new URL(configured);
  } catch {
    url = undefined;
  }
  if (
    !url ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `absoluteUrl: NEXT_PUBLIC_SITE_URL "${configured}" is not an origin such as https://miloscvetkovic.dev`,
    );
  }
  return url.origin;
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

function table(
  title: string,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  if (columns.length === 0) {
    throw new Error(`renderSections: the table under "${title}" has no columns`);
  }
  entries(rows, `the table under "${title}"`);
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
      return [heading(2, content.heading), table(content.heading, content.columns, content.rows)];
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
 * `formatMetric()`, the function the cards use, so the twin cannot render a figure differently.
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
    table(
      CASE_STUDY_HEADINGS.techStack,
      ['Category', 'Items'],
      caseStudy.techStack.map(({ category, items }) => [
        nonEmpty(category.trim(), where('a tech-stack category')),
        commaList(items, where(`the ${category} items`)),
      ]),
    ),
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
