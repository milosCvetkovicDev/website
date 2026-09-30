import { screen } from '@testing-library/react';

/** The clipped track of the stage named `name`: the bar the fill and the running shimmer sit in. */
export function stageTrack(name: string): HTMLElement {
  const track = screen
    .getByText(name)
    .parentElement?.querySelector<HTMLElement>('.overflow-hidden');
  if (!track) throw new Error(`The ${name} stage has no track.`);
  return track;
}

/**
 * The bar a stage fills: the one child of its track that is not the running shimmer. Found by what
 * it is rather than by its position, so a reorder of the two siblings cannot hand a test the
 * shimmer, and a second candidate fails here with a message that says so.
 */
export function stageFill(name: string): HTMLElement {
  const candidates = [...stageTrack(name).children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.classList.contains('animate-shimmer'),
  );
  if (candidates.length !== 1) {
    throw new Error(`The ${name} stage's track holds ${candidates.length} fills, not one.`);
  }
  return candidates[0];
}

/** How far the fill is drawn, read from the `scaleX()` in its inline transform. */
export function fillScale(fill: HTMLElement): number {
  const match = /^scaleX\(([^)]+)\)$/.exec(fill.style.transform);
  if (!match) throw new Error(`The fill's transform is "${fill.style.transform}", not a scaleX().`);
  return Number(match[1]);
}
