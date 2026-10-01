import {
  caseStudies,
  formatMetric,
  formatMetricScope,
  oneLine,
  type CaseStudy,
  type CaseStudyHighlight,
  type CaseStudyMetric,
  type MetricDefinition,
} from '@/data/case-studies';
import { OWNER_TODO, ownerTodo } from '@/data/owner-todo';
import { pages } from '@/data/pages';
import { homePage } from '@/data/pages/home';
import type { InlineLink, Paragraph, PageRecord, PageSection } from '@/data/pages/types';
import { hasPublishedPosts } from '@/data/posts';
import type { StaticRoute } from '@/data/static-routes';
import { SITE_NAME } from './metadata';
import { assertPathname, markdownTwinPath } from './pathname';

/**
 * The one module that writes Markdown (#59), the case studies as JSON and the site's `/llms.txt`
 * index (#60). Every Markdown twin renders its body here from the content modules, so a twin and
 * its page read one source and no route handler builds Markdown of its own. Every string it is
 * handed is plain text: it escapes whatever Markdown would read as syntax, so the text a reader sees
 * is the text in the module.
 *
 * Each document opens the same way: `# <title>`, the summary paragraph, then `Source:` and the
 * absolute canonical URL of the HTML page it mirrors. A server module like `metadata.ts`.
 */

// RFC 7763 registers text/markdown with a required charset. Written here and nowhere else, so no
// twin can be served as text/plain by a handler that set its own header.
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

// RFC 8259 defines no charset parameter for application/json: JSON on the wire is UTF-8.
const JSON_CONTENT_TYPE = 'application/json';

// llmstxt.org names no media type for `/llms.txt`: it is Markdown served as a plain text file, and
// text/plain defaults to US-ASCII without a charset (RFC 2046), which would garble an em dash.
const LLMS_TXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

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

/** The `/llms.txt` body as a response, with the one content type it is served with (#60). */
export function llmsTxtResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': LLMS_TXT_CONTENT_TYPE } });
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

/** A page record's own title, template or absolute; a record without one fails the prerender. */
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

/**
 * The owner's words in `/llms.txt` (#60): the blockquote, one sentence on who this is and what he
 * is for, and the facts block, the ground truth an engine otherwise guesses. Only the owner writes
 * them. Until then each is an `ownerTodo()` placeholder with a row in `unfilledOwnerFields`
 * (`data/owner-todo.ts`, as `llms-txt#<hint>`), and the served file shows the home page's
 * description in the summary's place and no facts block. Writing one means replacing its
 * placeholder here and deleting its row in the same commit, or the owner-todo gate fails.
 */
export interface LlmsTxtOwnerCopy {
  /** One sentence of plain text. */
  summary: string;
  /** Paragraphs of plain text and links, with no headings; none for no facts block. */
  facts: readonly Paragraph[];
}

export const LLMS_TXT_OWNER_COPY: LlmsTxtOwnerCopy = {
  summary: ownerTodo('the blockquote, one sentence on who Milos is and what he is for'),
  facts: [
    ownerTodo('the facts block, how the current role is phrased and which profile links to list'),
  ],
};

/**
 * The static routes `/llms.txt` leaves out of `## Site pages`. `/blog` is a placeholder with nothing
 * on it until the first post (#61), and an agent that follows a link to an empty page learns the
 * index is unreliable. It returns with that post through `hasPublishedPosts`, the one switch
 * ADR 0028 names for everything that waits for it, so publishing needs no change here.
 */
export const EXCLUDED_FROM_LLMS_TXT: readonly StaticRoute[] = hasPublishedPosts ? [] : ['/blog'];

/**
 * llmstxt.org's advice and #60's bound: the whole index fits any context window. The prerender
 * fails at it, so no path that skips the tests can serve a larger file.
 */
export const LLMS_TXT_MAX_BYTES = 10_240;

/** One `- [name](url): note` line of an llms.txt link list, its URL absolute on this site. */
function llmsTxtLink(name: string, path: string, note: string, what: string): string {
  const label = nonEmpty(text(name).trim(), `siteIndexToLlmsTxt: the link text of ${what}`);
  const said = nonEmpty(inline(note), `siteIndexToLlmsTxt: the note on ${what}`);
  return `- [${label}](${destination(absoluteUrl(path))}): ${said}`;
}

/** A `## ` section whose body is only link lines, as llmstxt.org shapes every section. */
function llmsTxtSection(title: string, links: readonly string[]): string {
  return blocks([heading(2, title), entries(links, `the llms.txt section "${title}"`).join('\n')]);
}

/**
 * The site's index for agents, in llmstxt.org v2's shape (#60): one `# ` H1 with the site's name,
 * one `> ` blockquote, the facts block when there is one, then `## Case studies`,
 * `## Site pages` and `## Machine-readable representations`, each a list of
 * `- [name](url): note` links to the Markdown twins and the JSON. No `## Optional` section: v2
 * dropped its special meaning. Every link and note is read from the modules the pages read.
 *
 * `includeUnfilled` is the draft-complete composition: the owner's placeholders stand in their
 * blocks instead of the fallback and the omission, so the owner-todo gate can find them. It is
 * never served; the served composition fails the prerender rather than carry a marker from any
 * source, or grow to `LLMS_TXT_MAX_BYTES`. Each fact paragraph is shown or left out on its own, so
 * a written one is served while another is still a placeholder. `copy` and `studies` are for tests.
 * `lib/__tests__/llms-txt.test.ts` pins both compositions line by line.
 */
export function siteIndexToLlmsTxt({
  includeUnfilled = false,
  copy = LLMS_TXT_OWNER_COPY,
  studies = caseStudies,
}: {
  includeUnfilled?: boolean;
  copy?: LlmsTxtOwnerCopy;
  studies?: readonly CaseStudy[];
} = {}): string {
  const shown = (value: unknown) => includeUnfilled || !JSON.stringify(value).includes(OWNER_TODO);
  const summary = shown(copy.summary) ? copy.summary : homePage.summary;
  const facts = copy.facts.filter(shown);
  const excluded: readonly string[] = EXCLUDED_FROM_LLMS_TXT;

  const body = document([
    heading(1, SITE_NAME),
    `> ${paragraph(summary, 'siteIndexToLlmsTxt: the summary')}`,
    ...facts.map((value, index) => paragraph(value, `siteIndexToLlmsTxt: fact ${index + 1}`)),
    llmsTxtSection(
      'Case studies',
      studies.map(({ slug, title, description, highlight: { metric } }) => {
        // formatMetric() writes a figure it cannot render as an em dash; a note with no figure in
        // it fails the prerender instead, as the same study's JSON does.
        if (!Number.isFinite(metric.value)) {
          throw new Error(
            `siteIndexToLlmsTxt(${slug}): the metric value ${metric.value} is not finite`,
          );
        }
        return llmsTxtLink(
          title,
          markdownTwinPath(`/work/${slug}`),
          `${formatMetric(metric)} ${metric.label}. ${description}`,
          `the case study ${slug}`,
        );
      }),
    ),
    llmsTxtSection(
      'Site pages',
      Object.values(pages)
        .filter(({ path }) => !excluded.includes(path))
        .map((page) =>
          llmsTxtLink(
            titleOf(page, 'siteIndexToLlmsTxt'),
            markdownTwinPath(page.path),
            page.summary,
            `the page ${page.path}`,
          ),
        ),
    ),
    llmsTxtSection('Machine-readable representations', [
      llmsTxtLink(
        'Case studies as JSON',
        '/case-studies.json',
        'Every case study as one JSON array: the fields its page shows, its metric as the cards render it, and the URLs of its page and its Markdown twin.',
        '/case-studies.json',
      ),
      ...studies.map(({ slug, title }) =>
        llmsTxtLink(
          `${title} as JSON`,
          `/work/${slug}/index.json`,
          'The same entry for one case study, as a document of its own.',
          `the JSON of ${slug}`,
        ),
      ),
    ]),
  ]);

  if (!includeUnfilled && body.includes(OWNER_TODO)) {
    const at = body.indexOf(OWNER_TODO);
    throw new Error(
      `siteIndexToLlmsTxt: the served body still holds ${OWNER_TODO}, never served: ` +
        `"${body.slice(Math.max(0, at - 40), at + 60)}"`,
    );
  }
  const bytes = new TextEncoder().encode(body).length;
  if (bytes >= LLMS_TXT_MAX_BYTES) {
    throw new Error(
      `siteIndexToLlmsTxt: the body is ${bytes} bytes, not under ${LLMS_TXT_MAX_BYTES}: ` +
        'the whole index has to fit a context window',
    );
  }
  return body;
}
