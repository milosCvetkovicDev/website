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

/** A heading with a table: one cell per column in every row. */
export interface TableSection {
  kind: 'table';
  heading: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
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
