import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap } from '../gsap-runtime';
import { requestGsap } from '../load-gsap';
import { DataStream, PipelineStage, StatDisplay } from '../hud-elements';
import { cssTransitions } from './gsap-css-conflicts';

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-runtime registers
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

// StatDisplay asks load-gsap.ts for GSAP, which arrives on the visitor's first scroll, tap or key.
// Its glitch tests are about what it does with GSAP, so the file requests that load outright and
// waits for it once, with real timers; from then on the timeline is built synchronously on mount,
// as it is in the browser.
beforeAll(async () => {
  await requestGsap();
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

  it.each([
    ['DataStream', (c: Components) => <c.DataStream />],
    ['a StatDisplay', (c: Components) => <c.StatDisplay label="Uptime" value="99.9%" />],
    [
      'a highlighted StatDisplay',
      (c: Components) => <c.StatDisplay label="Fixes" value={3} highlight />,
    ],
  ])(
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

describe('StatDisplay', () => {
  /** Renders every GSAP tween as if `seconds` had elapsed; the ticker is detached in beforeEach. */
  const elapse = (seconds: number) => gsap.updateRoot(gsap.globalTimeline.time() + seconds);

  /** The element the hover glitch has moved, walking up from the value's text to its row. */
  const movedElement = (text: HTMLElement): HTMLElement | null => {
    const row = text.closest<HTMLElement>('.group');
    for (let el: HTMLElement | null = text; el && el !== row; el = el.parentElement) {
      if (el.style.transform) return el;
    }
    return null;
  };

  beforeEach(() => {
    media.reduce = false;
    // Drive GSAP by hand instead of from requestAnimationFrame, so the glitch is deterministic.
    gsap.ticker.remove(gsap.updateRoot);
  });

  afterEach(() => {
    cleanup();
    gsap.ticker.add(gsap.updateRoot);
    vi.restoreAllMocks();
  });

  it('pulses a decorative glow around a highlighted value, never the value itself', () => {
    const { container } = render(<StatDisplay label="Auto-fixes today" value={3} highlight />);
    const value = screen.getByText('3');
    const row = value.closest<HTMLElement>('.group');

    // Nothing between the glyphs and their row may animate opacity: that dims the text itself.
    for (let el: HTMLElement | null = value; el && el !== row; el = el.parentElement) {
      expect(el).not.toHaveClass('animate-pulse');
    }
    const pulse = container.querySelector('.animate-pulse');
    expect(pulse).not.toBeNull();
    expect(pulse).toHaveAttribute('aria-hidden', 'true');
    expect(pulse?.textContent).toBe('');
    expect(pulse?.contains(value)).toBe(false);
    // And it paints nothing under the glyphs: a fill there would stack with the tints of the
    // surfaces the row sits on and lower the value's contrast.
    expect(pulse?.className).not.toMatch(/(^|[\s:])bg-|inset_|inset-(shadow|ring)/);
    // Its box encloses the value's, so the shadow, painted only outside that box, misses the glyphs.
    expect(pulse?.className).toMatch(/(^|\s)-inset-x-\S/);
    expect(pulse?.className).toMatch(/(^|\s)-inset-y-\S/);
  });

  it('draws no glow around a highlighted value that is empty', () => {
    const { container } = render(<StatDisplay label="Pending" value="" highlight />);

    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('does not pulse anything when the value is not highlighted', () => {
    const { container } = render(<StatDisplay label="Uptime" value="99.9%" />);

    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('glitches the value when the row is hovered', () => {
    render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');

    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);

    expect(movedElement(value)).not.toBeNull();
  });

  it('does not glitch when the visitor prefers reduced motion', () => {
    media.reduce = true;
    render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');

    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);

    expect(movedElement(value)).toBeNull();
  });

  it('restarts a glitch that is still running instead of stacking a second one on the value', () => {
    render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');
    const row = value.closest<HTMLElement>('.group')!;
    fireEvent.mouseEnter(row);
    elapse(0.06);
    const moved = movedElement(value)!;
    const frameAfterOneStep = moved.style.transform;
    const tweensOfOneGlitch = gsap.getTweensOf(moved).length;

    fireEvent.mouseEnter(row);
    elapse(0.06);

    // Replayed from rest, so the same time in lands on the same frame, on one timeline.
    expect(moved.style.transform).toBe(frameAfterOneStep);
    expect(tweensOfOneGlitch).toBeGreaterThan(0);
    expect(gsap.getTweensOf(moved)).toHaveLength(tweensOfOneGlitch);
  });

  it('reverts a running glitch when it unmounts', () => {
    const { unmount } = render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');
    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);
    const moved = movedElement(value)!;

    unmount();

    expect(gsap.getTweensOf(moved)).toEqual([]);
  });

  it('reverts a running glitch, back to where the value started, when reduced motion turns on', () => {
    render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');
    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);
    const moved = movedElement(value)!;

    act(() => media.set(true));

    expect(gsap.getTweensOf(moved)).toEqual([]);
    expect(movedElement(value)).toBeNull();

    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);

    expect(movedElement(value)).toBeNull();
  });

  it('leaves no hover listener behind when reduced motion turns on, or when it unmounts', () => {
    // A leaked listener would do nothing visible, because the context kills its timeline, so the
    // registrations themselves are what is checked.
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const hoverListeners = (spy: typeof added) =>
      spy.mock.calls.filter(([type]) => type === 'mouseenter').length;
    const { unmount } = render(<StatDisplay label="Uptime" value="99.9%" />);
    expect(hoverListeners(added)).toBe(1);

    act(() => media.set(true));
    expect(hoverListeners(removed)).toBe(hoverListeners(added));

    act(() => media.set(false));
    unmount();
    expect(hoverListeners(added)).toBe(2);
    expect(hoverListeners(removed)).toBe(2);
  });

  it('glitches again once reduced motion is switched back off', () => {
    render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');
    act(() => media.set(true));
    act(() => media.set(false));

    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);

    expect(movedElement(value)).not.toBeNull();
  });

  it('leaves the transform GSAP animates free of any CSS transition, which would smear the glitch', () => {
    render(<StatDisplay label="Uptime" value="99.9%" />);
    const value = screen.getByText('99.9%');
    fireEvent.mouseEnter(value.closest('.group')!);
    elapse(0.06);
    const moved = movedElement(value)!;

    // `transition`, `transition-all`, `transition-transform` and an arbitrary list naming
    // transform all cover it; `transition-colors` does not.
    const smearing = moved.className
      .split(/\s+/)
      .filter((utility) =>
        /^([\w-]+:)*transition(-all|-transform|-\[[^\]]*(all|transform|translate|scale)[^\]]*\])?$/.test(
          utility,
        ),
      );
    expect(smearing).toEqual([]);
  });
});

/** Every status `PipelineStage` accepts, checked against its props so a new one cannot go untested. */
const PIPELINE_STATUSES = [
  'pending',
  'running',
  'passed',
  'failed',
] as const satisfies readonly ComponentProps<typeof PipelineStage>['status'][];
const everyStatusListed: [
  Exclude<ComponentProps<typeof PipelineStage>['status'], (typeof PIPELINE_STATUSES)[number]>,
] extends [never]
  ? true
  : never = true;

describe('PipelineStage', () => {
  afterEach(() => cleanup());

  // GauntletPhase rewrites the fill's width every frame from a GSAP tween on a plain object, so a
  // transition on width restarts on every frame and the bar trails its own progress: measured in
  // Chromium, `transition-all duration-500` left the fill at 3-7% when the stage reached 100%, and
  // full 467-483 ms later. The status colour still eases, which is the change CSS should animate.
  it.each(PIPELINE_STATUSES)(
    'transitions nothing on the fill but its colours, width least of all, while %s',
    async (status) => {
      expect(everyStatusListed).toBe(true);
      render(<PipelineStage name="UNIT TESTS" status={status} progress={40} />);
      const fill = screen
        .getByText('UNIT TESTS')
        .parentElement?.querySelector<HTMLElement>('.overflow-hidden > div');
      // The element React writes the progress to.
      expect(fill?.style.width).toBe('40%');

      // What the fill may transition is what `transition-colors` covers in the installed Tailwind,
      // read the same way, so `transition-[inline-size]` or a bare duration fails as well as
      // `transition-all`.
      const colours = document.createElement('div');
      colours.className = 'transition-colors duration-500';
      const allowed = await cssTransitions(colours);
      const transitioned = await cssTransitions(fill!);
      expect(
        [...transitioned].filter((property) => !allowed.has(property)),
        `the fill transitions ${[...transitioned].join(', ')}`,
      ).toEqual([]);
      expect(transitioned).toContain('background-color');
    },
  );
});
