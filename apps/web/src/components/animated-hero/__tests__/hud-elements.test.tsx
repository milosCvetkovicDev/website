import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, render } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataStream } from '../hud-elements';

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and use-gsap-scroll registers
// it at import time, so the stub must exist before the imports above are evaluated.
const media = vi.hoisted(() => {
  type Listener = (event: MediaQueryListEvent) => void;
  const listeners = new Set<Listener>();
  const state = {
    reduce: false,
    /** Flips the preference and notifies subscribers, as the OS toggle would. */
    set(reduce: boolean) {
      state.reduce = reduce;
      listeners.forEach((listener) => listener({ matches: reduce } as MediaQueryListEvent));
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const reducedMotionQuery = query === '(prefers-reduced-motion: reduce)';
      return {
        get matches() {
          return reducedMotionQuery && state.reduce;
        },
        media: query,
        addEventListener(type: string, listener: Listener) {
          if (reducedMotionQuery && type === 'change') listeners.add(listener);
        },
        removeEventListener(_type: string, listener: Listener) {
          listeners.delete(listener);
        },
      };
    },
  });
  return state;
});

/** The generator DataStream used when it rendered its texture as 50 lines of 80 characters. */
function legacyDataStreamLines(): string[] {
  const generateLine = (seed: number): string => {
    let result = '';
    for (let i = 0; i < 80; i++) {
      result += (seed * (i + 1) * 7) % 13 > 6 ? '1' : '0';
    }
    return result;
  };
  return Array.from({ length: 50 }, (_, i) => generateLine(i + 1));
}

/**
 * DataStream's inline style as the server renders it, one entry per declaration. Read from the
 * server's HTML because jsdom drops the properties it does not know, mask-size among them.
 */
function serverStyle(): Map<string, string> {
  const doc = new DOMParser().parseFromString(renderToString(<DataStream />), 'text/html');
  const style = doc.querySelector('[style]')?.getAttribute('style') ?? '';
  // A value can contain ':' (the tile's http: namespace) but never ';'.
  return new Map(
    style
      .split(';')
      .filter((declaration) => declaration.trim())
      .map((declaration): [string, string] => {
        const colon = declaration.indexOf(':');
        return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
      }),
  );
}

/** The SVG tile DataStream masks its fill with, decoded from the custom property that carries it. */
function dataStreamTile(style: Map<string, string>): SVGSVGElement {
  const url = style.get('--data-stream-tile') ?? '';
  const prefix = 'url("data:image/svg+xml,';
  expect(url.startsWith(prefix) && url.endsWith('")'), url.slice(0, 60)).toBe(true);
  const svg = decodeURIComponent(url.slice(prefix.length, -2));
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return doc.documentElement as unknown as SVGSVGElement;
}

/** The tile cells, as "column,row", that one glyph path draws into. */
function cellsDrawnBy(tile: SVGSVGElement, pathId: string, period: number): Set<string> {
  const cellWidth = Number(tile.getAttribute('width')) / period;
  const cellHeight = Number(tile.getAttribute('height')) / period;
  const d = tile.querySelector(`#${pathId}`)?.getAttribute('d') ?? '';
  // Every subpath of a glyph starts inside the glyph's own cell.
  return new Set(
    [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)].map(
      ([, x, y]) => `${Math.floor(Number(x) / cellWidth)},${Math.floor(Number(y) / cellHeight)}`,
    ),
  );
}

describe('DataStream', () => {
  afterEach(cleanup);

  it('draws its texture rather than rendering characters', () => {
    const { container } = render(<DataStream />);

    expect(container.textContent).toBe('');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<DataStream />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('reproduces the legacy 80x50 block of digits exactly, as one 13x13 tile repeated', () => {
    const PERIOD = 13;
    const tile = dataStreamTile(serverStyle());
    const ones = cellsDrawnBy(tile, 'ones', PERIOD);
    const zeros = cellsDrawnBy(tile, 'zeros', PERIOD);

    // Every cell of the tile holds exactly one glyph.
    expect(ones.size + zeros.size).toBe(PERIOD * PERIOD);
    expect([...ones].filter((cell) => zeros.has(cell))).toEqual([]);

    const redrawn = legacyDataStreamLines().map((line, row) =>
      [...line]
        .map((_, column) => (ones.has(`${column % PERIOD},${row % PERIOD}`) ? '1' : '0'))
        .join(''),
    );
    expect(redrawn).toEqual(legacyDataStreamLines());
  });

  it('is one tile taller than its container and scrolls up by one tile, so each loop is seamless', () => {
    const style = serverStyle();
    const tile = dataStreamTile(style);
    const width = tile.getAttribute('width');
    const height = tile.getAttribute('height');

    expect(style.get('mask-image')).toBe('var(--data-stream-tile)');
    expect(style.get('-webkit-mask-image')).toBe('var(--data-stream-tile)');
    expect(style.get('mask-size')).toBe(`${width}px ${height}px`);
    expect(style.get('-webkit-mask-size')).toBe(`${width}px ${height}px`);
    expect(style.get('--scroll-up-by')).toBe(`${height}px`);
    expect(style.get('height')).toBe(`calc(100% + ${height}px)`);
    const { container } = render(<DataStream />);
    expect(container.querySelector('[style]')).toHaveClass('animate-scroll-up');
  });

  it('scrolls by the distance DataStream sets, which the shared keyframes read', () => {
    // jsdom loads no stylesheet, so the keyframes are checked as written.
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../app/globals.css'),
      'utf8',
    );
    const keyframes = css.slice(
      css.indexOf('@keyframes scroll-up'),
      css.indexOf('.animate-scroll-up'),
    );

    expect(keyframes).toContain('translateY(calc(-1 * var(--scroll-up-by, 50%)))');
  });
});

describe('server rendering', () => {
  type Components = typeof import('../hud-elements');

  afterEach(() => {
    media.reduce = false;
  });

  it.each([['DataStream', (c: Components) => <c.DataStream />]])(
    'hydrates %s without a mismatch, from a server and a client that each load the module',
    async (_, element) => {
      // Two instances of the module, as the server and the browser each evaluate it: a module-level
      // constant that differed between them would pass a single-instance test.
      vi.resetModules();
      const html = renderToString(element(await import('../hud-elements')));
      vi.resetModules();
      const client = await import('../hud-elements');
      // The client prefers reduced motion and the server cannot know it: hydration must still agree.
      media.reduce = true;
      const host = document.createElement('div');
      host.append(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
      document.body.append(host);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const recoverable = vi.fn();

      try {
        const root = await act(async () =>
          hydrateRoot(host, element(client), { onRecoverableError: recoverable }),
        );
        act(() => root.unmount());

        expect(recoverable).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        host.remove();
        consoleError.mockRestore();
      }
    },
  );
});
