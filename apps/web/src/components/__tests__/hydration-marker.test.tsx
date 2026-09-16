import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HYDRATION_MARKER_ID } from '@/lib/hydration-marker';
import { HydrationMarker } from '../hydration-marker';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

/**
 * Exactly the markup the server sends for the marker, in a container attached to the document. The
 * markup is parsed with `DOMParser`, which runs no scripts, and its nodes are moved into the container,
 * as a browser does with the response before React hydrates it.
 */
function serverRendered(): { host: HTMLDivElement; marker: Element } {
  const served = new DOMParser().parseFromString(renderToString(<HydrationMarker />), 'text/html');
  const host = document.createElement('div');
  host.append(...served.body.childNodes);
  document.body.append(host);
  container = host;
  const marker = host.querySelector(`#${HYDRATION_MARKER_ID}`);
  if (!marker) throw new Error(`the server render has no #${HYDRATION_MARKER_ID}`);
  return { host, marker };
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
});

describe('HydrationMarker', () => {
  it('is unhydrated and hidden in the server-rendered markup', () => {
    const { host, marker } = serverRendered();

    expect(host.querySelectorAll(`#${HYDRATION_MARKER_ID}`)).toHaveLength(1);
    expect(marker).toHaveAttribute('data-hydrated', 'false');
    expect(marker).toHaveAttribute('hidden');
  });

  it('reads hydrated once React hydrates that markup, without a mismatch', async () => {
    // React reports a text or structure mismatch through `onRecoverableError` and renders that subtree
    // anew. An attribute-only mismatch, the only kind this component could produce, is left unpatched
    // and reported through `console.error` alone, so both channels are watched, from the server
    // render on.
    const consoleError = vi.spyOn(console, 'error');
    const { host, marker } = serverRendered();
    const onRecoverableError = vi.fn();

    await act(async () => {
      root = hydrateRoot(host, <HydrationMarker />, { onRecoverableError });
    });

    // The same node, so the server markup was hydrated rather than replaced.
    expect(host.querySelector(`#${HYDRATION_MARKER_ID}`)).toBe(marker);
    expect(marker).toHaveAttribute('data-hydrated', 'true');
    expect(marker).toHaveAttribute('hidden');
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
