/**
 * How an emoji is found in text, shared by the unit test on the page records
 * (`src/data/__tests__/pages.test.ts`) and the e2e spec on the served pages (`e2e/pages.spec.ts`),
 * so both treat the same characters as emoji.
 *
 * An emoji here is what a screen reader names aloud when it stands as decoration: any
 * `Extended_Pictographic` character ("rocket", "gear"), a regional-indicator letter, two of which
 * make a flag ("flag: Serbia"), and the combining keycap U+20E3 ("keycap: 1"). The flags and the
 * keycaps are not `Extended_Pictographic`, so the property alone would let them through.
 *
 * Its one exception: ©, ® and ™ are `Extended_Pictographic` too, but in running text they are
 * the ordinary signs, so they count only when U+FE0F asks for the emoji presentation (©️).
 */
const EMOJI = String.raw`[©®™]️|(?![©®™])\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣`;

/** The code points of `text`, written `U+1F680` and joined by spaces. */
const codePoints = (text: string) =>
  [...text].map((char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase()}`).join(' ');

/**
 * Every emoji in `text`, each with its code points, so a failure says which one it found. A new
 * expression per call: a shared global one would carry its `lastIndex` from one call to the next.
 */
export function pictographsIn(text: string): string[] {
  return [...text.matchAll(new RegExp(EMOJI, 'gu'))].map(
    ([match]) => `${match} ${codePoints(match)}`,
  );
}

/** Whether `text` is one emoji and nothing else: its pictographs, variation selectors and joiners. */
export function isOnlyEmoji(text: string): boolean {
  return pictographsIn(text).length > 0 && /^[\p{Extended_Pictographic}️‍]+$/u.test(text);
}
