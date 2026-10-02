import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementHeight } from '../use-element-height';

/** Prints the height it reads, measured from its own box. */
function Measured({ onRender }: { onRender?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useElementHeight(ref);
  onRender?.();
  return (
    <div ref={ref} data-testid="box">
      {height}
    </div>
  );
}

/**
 * A ResizeObserver whose reports the test delivers, as the browser does once an observed element is
 * laid out and again on every resize. jsdom has none of its own.
 */
function stubResizeObserver() {
  const observers: FakeObserver[] = [];
  class FakeObserver {
    readonly targets = new Set<Element>();
    disconnected = false;
    constructor(readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
      this.disconnected = true;
    }
    report(height: number) {
      const entries = [...this.targets].map(
        (target) => ({ target, contentRect: { height } }) as unknown as ResizeObserverEntry,
      );
      act(() => this.callback(entries, this as unknown as ResizeObserver));
    }
  }
  vi.stubGlobal('ResizeObserver', FakeObserver);
  return observers;
}

describe('useElementHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads 0 on the server', () => {
    expect(renderToString(<Measured />)).toContain('>0<');
  });

  it('reads 0 until the observer reports, then every height it reports', () => {
    const observers = stubResizeObserver();
    render(<Measured />);
    const box = screen.getByTestId('box');
    expect(box.textContent).toBe('0');
    expect(observers).toHaveLength(1);
    expect([...observers[0].targets]).toEqual([box]);

    observers[0].report(612);
    expect(box.textContent).toBe('612');
    observers[0].report(1332);
    expect(box.textContent).toBe('1332');
  });

  it('does not render again for a report of the height it holds', () => {
    const observers = stubResizeObserver();
    const onRender = vi.fn();
    render(<Measured onRender={onRender} />);
    observers[0].report(612);
    const renders = onRender.mock.calls.length;
    observers[0].report(612);
    expect(onRender).toHaveBeenCalledTimes(renders);
  });

  it('disconnects its observer on unmount', () => {
    const observers = stubResizeObserver();
    const { unmount } = render(<Measured />);
    expect(observers[0].disconnected).toBe(false);
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });

  it('without ResizeObserver, reads clientHeight at once and on every window resize', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    let clientHeight = 300;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => clientHeight);
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Measured />);
    const box = screen.getByTestId('box');
    expect(box.textContent).toBe('300');

    clientHeight = 900;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(box.textContent).toBe('900');

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
