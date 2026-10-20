import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoryVisibility } from '../use-story-visibility';

/** A stand-in for one story `<section>`. */
function Section({ id }: { id: string }) {
  const ref = useRef<HTMLElement>(null);
  useStoryVisibility(ref);
  return <section ref={ref} data-testid={id} />;
}

/**
 * An IntersectionObserver that records what it observes and lets the test deliver entries, as the
 * browser does once on `observe` and again on every crossing. jsdom has none of its own.
 */
function stubIntersectionObserver() {
  const observers: FakeObserver[] = [];
  class FakeObserver {
    readonly targets = new Set<Element>();
    disconnected = false;
    constructor(
      readonly callback: IntersectionObserverCallback,
      readonly options?: IntersectionObserverInit,
    ) {
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
    deliver(...entries: [Element, boolean][]) {
      act(() =>
        this.callback(
          entries.map(
            ([target, isIntersecting]) => ({ target, isIntersecting }) as IntersectionObserverEntry,
          ),
          this as unknown as IntersectionObserver,
        ),
      );
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return observers;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStoryVisibility', () => {
  it('writes nothing into the served HTML, so a section runs its animations until observed', () => {
    expect(renderToString(<Section id="hero" />)).not.toContain('data-story-visible');
  });

  it('does nothing without IntersectionObserver', () => {
    // jsdom has none, and every phase test mounts a section through this hook.
    expect(typeof IntersectionObserver).toBe('undefined');
    const { getByTestId } = render(<Section id="hero" />);
    expect(getByTestId('hero')).not.toHaveAttribute('data-story-visible');
  });

  it('marks each section visible or not, on the element itself, as it crosses the viewport', () => {
    const observers = stubIntersectionObserver();
    const { getByTestId } = render(
      <>
        <Section id="hero" />
        <Section id="discovery" />
      </>,
    );
    const hero = getByTestId('hero');
    const discovery = getByTestId('discovery');

    // One observer for the whole story, watching every section, with no margin: a section counts
    // as unseen only once no pixel of it is in the viewport.
    expect(observers).toHaveLength(1);
    const [observer] = observers;
    expect([...observer.targets]).toEqual([hero, discovery]);
    expect(observer.options?.rootMargin ?? '0px').toBe('0px');

    observer.deliver([hero, true], [discovery, false]);
    expect(hero).toHaveAttribute('data-story-visible', 'true');
    expect(discovery).toHaveAttribute('data-story-visible', 'false');

    observer.deliver([hero, false], [discovery, true]);
    expect(hero).toHaveAttribute('data-story-visible', 'false');
    expect(discovery).toHaveAttribute('data-story-visible', 'true');
  });

  it('stops observing on unmount, and disconnects once the last section has gone', () => {
    const observers = stubIntersectionObserver();
    const first = render(<Section id="hero" />);
    const second = render(<Section id="discovery" />);
    const [observer] = observers;
    const hero = first.getByTestId('hero');
    observer.deliver([hero, false]);

    first.unmount();
    expect(observer.targets.has(hero)).toBe(false);
    expect(hero).not.toHaveAttribute('data-story-visible');
    expect(observer.disconnected).toBe(false);

    second.unmount();
    expect(observer.disconnected).toBe(true);

    // An entry the browser queued before the section was unobserved can still arrive afterwards:
    // it must not mark an element nobody is watching any more.
    observer.deliver([hero, false]);
    expect(hero).not.toHaveAttribute('data-story-visible');

    // A later mount, such as a soft navigation back to `/`, starts a fresh observer.
    render(<Section id="loop" />);
    expect(observers).toHaveLength(2);
    expect(observers[1].targets.size).toBe(1);
  });
});
