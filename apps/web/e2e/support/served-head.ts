import type { APIRequestContext } from '@playwright/test';

/**
 * The served `<head>`, as a crawler or a link-preview bot reads it: `request.get(path)` and patterns
 * over the markup, never the hydrated DOM. Moved here from `seo-surface.spec.ts` so the specs that
 * read the head (`seo-surface.spec.ts`, `markdown-twins.spec.ts`) share one parser.
 *
 * The parsing is deliberately blunt, because that is closer to what a bot does than a DOM would be,
 * and it reads only inside `<head>`: Next also embeds a JSON-escaped copy of the head in the RSC
 * flight payload further down the document, and that copy must not answer for a tag that never
 * reached the markup (the same trap `not-found-shell.spec.ts` documents).
 */

export interface Head {
  raw: string;
  status: number;
  /** `<meta name|property="…" content="…">` collected as name -> every content value seen. */
  meta: Map<string, string[]>;
  /** `<link rel="…" href="…">` the same way. */
  link: Map<string, string[]>;
}

/** The markup inside a document's `<head>` (never a `<header>`), or nothing when it has none. */
export function headOf(html: string): string {
  return html.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i)?.[1] ?? '';
}

export async function fetchHead(request: APIRequestContext, path: string): Promise<Head> {
  const response = await request.get(path);
  const raw = headOf(await response.text());
  const meta = new Map<string, string[]>();
  const link = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const lower = key.toLowerCase();
    map.set(lower, [...(map.get(lower) ?? []), value]);
  };

  for (const tag of raw.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:name|property)=["']([^"']+)["']/i)?.[1];
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (key !== undefined && content !== undefined) add(meta, key, content);
  }
  for (const tag of raw.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']*)["']/i)?.[1];
    if (rel !== undefined && href !== undefined) add(link, rel, href);
  }
  return { raw, status: response.status(), meta, link };
}

export const first = (map: Map<string, string[]>, key: string) => map.get(key)?.[0];

/**
 * The `href` of every `<link>` in the head whose `rel` includes `alternate` and whose `type` is
 * `type`, such as `text/markdown`. `link` is keyed by the whole `rel` and drops the `type`, so this
 * reads the tags again.
 */
export function alternates(head: Head, type: string): string[] {
  const attribute = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1];
  return (head.raw.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/).includes('alternate'))
    .filter((tag) => (attribute(tag, 'type') ?? '').toLowerCase() === type)
    .map((tag) => attribute(tag, 'href') ?? '');
}

/**
 * An attribute value as text: the character references React writes into one (`&amp;`, `&quot;`,
 * `&#x27;`, `&lt;`, `&gt;`) and any numeric one, decoded. Enough for a served `content` or `href`,
 * which React escapes and nothing else writes.
 */
export function attributeText(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(?:#x([\da-f]+)|#(\d+)|(amp|quot|apos|lt|gt));/gi, (_, hex, dec, name) =>
    hex
      ? String.fromCodePoint(parseInt(hex, 16))
      : dec
        ? String.fromCodePoint(Number(dec))
        : named[name.toLowerCase()],
  );
}
