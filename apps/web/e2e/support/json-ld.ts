/**
 * The one way the e2e specs read the JSON-LD a route serves: every spec that looks at the blocks
 * finds them here, so a change to how they are served (one `@graph` instead of several blocks, say)
 * is followed in one place. Pure string work, no Playwright: `src/test/schema-validator.test.ts`
 * pins `jsonLdScripts` through `support/schema-validator.ts`, which re-exports it.
 */

/**
 * Every ld+json script element, whatever the order and quoting of its attributes; group 1 is its
 * body.
 */
const LD_JSON_ELEMENT =
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Every ld+json script element in a served document, verbatim. A pattern is enough here: the blocks
 * are written through `serializeJsonLd`, which escapes every `<`, so none can contain `</script>`;
 * and Next's flight payload further down describes each one as a React element in escaped JSON
 * (`\"type\":\"application/ld+json\"`), which is not inside a script tag, so nothing is sent twice.
 */
export function jsonLdScripts(html: string): string[] {
  return [...html.matchAll(LD_JSON_ELEMENT)].map(([element]) => element);
}

/**
 * The text of every ld+json block, unparsed, in document order: what a `DOMParser`'s
 * `script.textContent` gives, since a script's text is never entity-decoded.
 */
export function jsonLdSources(html: string): string[] {
  return [...html.matchAll(LD_JSON_ELEMENT)].map(([, body]) => body);
}

/**
 * Every ld+json block, parsed. Each block is one node, so a block that does not parse, or parses to
 * anything but one object, throws, naming `where` (the route), the block's index and its text.
 */
export function jsonLdNodes(html: string, where: string): Record<string, unknown>[] {
  return jsonLdSources(html).map((source, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      throw new Error(
        `${where}: JSON-LD block ${index} does not parse (${String(error)}): ${source}`,
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${where}: JSON-LD block ${index} is not one node: ${source}`);
    }
    return parsed as Record<string, unknown>;
  });
}
