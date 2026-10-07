/**
 * The one way the e2e specs read the JSON-LD a route serves: every spec that looks at the blocks
 * finds them here, so how a block is recognised, counted and parsed is decided in one place. Pure
 * string work, no Playwright, pinned by `src/test/schema-validator.test.ts`.
 */

/**
 * Every ld+json script element, whatever the order and quoting of its attributes; group 1 is its
 * body. `type` is a whole attribute name, so `data-type` is not read as it; the value is exactly
 * `application/ld+json`, so `application/ld+jsonp` is not either; and the end tag may carry
 * whitespace or attributes before its `>`, as the HTML tokenizer allows.
 */
const LD_JSON_ELEMENT = new RegExp(
  String.raw`<script\b(?:[^>]*\s)?type\s*=\s*` +
    String.raw`["']?application/ld\+json(?=["'\s>])["']?[^>]*>` +
    String.raw`([\s\S]*?)</script\b[^>]*>`,
  'gi',
);

/**
 * Every ld+json script element in a served document, verbatim. A pattern is enough here: the blocks
 * are written through `serializeJsonLd`, which escapes every `<`, so none can contain `</script>`;
 * and Next's flight payload further down describes each one as a React element in escaped JSON
 * (`\"type\":\"application/ld+json\"`), which is not inside a script tag, so nothing is sent twice.
 * A tag the pattern does not take is not reported here: compare the count with
 * `jsonLdOpenTagCount`, as `jsonLdNodes` does.
 */
export function jsonLdScripts(html: string): string[] {
  return [...html.matchAll(LD_JSON_ELEMENT)].map(([element]) => element);
}

/**
 * The script open tags that mention `application/ld+json` anywhere in their attributes, counted
 * independently of `LD_JSON_ELEMENT`, so a block the element pattern misses (an unterminated
 * element, or a near miss such as `data-type`) is a count mismatch rather than a block that
 * silently drops out of what a spec checks.
 */
export function jsonLdOpenTagCount(html: string): number {
  return [...html.matchAll(/<script\b[^>]*>/gi)].filter(([tag]) =>
    /application\/ld\+json/i.test(tag),
  ).length;
}

/**
 * Every ld+json block, parsed. Each block is one node, so a block that does not parse, parses to
 * anything but one object, or wraps several nodes in an `@graph` throws, naming `where` (the
 * route), the block's index and its text. So does a script tag naming the type that the pattern
 * could not read. The text is the element's raw source, which is what the HTML parser gives a
 * script too, since a script's text is never entity-decoded.
 */
export function jsonLdNodes(html: string, where: string): Record<string, unknown>[] {
  const sources = [...html.matchAll(LD_JSON_ELEMENT)].map(([, body]) => body);
  const tags = jsonLdOpenTagCount(html);
  if (sources.length !== tags) {
    throw new Error(
      `${where}: ${tags} script tags mention application/ld+json, but ${sources.length} could be ` +
        'read as ld+json elements; the others are unterminated or not of that type.',
    );
  }
  return sources.map((source, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      throw new Error(
        `${where}: JSON-LD block ${index} does not parse (${String(error)}): ${source}`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      '@graph' in parsed
    ) {
      throw new Error(`${where}: JSON-LD block ${index} is not one node: ${source}`);
    }
    return parsed as Record<string, unknown>;
  });
}
