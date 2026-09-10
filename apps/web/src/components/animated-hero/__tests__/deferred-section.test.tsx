import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredSection } from '../deferred-section';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(
    public readonly callback: IntersectionObserverCallback,
    public readonly options?: IntersectionObserverInit,
  ) {
    MockIntersectionObserver.instances.push(this);
  }
  fire(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('DeferredSection', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders its section on the server, so the markup is in the HTML', () => {
    // jsdom defines window even while rendering to a string; the real server has none.
    vi.stubGlobal('window', undefined);
    const html = renderToString(
      <DeferredSection>
        <p>Most bugs live in the gap</p>
      </DeferredSection>,
    );
    expect(html).toContain('Most bugs live in the gap');
    expect(html).not.toContain('<!--$!-->');
  });

  it('shows the placeholder until the section approaches, then renders it once', () => {
    render(
      <DeferredSection>
        <p>story section</p>
      </DeferredSection>,
    );
    expect(screen.queryByText('story section')).not.toBeInTheDocument();
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument();

    const [observer] = MockIntersectionObserver.instances;
    expect(observer.observe).toHaveBeenCalledTimes(1);
    // Anything already scrolled past counts as approached: a top-only root margin.
    expect(observer.options?.rootMargin).toBe('10000px 0px 0px 0px');

    act(() => observer.fire(false));
    expect(screen.queryByText('story section')).not.toBeInTheDocument();

    act(() => observer.fire(true));
    expect(screen.getByText('story section')).toBeInTheDocument();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('renders the section straight after hydration when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <DeferredSection>
        <p>story section</p>
      </DeferredSection>,
    );
    expect(screen.getByText('story section')).toBeInTheDocument();
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(
      <DeferredSection>
        <p>story section</p>
      </DeferredSection>,
    );
    const [observer] = MockIntersectionObserver.instances;
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
