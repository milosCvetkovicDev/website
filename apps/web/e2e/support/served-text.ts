import type { Page } from '@playwright/test';

/**
 * The text a crawler would read out of the served markup.
 *
 * One extractor for every spec that measures served text (`served-html.spec.ts`,
 * `no-js-text.spec.ts`), because the number it returns is only comparable with itself: two
 * researchers measured the same page on the same day and got 5,156 and 4,623 characters, with
 * nothing but the extraction between them (#55). A floor or a phrase is pinned to this function.
 *
 * A plain `html.includes('EXECUTION')` does not work on this page and never will: `AnimatedText` wraps
 * every character in its own `<span>`, so the label arrives as `E</span><span …>X</span>…` and no
 * contiguous substring of the response contains the word. That is R14's mechanism
 * (`hero-story-names.spec.ts`) showing up in a second place. Reading the text nodes recovers the
 * text, which is the right question anyway: these specs are about the content being served, not
 * about how it is marked up.
 *
 * The browser parses the markup; regular expressions do not. The hand-rolled stripper this replaces
 * produced wrong text for inputs that are legal HTML, which is the one thing a measuring instrument
 * cannot do: `</script >` left script source in the text, or deleted visible copy up to the next
 * `</script>`; a `>` inside a comment or a bare `<` in text cut the text in the wrong place; and entity
 * decoding was a short list applied in sequence, so `&gt;` stayed encoded (the Discovery prompt glyph
 * on `/` read as `&gt;`) while `&amp;nbsp;` was decoded twice, into a space. `DOMParser` runs the HTML
 * parsing algorithm, so tags, comments and character references come out as a browser reads them.
 *
 * A document created by `DOMParser` has scripting disabled: none of its scripts run and none of its
 * event handler attributes fire, so parsing the response cannot act on the page doing the parsing.
 * `page.evaluate` works with `javaScriptEnabled: false` too, because the driver injects it rather
 * than the page running it (the transparency test in `served-html.spec.ts` relies on the same fact).
 * Any page will do, `about:blank` included: nothing is navigated.
 *
 * - `script`, `style` and `template` contribute one space and none of their content. Script and style
 *   text is code rather than copy, and a template's content is inert until a script clones it (React's
 *   placeholder for a Suspense boundary still pending when the shell is sent, `<template id="B:0">`, is
 *   one; `/` served one while its tmux background was lazy). The space keeps the words either side
 *   apart, as the regular expressions did for script and style.
 * - `noscript` is kept. With scripting disabled the parser reads its content as ordinary markup, which
 *   is exactly what a crawler that runs no JavaScript does with it. None of the eleven routes serves one
 *   today, but a fallback added later is copy written for that very reader, so it has to count.
 * - Text nodes are joined with nothing, because an element boundary is not a word boundary: that is how
 *   the `AnimatedText` spans read back as `EXECUTION`. Whitespace runs then collapse to a single space;
 *   `\s` matches U+00A0, so a non-breaking space collapses with them.
 *
 * Why zero-join, measured on `/` on 2026-09-12 (#55): an extractor that joins text nodes with a
 * space, or replaces each tag with one (`html.replace(/<[^>]+>/g, ' ')`), shatters every
 * `AnimatedText` line into letters. The discovery headline comes back as `M o s t b u g s l i v e …`,
 * because its `wave` animation renders each character as its own `<span class="inline-block">` inside
 * a per-word span, with the spaces between words as spans of their own (`animated-text.tsx`), and no
 * phrase assertion can find the sentence. That is an artefact of the extractor, not a defect of the
 * page: Chrome's `innerText` and this walk both read
 * `Most bugs live in the gap between what you asked for and what you meant.` whole. The letter-spaced
 * *accessible name* on the same markup is a different defect, which #47 owns; do not "fix" the spans
 * to suit an extractor. The flip side is that zero-join cannot invent a word boundary the markup does
 * not have: `<br />` is an element, not a space, so text either side of one runs together (see the
 * hero headline in `no-js-text.spec.ts`).
 */
export async function servedText(page: Page, html: string): Promise<string> {
  return page.evaluate((markup) => {
    const skipped = new Set(['script', 'style', 'template']);
    const parts: string[] = [];
    const walk = (parent: Node) => {
      for (const node of parent.childNodes) {
        if (node instanceof Text) {
          parts.push(node.data);
        } else if (node instanceof Element) {
          if (skipped.has(node.localName)) parts.push(' ');
          else walk(node);
        }
      }
    };
    walk(new DOMParser().parseFromString(markup, 'text/html'));
    return parts.join('').replace(/\s+/g, ' ');
  }, html);
}
