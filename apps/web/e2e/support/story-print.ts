/**
 * What the home page story draws, read in the page: the instrument behind `story-print.spec.ts`.
 *
 * `sampleStorySection` runs inside the page through `Locator.evaluate`, so it is self-contained: it
 * reads nothing from this module's scope, and every helper it uses is declared inside it.
 */

/** An element that hides or moves a text: the text itself or one of its ancestors. */
export interface StoryHider {
  /** The element's place in the whole document, so two texts under one element share it. */
  id: number;
  /** Its tag, first class, own opacity when below 1 and computed transform when not the identity. */
  what: string;
}

/** One text element of a story section, as the page draws it at the moment of sampling. */
export interface StoryText {
  /** Its place among the section's text elements, in document order. */
  index: number;
  /** Its own text, whitespace collapsed, cut short for a failure message. */
  text: string;
  /** Its opacity times every ancestor's, up to `<html>`: what it is drawn at. */
  opacity: number;
  /**
   * Every element from it up to `<html>` with an opacity below 1 or a computed `transform` that is
   * neither `none` nor the identity matrix, outermost first. Empty for a text drawn in full, in place.
   */
  hiddenBy: StoryHider[];
}

/** One story section, sampled. */
export interface StorySample {
  texts: StoryText[];
  /** How many text elements matched an exclusion and were left out of `texts`. */
  excluded: number;
  /** Each `.arch-line` path in the section: its computed `stroke-dashoffset`, as a number. */
  archLineOffsets: number[];
}

/**
 * Samples every text element in `section`, and the section's `.arch-line` paths.
 *
 * A text element is an element with a text node of its own that holds more than whitespace, and
 * that generates a box (`getClientRects()` is not empty, which an SVG `<text>` does too). The box is
 * not required to have a size: a from-state of `scale: 0`, as on Discovery's requirement tags,
 * collapses every rectangle inside it to nothing, and a text measured by its rectangle would drop
 * out of the sample exactly when it is hidden. `aria-hidden` subtrees are sampled with the rest,
 * because `SplitText`'s letters, HudPanel's ACTIVE label and the emoji are drawn text.
 *
 * `excludedTexts` names texts left out by their whole own text; the spec says why each one is.
 */
export function sampleStorySection(
  section: Element,
  excludedTexts: readonly string[],
): StorySample {
  const isIdentity = (transform: string) =>
    transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
  const order = new Map([...document.querySelectorAll('*')].map((element, i) => [element, i]));

  const texts: StoryText[] = [];
  let excluded = 0;
  for (const element of section.querySelectorAll('*')) {
    let own = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) own += node.textContent ?? '';
    }
    const text = own.replace(/\s+/g, ' ').trim();
    if (text === '' || element.getClientRects().length === 0) continue;
    if (excludedTexts.includes(text)) {
      excluded += 1;
      continue;
    }

    let opacity = 1;
    const hiddenBy: StoryHider[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const ownOpacity = Number(style.opacity);
      opacity *= ownOpacity;
      if (ownOpacity < 1 || !isIdentity(style.transform)) {
        const firstClass = node.getAttribute('class')?.trim().split(/\s+/)[0];
        const what = [
          firstClass ? `${node.tagName.toLowerCase()}.${firstClass}` : node.tagName.toLowerCase(),
          ownOpacity < 1 ? `opacity ${ownOpacity}` : '',
          isIdentity(style.transform) ? '' : style.transform,
        ];
        hiddenBy.unshift({ id: order.get(node) ?? -1, what: what.filter(Boolean).join(' ') });
      }
    }
    texts.push({
      index: texts.length,
      text: text.length > 48 ? `${text.slice(0, 47)}…` : text,
      opacity,
      hiddenBy,
    });
  }

  const archLineOffsets = [...section.querySelectorAll('.arch-line')].map((line) =>
    Number.parseFloat(getComputedStyle(line).strokeDashoffset),
  );
  return { texts, excluded, archLineOffsets };
}
