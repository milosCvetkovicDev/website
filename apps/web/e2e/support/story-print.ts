/**
 * What the home page story draws, read in the page: the instrument behind `story-print.spec.ts`.
 *
 * `sampleStorySection` runs inside the page through `Locator.evaluate`, so it is self-contained: it
 * reads nothing from this module's scope, and every helper it uses is declared inside it.
 */

/** An element that hides or moves a text: the text itself or one of its ancestors. */
export interface StoryHider {
  /** The element's identity in the page (see `StoryText.id`), so two texts under one element share it. */
  id: number;
  /** Its tag, first class, and each property by which it hides or moves what it holds. */
  what: string;
}

/** One text element of a story section, as the page draws it at the moment of sampling. */
export interface StoryText {
  /**
   * The element's identity, kept for the life of the page in a `WeakMap` on `window`, so one element
   * has the same id in every sample however the DOM around it changes between samples.
   */
  id: number;
  /** Its own text, whitespace collapsed, cut short (by code point) for a failure message. */
  text: string;
  /** Its opacity times every ancestor's, up to `<html>`: what it is drawn at. */
  opacity: number;
  /**
   * Every element from it up to `<html>` that hides or moves it, outermost first: an opacity below
   * 1, `visibility` other than `visible`, a computed `transform` that is not the identity, an
   * individual `translate` or `rotate` other than zero, an individual `scale` that shrinks it, a
   * `filter` or a `clip-path`. Empty for a text drawn in full, in place. The individual properties
   * are Tailwind's (GSAP writes `transform` and pins them to `none`), and the story's design uses
   * them only to enlarge (QuestItem's `scale-110` check mark), so only a shrink counts.
   */
  hiddenBy: StoryHider[];
}

/** One `.arch-line` path, as its computed stroke dashing stands. */
export interface StoryArchLine {
  dasharray: string;
  offset: string;
}

/** One story section, sampled. */
export interface StorySample {
  texts: StoryText[];
  /** How many text elements matched an exclusion and were left out of `texts`. */
  excluded: number;
  /** Each `.arch-line` path in the section. */
  archLines: StoryArchLine[];
  /**
   * Each element in the section, text or not, whose inline style sets an `opacity` or a
   * `visibility` that, as computed now, hides it: every story entrance starts from `opacity: 0`,
   * written inline by GSAP or, on the code lines, by the Execution count. Inline transforms are
   * left out because the Gauntlet's pipeline fills draw their progress as an inline `scaleX()`,
   * row state that prints as it stands. Meaningful in print, where every marked element is forced
   * visible, so what is left is an element the story hides without `data-story-reveal`.
   */
  heldBack: string[];
}

/**
 * Samples every text element in `section`, the section's `.arch-line` paths and every element in it
 * that an inline style holds hidden.
 *
 * A text element is an element with a text node of its own that holds more than whitespace, and
 * that generates a box (`getClientRects()` is not empty, which an SVG `<text>` does too). The box is
 * not required to have a size: a from-state of `scale: 0`, as on Discovery's requirement tags,
 * collapses every rectangle inside it to nothing, and a text measured by its rectangle would drop
 * out of the sample exactly when it is hidden. `aria-hidden` subtrees are sampled with the rest,
 * because `SplitText`'s letters, HudPanel's ACTIVE label and the emoji are drawn text; `.sr-only`
 * subtrees are not, because they are drawn neither on screen nor on paper, by design.
 *
 * `excludedTexts` names texts left out by their whole own text; the spec says why each one is.
 */
export function sampleStorySection(
  section: Element,
  excludedTexts: readonly string[],
): StorySample {
  // One identity per element for the life of the page, shared by every call.
  type Ids = { map: WeakMap<Element, number>; next: number };
  const host = window as unknown as { __storyPrintIds?: Ids };
  host.__storyPrintIds ??= { map: new WeakMap(), next: 0 };
  const ids = host.__storyPrintIds;
  const idOf = (element: Element) => {
    let id = ids.map.get(element);
    if (id === undefined) {
      id = ids.next++;
      ids.map.set(element, id);
    }
    return id;
  };

  const IDENTITY_TRANSFORMS = new Set([
    'none',
    'matrix(1, 0, 0, 1, 0, 0)',
    'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)',
  ]);
  const zeroLengths = (value: string) =>
    value.split(/\s+/).every((part) => /^0[a-z%]*$/.test(part));
  const shrinks = (value: string) =>
    value.split(/\s+/).some((part) => Number.parseFloat(part) / (part.endsWith('%') ? 100 : 1) < 1);

  /** How `style` hides or moves its element, one entry per property; empty when it does neither. */
  const hidingOf = (style: CSSStyleDeclaration): string[] => {
    const how: string[] = [];
    const opacity = Number(style.opacity);
    if (!(opacity >= 1)) how.push(`opacity ${style.opacity}`);
    if (style.visibility !== 'visible') how.push(`visibility ${style.visibility}`);
    if (!IDENTITY_TRANSFORMS.has(style.transform)) how.push(style.transform);
    if (style.translate !== 'none' && !zeroLengths(style.translate))
      how.push(`translate ${style.translate}`);
    if (style.scale !== 'none' && shrinks(style.scale)) how.push(`scale ${style.scale}`);
    if (style.rotate !== 'none' && !zeroLengths(style.rotate)) how.push(`rotate ${style.rotate}`);
    if (style.filter !== 'none') how.push(`filter ${style.filter}`);
    if (style.clipPath !== 'none') how.push(`clip-path ${style.clipPath}`);
    return how;
  };

  const nameOf = (element: Element) => {
    const firstClass = element.getAttribute('class')?.trim().split(/\s+/)[0];
    const tag = element.tagName.toLowerCase();
    return firstClass ? `${tag}.${firstClass}` : tag;
  };

  // Each element's opacity and hiding, read once per call however many texts it holds.
  const seen = new Map<Element, { opacity: number; how: string[] }>();
  const read = (element: Element) => {
    let entry = seen.get(element);
    if (!entry) {
      const style = getComputedStyle(element);
      entry = { opacity: Number(style.opacity), how: hidingOf(style) };
      seen.set(element, entry);
    }
    return entry;
  };

  const texts: StoryText[] = [];
  const heldBack: string[] = [];
  let excluded = 0;
  for (const element of section.querySelectorAll('*')) {
    const inline = (element as HTMLElement | SVGElement).style;
    if (
      inline &&
      (inline.getPropertyValue('opacity') !== '' || inline.getPropertyValue('visibility') !== '')
    ) {
      const how = read(element).how.filter((entry) => /^(opacity|visibility) /.test(entry));
      if (how.length > 0) heldBack.push(`${nameOf(element)} ${how.join(', ')}`);
    }

    let own = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) own += node.textContent ?? '';
    }
    const text = own.replace(/\s+/g, ' ').trim();
    if (text === '' || element.getClientRects().length === 0 || element.closest('.sr-only'))
      continue;
    if (excludedTexts.includes(text)) {
      excluded += 1;
      continue;
    }

    let opacity = 1;
    const hiddenBy: StoryHider[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const entry = read(node);
      opacity *= entry.opacity;
      if (entry.how.length > 0)
        hiddenBy.unshift({ id: idOf(node), what: [nameOf(node), ...entry.how].join(' ') });
    }
    const points = [...text];
    texts.push({
      id: idOf(element),
      text: points.length > 48 ? `${points.slice(0, 47).join('')}…` : text,
      opacity,
      hiddenBy,
    });
  }

  const archLines = [...section.querySelectorAll('.arch-line')].map((line) => {
    const style = getComputedStyle(line);
    return { dasharray: style.strokeDasharray, offset: style.strokeDashoffset };
  });
  return { texts, excluded, archLines, heldBack };
}
