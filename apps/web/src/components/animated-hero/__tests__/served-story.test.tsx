import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GSAP_LOADED_MARK } from '../load-gsap';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { LoopPhase } from '../loop-phase';

/**
 * What the three sequenced phases serve, and what they turn into once hydrated (hero-11).
 *
 * Gauntlet and Loop hide their closing headline and toast until the sequence GSAP runs reveals
 * them, and Execution hides every line of its code sample until its count writes them in. A reader
 * without JavaScript, a crawler, reader mode and print get the served HTML and nothing after it, so
 * that hidden starting state is applied only after hydration: the server renders all of it at full
 * opacity, and the client hides it before GSAP can have arrived to reveal it. The first client
 * render has to match the server's, or React reports a hydration mismatch.
 * `e2e/served-html.spec.ts` (row R16) measures the same thing in a browser with JavaScript off.
 */

const story = () => (
  <>
    <ExecutionPhase />
    <GauntletPhase />
    <LoopPhase />
  </>
);

/** The four blocks a GSAP sequence reveals, by a line of the text inside each. */
const GATED_BLOCKS = [
  'It worked on my machine',
  'Achievement Unlocked',
  'This happened at 3:14am',
  'SELF-HEALING PROTOCOL ACTIVE',
];

/** The wrapper that carries a reveal's `opacity-0`: the innermost one around the text. */
function revealContainer(root: ParentNode, text: string) {
  const containers = [...root.querySelectorAll('div.mt-6, div.mt-16')].filter((div) =>
    div.textContent?.includes(text),
  );
  const container = containers.at(-1);
  if (!container) throw new Error(`no reveal container around "${text}"`);
  return container;
}

/**
 * The served HTML, moved into this document as a browser would have it. A DOMParser document has no
 * window, and jest-dom checks an element against its document's window, so the nodes are adopted.
 */
function serve() {
  const host = document.createElement('div');
  host.append(
    ...new DOMParser().parseFromString(renderToString(story()), 'text/html').body.childNodes,
  );
  document.body.append(host);
  return host;
}

/** The code sample's lines, as `served-html.spec.ts` reads them. */
const codeSpans = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('pre code > span')];

describe('the served story', () => {
  beforeEach(() => {
    // usePrefersReducedMotion reads matchMedia once hydrated. Motion is allowed: under `reduce`
    // every phase renders its finished state, visible on both sides, which would prove nothing.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('renders every gated block and every line of code at full opacity', () => {
    const served = serve();

    for (const text of GATED_BLOCKS) {
      expect(revealContainer(served, text), text).not.toHaveClass('opacity-0');
    }
    const spans = codeSpans(served);
    expect(spans).toHaveLength(22);
    for (const span of spans) expect(span.style.opacity).toBe('1');

    // The caret pulses its opacity for ever, so it is not one of the lines: it sits after the
    // `<code>`, out of the text a reader or an assistive technology gets.
    const caret = served.querySelector('pre > span');
    expect(caret).toHaveAttribute('aria-hidden', 'true');
    expect(caret).toBeEmptyDOMElement();
  });

  it('hides them once hydrated, before GSAP has loaded, without a mismatch', async () => {
    const host = serve();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recoverable = vi.fn();

    const root = await act(async () =>
      hydrateRoot(host, story(), { onRecoverableError: recoverable }),
    );

    try {
      expect(recoverable).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      // Nobody has scrolled, so GSAP has not arrived and no reveal can have run: this is the
      // starting state each sequence reveals from.
      expect(performance.getEntriesByName(GSAP_LOADED_MARK, 'mark')).toHaveLength(0);
      for (const text of GATED_BLOCKS) {
        expect(revealContainer(host, text), text).toHaveClass('opacity-0');
      }
      const spans = codeSpans(host);
      expect(spans).toHaveLength(22);
      for (const span of spans) expect(span.style.opacity).toBe('0');
    } finally {
      act(() => root.unmount());
    }
  });
});
