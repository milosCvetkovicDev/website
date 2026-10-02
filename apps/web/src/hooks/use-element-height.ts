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
      if (!element) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            'useElementHeight: the ref was not attached when React subscribed, so the height stays 0. ' +
              'Put it on an element rendered unconditionally.',
          );
        }
        return () => {};
      }
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
      // The content box, as `contentRect` reports it: clientHeight less the vertical padding.
      const onResize = () => {
        const style = getComputedStyle(element);
        const padding =
          (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        report(element.clientHeight - padding);
      };
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
 * until the first report. React subscribes in a passive effect, which can run after the first
 * paint, so a frame can be painted at 0 before the observer's first report, which then arrives
 * before the next paint. An element that is not displayed reports nothing and stays at 0.
 *
 * Without `ResizeObserver` (jsdom; every browser the site supports has it) it reads the content box
 * from `clientHeight` at once and again on every window resize only, so a size change from anything
 * else goes unseen there.
 *
 * The ref is read once, when React subscribes after the first commit, so it must sit on an element
 * rendered unconditionally and never swapped for another node; in development a ref that is not
 * attached by then is reported with a console warning.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [store] = useState(() => createHeightStore(ref));
  return useSyncExternalStore(store.subscribe, store.read, readOnServer);
}
