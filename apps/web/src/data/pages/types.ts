/**
 * The shape of a page record: the copy a static route renders, held as data so the page and its
 * Markdown twin (`src/lib/serialise.ts`) read one source. Each route's record lives in its own
 * module beside this one. Types only, so a client component can import a record without pulling
 * anything else into its chunk.
 */

/** A link inside a sentence, such as the contact page named in the middle of a paragraph. */
export interface InlineLink {
  text: string;
  /** A pathname on this site (`/contact`) or an absolute URL. */
  href: string;
}

/**
 * A paragraph: plain text, or the pieces of a sentence that carries links, in reading order. The
 * pieces are joined as they are, so a piece carries its own spaces, as the text around a JSX link
 * does.
 */
export type Paragraph = string | readonly (string | InlineLink)[];

/** A heading with one or more paragraphs under it. */
export interface ProseSection {
  kind: 'prose';
  heading: string;
  paragraphs: readonly Paragraph[];
}

/** A heading with a list of named entries: a belief and what it means, a fact and its value. */
export interface ListSection {
  kind: 'list';
  heading: string;
  items: readonly { term: string; description: string }[];
}

/**
 * A cell that carries more than its text. `lead` is a line set apart above the text, and both
 * the page and the twin end it as a sentence (`cellText()` in `table.ts`). `icon` is an emoji drawn
 * before the text as decoration: the page hides it from screen readers and the twin leaves it out.
 */
export interface DecoratedCell {
  text: string;
  lead?: string;
  icon?: string;
}

/**
 * A data cell: text, a list of short entries (drawn as chips, read as one comma-separated list,
 * so no entry may hold a comma), or text with a lead or an icon.
 */
export type TableCell = string | readonly string[] | DecoratedCell;

/** A row: its header, the first column's text, then one cell for each column after it. */
export type TableRow = readonly [header: string, ...cells: TableCell[]];

/**
 * A data table (#58): the page renders it through `components/scroll-table.tsx`, with its caption,
 * a header cell for every column and one for every row, and the twin writes the columns and rows
 * as a Markdown table.
 */
export interface Table {
  /** The table's name: the page's `<caption>`, and the label of the region it scrolls in. */
  caption: string;
  columns: readonly string[];
  rows: readonly TableRow[];
}

/** A heading with a table: one cell per column in every row. */
export interface TableSection extends Table {
  kind: 'table';
  heading: string;
}

/** Every page's content fits these three shapes; a fourth needs a renderer in `serialise.ts`. */
export type PageSection = ProseSection | ListSection | TableSection;

export interface PageRecord {
  /** The route's pathname, `/` for home: the canonical the page's `buildMetadata()` call sets. */
  path: string;
  /** The title the route passes to `buildMetadata()`, template or absolute. */
  title: string | { absolute: string };
  /** The route's meta description, and the paragraph that opens its twin. */
  summary: string;
  sections: readonly PageSection[];
}
