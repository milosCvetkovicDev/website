'use client';

import { useState, useSyncExternalStore, type RefObject } from 'react';

const readOnServer = () => 0;

/**
 * A store holding the last height reported for the element `ref` points at. It subscribes when
 * React does, after the first commit, so the ref is read then and only then.
 */
function createHeightStore(ref: RefObject<HTMLElement | null>) {
  let height = 0;
  return {
    read: () => height,
    subscribe: (onChange: () => void) => {
      const element = ref.current;
      if (!element) return () => {};
      const report = (next: number) => {
        if (next === height) return;
        height = next;
        onChange();
      };
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver((entries) => {
          const latest = entries[entries.length - 1];
          if (latest) report(latest.contentRect.height);
        });
        observer.observe(element);
        return () => observer.disconnect();
      }
      const onResize = () => report(element.clientHeight);
      onResize();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    },
  };
}

/**
 * The height of the element `ref` points at, in CSS pixels: its content box, as a
 * `ResizeObserver` last reported it. Read through `useSyncExternalStore` (ADR 0006), so a resize
 * renders the caller again without an effect that sets state. 0 on the server, while hydrating and
 * until the first report, which the browser delivers after the element's first layout and before
 * its first paint; an element that is not displayed reports nothing and stays at 0. Without
 * `ResizeObserver` (jsdom) it reads `clientHeight` at once and again on every window resize.
 *
 * The ref is read once, when React subscribes after the first commit, so it must sit on an element
 * rendered unconditionally and never swapped for another node.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [store] = useState(() => createHeightStore(ref));
  return useSyncExternalStore(store.subscribe, store.read, readOnServer);
}
