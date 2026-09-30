import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GSAP_LOADED_MARK, LOAD_TIMEOUT_MS, preloadGsap } from '../load-gsap';
import { AnimatedText } from '../animated-text';

/**
 * `AnimatedText` under `prefers-reduced-motion: reduce`, before anything has asked for GSAP.
 *
 * Under `reduce` no hover can use GSAP (#47, AC 4), so none may ask for it either: asking arms the
 * loader, and the visitor's first scroll would then fetch the chunk for nothing. That covers the
 * handlers and magnetic's effect that puts a pull back when the preference is switched on, which
 * has nothing to undo while GSAP has never been asked for.
 *
 * The loader holds one load per page in module state, so this file is its own page: nothing here
 * imports GSAP, and the load is only proved possible at the end, by arming it on purpose.
 */

// Reduce from the start, before any import reads the preference.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

type Animation = ComponentProps<typeof AnimatedText>['animation'];

const ANIMATIONS: Animation[] = [
  'scramble',
  'wave',
  'magnetic',
  'scatter',
  'glitch',
  'typewriter',
  'elastic',
  'stagger-up',
  'rainbow',
  'perspective',
  'gravity',
  'blur-reveal',
  'highlight',
  'morse',
];

const loaded = () => performance.getEntriesByName(GSAP_LOADED_MARK, 'mark');

/** A scroll, the intent an armed loader waits for, then time for the chunk to arrive if asked. */
async function scrollAndSettle() {
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    await vi.dynamicImportSettled();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('under reduce, before anything has asked for GSAP', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it(
    'no variant asks for GSAP on mount, hover, pointer move or leave',
    async () => {
      expect(window.scrollY).toBe(0);
      // ScrollTrigger, registered when GSAP arrives, restores the scroll position through
      // window.scrollTo, which jsdom does not implement.
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      for (const animation of ANIMATIONS) {
        const view = render(<AnimatedText animation={animation}>Ship it twice</AnimatedText>);
        const target = view.container.firstElementChild;
        if (!(target instanceof HTMLElement)) throw new Error(`${animation}: rendered no element`);
        fireEvent.mouseEnter(target);
        fireEvent.mouseMove(target, { clientX: 300, clientY: 40 });
        fireEvent.mouseLeave(target);
      }
      await scrollAndSettle();
      expect(loaded(), 'GSAP was fetched for a visitor whose hovers cannot use it').toHaveLength(0);

      // The control: armed on purpose, the same scroll does bring GSAP in, so the check above could
      // have failed.
      preloadGsap();
      await scrollAndSettle();
      await vi.waitFor(() => expect(loaded()).toHaveLength(1), { timeout: LOAD_TIMEOUT_MS });
    },
    LOAD_TIMEOUT_MS + 5_000,
  );
});
