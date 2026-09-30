import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestGsap, type GsapRuntime } from '../load-gsap';
import { codeLines, ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { LoopPhase } from '../loop-phase';

/**
 * What the three sequenced phases serve, and when they hide it for a reveal (hero-11).
 *
 * Gauntlet and Loop reveal their closing headline and toast at the end of a sequence GSAP runs,
 * and Execution types every line of its code sample in with its count. A reader without JavaScript
 * gets the served HTML and nothing after it, and so does a page GSAP never reaches (it loads on the
 * visitor's first intent), so the served blocks are at full opacity and stay so through hydration.
 * Only a GSAP build that finds a section still below the viewport hides them, where nobody sees the
 * hide; a section already in view when GSAP builds, as after a reload in the middle of the story,
 * keeps them through its whole sequence. `e2e/served-html.spec.ts` (row R16) measures the served
 * page in a browser with JavaScript off, and `e2e/gsap-lazy.spec.ts` the reload.
 */

// Whether load-gsap.ts has imported the GSAP runtime, which is how "GSAP has not arrived" is proven
// rather than inferred from a User Timing mark. The real module is still what it gets. A counter, not
// a vi.fn(): the afterEach restore would wipe a mock's calls between the import and the check.
const runtime = vi.hoisted(() => ({ imports: 0 }));
vi.mock('../gsap-runtime', async (importOriginal) => {
  runtime.imports += 1;
  return importOriginal();
});

// usePrefersReducedMotion reads matchMedia once hydrated, and GSAP's ScrollTrigger calls it while it
// registers at import, so the stub exists before anything is imported, for the file's lifetime, as in
// gauntlet-phase.test.tsx. `reduce` is reset before every test.
const media = vi.hoisted(() => {
  const state = { reduce: false };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query === '(prefers-reduced-motion: reduce)' && state.reduce;
      },
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }),
  });
  return state;
});

// ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom does not
// implement: every call would build an Error and print it through the virtual console.
vi.hoisted(() => {
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

const story = () => (
  <>
    <ExecutionPhase />
    <GauntletPhase />
    <LoopPhase />
  </>
);

/** The four blocks a GSAP sequence reveals: each phase marks them with `data-reveal`. */
const revealBlocks = (root: ParentNode) => [...root.querySelectorAll('[data-reveal]')];

/** The code sample's lines, as `served-html.spec.ts` reads them. */
const codeSpans = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('pre code > span')];

/** Fails naming every block or line that is hidden, rather than on the first. */
function expectAllShown(root: ParentNode) {
  const blocks = revealBlocks(root);
  expect(blocks).toHaveLength(4);
  expect(
    blocks.filter((block) => block.classList.contains('opacity-0')).map((b) => b.textContent),
  ).toEqual([]);
  const spans = codeSpans(root);
  expect(spans).toHaveLength(codeLines.length);
  expect(
    spans.filter((span) => span.style.opacity !== '1').map((span) => span.textContent),
  ).toEqual([]);
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

const roots: Root[] = [];

/** Serves the story, then hydrates it, recording anything React reports about the hydration. */
async function hydrate() {
  const host = serve();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverable = vi.fn();
  const root = await act(async () =>
    hydrateRoot(host, story(), { onRecoverableError: recoverable }),
  );
  roots.push(root);
  return { host, consoleError, recoverable };
}

/** Puts the page `y` pixels down; jsdom lays nothing out, so every section then counts as reached. */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y });
}

beforeEach(() => {
  media.reduce = false;
});

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  scrollTo(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the served story, before GSAP', () => {
  it('renders every gated block and every line of code at full opacity', () => {
    const served = serve();

    expectAllShown(served);
    // The caret pulses its opacity for ever, so it is not one of the lines: it sits after the
    // `<code>`, out of the text a reader or an assistive technology gets.
    const caret = served.querySelector('pre > span');
    expect(caret).toHaveAttribute('aria-hidden', 'true');
    expect(caret).toBeEmptyDOMElement();
  });

  it('keeps them shown once hydrated, with no mismatch, while GSAP has not been asked for', async () => {
    const { host, consoleError, recoverable } = await hydrate();

    expect(recoverable.mock.calls).toEqual([]);
    expect(consoleError.mock.calls).toEqual([]);
    expect(runtime.imports).toBe(0);
    expectAllShown(host);
  });

  it('hydrates under reduced motion with no mismatch, everything shown', async () => {
    // The server snapshot of the preference is `no-preference`, so this hydration flips `finished`.
    media.reduce = true;
    const { host, consoleError, recoverable } = await hydrate();

    expect(recoverable.mock.calls).toEqual([]);
    expect(consoleError.mock.calls).toEqual([]);
    expectAllShown(host);
  });
});

describe('once GSAP builds', () => {
  let gsapRuntime: GsapRuntime;

  // Requested outright and waited for with real timers: from then on each phase builds on mount.
  beforeAll(async () => {
    gsapRuntime = await requestGsap();
  });

  // Both mount three phases that build every timeline, and each tween reads its start value through
  // jsdom's getComputedStyle (unit-tests.md): about a second alone, three under a loaded machine.
  const BUILD_TIMEOUT_MS = 15_000;

  it(
    'hides them for the reveal while the story is still below the viewport',
    async () => {
      const { host, consoleError } = await hydrate();

      expect(runtime.imports).toBe(1);
      expect(consoleError.mock.calls).toEqual([]);
      for (const block of revealBlocks(host)) expect(block).toHaveClass('opacity-0');
      const spans = codeSpans(host);
      expect(spans).toHaveLength(codeLines.length);
      for (const span of spans) expect(span.style.opacity).toBe('0');
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    'keeps what a visitor already sees in view through every sequence',
    async () => {
      const { gsap, ScrollTrigger } = gsapRuntime;
      scrollTo(400);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      // Drive GSAP by hand rather than from requestAnimationFrame, so every tween is deterministic.
      gsap.ticker.remove(gsap.updateRoot);
      try {
        const { host } = await hydrate();
        expectAllShown(host);

        // Every trigger fires: the section is past its start, as it is after a reload down the page.
        act(() => ScrollTrigger.refresh());
        // Eight seconds in half-second steps, longer than the longest sequence (the Gauntlet's), with
        // the check after every step: a hide and a reveal inside the run would pass a check at the end.
        for (let step = 0; step < 16; step += 1) {
          act(() => {
            vi.advanceTimersByTime(500);
            gsap.updateRoot(gsap.globalTimeline.time() + 0.5);
          });
          expectAllShown(host);
        }

        // And the sequences did run, so the checks above were made while they played.
        expect(host).toHaveTextContent('DEPLOYMENT SUCCESSFUL');
        expect(host).toHaveTextContent('RESOLVED');
        expect(host).toHaveTextContent('00:14:32');
      } finally {
        gsap.ticker.add(gsap.updateRoot);
      }
    },
    BUILD_TIMEOUT_MS,
  );
});
