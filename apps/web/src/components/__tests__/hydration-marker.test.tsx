import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HYDRATION_MARKER_ID } from '@/lib/hydration-marker';
import { HydrationMarker } from '../hydration-marker';

let container: HTMLDivElement;
let root: Root | undefined;

/**
 * A container holding exactly the markup the server sends for the marker. The markup is parsed with
 * `DOMParser`, which runs no scripts, and its nodes are moved into the container, as a browser does
 * with the response before React hydrates it.
 */
function serverRendered(): Element {
  const served = new DOMParser().parseFromString(renderToString(<HydrationMarker />), 'text/html');
  container = document.createElement('div');
  container.append(...served.body.childNodes);
  document.body.append(container);
  const marker = container.querySelector(`#${HYDRATION_MARKER_ID}`);
  if (!marker) throw new Error(`the server render has no #${HYDRATION_MARKER_ID}`);
  return marker;
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container.remove();
});

describe('HydrationMarker', () => {
  it('is unhydrated and hidden in the server-rendered markup', () => {
    const marker = serverRendered();

    expect(container.querySelectorAll(`#${HYDRATION_MARKER_ID}`)).toHaveLength(1);
    expect(marker).toHaveAttribute('data-hydrated', 'false');
    expect(marker).toHaveAttribute('hidden');
  });

  it('reads hydrated once React hydrates that markup, without a mismatch', async () => {
    const marker = serverRendered();
    const onRecoverableError = vi.fn();

    await act(async () => {
      root = hydrateRoot(container, <HydrationMarker />, { onRecoverableError });
    });

    // The same node: React hydrated the server markup rather than throwing it away and rendering anew,
    // which is what a mismatch would have done.
    expect(container.querySelector(`#${HYDRATION_MARKER_ID}`)).toBe(marker);
    expect(marker).toHaveAttribute('data-hydrated', 'true');
    expect(onRecoverableError).not.toHaveBeenCalled();
  });
});
