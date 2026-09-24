/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The lazy GSAP loader: one fetch for the whole page, started on the visitor's first intent,
 * callers served in the order they asked, and a failure that is final and says so. Its state is
 * module-level (one load per page), so every test imports a fresh copy. GSAP itself is replaced by
 * a stand-in whose factory counts evaluations, which is the number of times the page would fetch
 * and run the chunk.
 */

const runtime = {
  evaluations: 0,
  fail: false,
  stall: false,
  /** When set, the chunk arrives only once this settles: a request slower than the deadline. */
  late: undefined as Promise<void> | undefined,
  /** How many times ScrollTrigger was switched off again. */
  disabled: 0,
};

/** Stands in for gsap-runtime.ts. Vitest runs it each time the module is actually imported. */
function gsapRuntimeStandIn() {
  runtime.evaluations += 1;
  if (runtime.fail) throw new Error('the GSAP chunk failed to load');
  // A request that neither arrives nor fails.
  if (runtime.stall) return new Promise<never>(() => {});
  const loaded = {
    gsap: { stand: 'gsap' },
    ScrollTrigger: { stand: 'ScrollTrigger', disable: () => (runtime.disabled += 1) },
  };
  return runtime.late ? runtime.late.then(() => loaded) : loaded;
}

/**
 * A fresh copy of the loader and of the module it loads, as a new page would have. `vi.doMock`
 * rather than a hoisted `vi.mock`: Vitest keeps a hoisted factory's result across `resetModules`,
 * and the count above has to see every import.
 */
async function freshLoader() {
  vi.resetModules();
  vi.doMock('../gsap-runtime', gsapRuntimeStandIn);
  return import('../load-gsap');
}

/**
 * Waits until every dynamic import in flight has finished, on real timers even while the test
 * fakes them, so that "nothing was imported" is checked after an eager import would have landed
 * rather than a few microtasks into it.
 */
async function settle() {
  await vi.dynamicImportSettled();
}

/** What counts as intent, pinned here as well as read from the loader. */
const INTENT = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];

/**
 * A page for the node environment: `window` as an event target, scrolled to `scrollY`, whose
 * listeners the test can count. `intend(type)` is the visitor's first scroll, wheel, touch, press or
 * key.
 */
function stubPage(scrollY = 0) {
  const page = Object.assign(new EventTarget(), { scrollY });
  const added = vi.spyOn(page, 'addEventListener');
  const removed = vi.spyOn(page, 'removeEventListener');
  vi.stubGlobal('window', page);
  return { added, removed, intend: (type = 'scroll') => page.dispatchEvent(new Event(type)) };
}

/** Every callback handed to queueMicrotask, kept instead of run: how the loader reports errors. */
function captureMicrotasks() {
  const queued: (() => void)[] = [];
  vi.stubGlobal('queueMicrotask', (callback: () => void) => queued.push(callback));
  return queued;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  runtime.evaluations = 0;
  runtime.fail = false;
  runtime.stall = false;
  runtime.late = undefined;
  runtime.disabled = 0;
  performance.clearMarks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadGsap', () => {
  it('fetches GSAP once for every caller, and only on the first intent however long that takes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { added, intend } = stubPage();
    const { loadGsap, INTENT_EVENTS } = await freshLoader();
    expect([...INTENT_EVENTS]).toEqual(INTENT);

    const calls = [loadGsap(), loadGsap(), loadGsap()];
    let loaded = false;
    void calls[0].then(() => {
      loaded = true;
    });

    // One shared promise and one set of listeners, however many phases and handlers ask.
    expect(calls[1]).toBe(calls[0]);
    expect(calls[2]).toBe(calls[0]);
    expect(added.mock.calls.map(([type]) => type)).toEqual(INTENT);
    for (const [, , options] of added.mock.calls) {
      expect(options).toEqual({ capture: true, passive: true });
    }

    // Nothing is fetched while the visitor only reads, not even ten seconds later.
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(runtime.evaluations).toBe(0);
    expect(loaded).toBe(false);

    intend();
    const [first, ...rest] = await Promise.all(calls);
    expect(runtime.evaluations).toBe(1);
    expect(loaded).toBe(true);
    for (const other of rest) expect(other).toBe(first);

    // Asking again after the load neither arms nor fetches anything more.
    expect(await loadGsap()).toBe(first);
    expect(added).toHaveBeenCalledTimes(INTENT.length);
    expect(runtime.evaluations).toBe(1);
  });

  it.each(INTENT)('starts the fetch on a %s, once', async (type) => {
    const { intend } = stubPage();
    const { loadGsap } = await freshLoader();

    const loading = loadGsap();
    intend(type);
    // The other four arrive too, as they would once the visitor is moving: nothing more happens.
    for (const other of INTENT) intend(other);
    await loading;
    await settle();
    expect(runtime.evaluations).toBe(1);
  });

  it('removes every listener at the first intent', async () => {
    const { added, removed, intend } = stubPage();
    const { loadGsap } = await freshLoader();

    const loading = loadGsap();
    intend('keydown');
    await loading;
    // The same five, the same handler and the same capture flag that added them.
    expect(removed.mock.calls).toEqual(added.mock.calls);
  });

  it('starts at once, and listens for nothing, when the page is already scrolled', async () => {
    // A restored scroll position, a deep link or a soft navigation back: the visitor has moved.
    const { added } = stubPage(1200);
    const { loadGsap } = await freshLoader();

    await loadGsap();
    expect(runtime.evaluations).toBe(1);
    expect(added).not.toHaveBeenCalled();
  });

  it('starts at once when an event handler requests it, and stops listening', async () => {
    const { added, removed } = stubPage();
    const { loadGsap, requestGsap } = await freshLoader();

    // The story armed the wait at hydration; a hover then asks for GSAP.
    const armed = loadGsap();
    const requested = requestGsap();
    expect(requested).toBe(armed);
    await requested;
    expect(runtime.evaluations).toBe(1);
    expect(removed.mock.calls).toEqual(added.mock.calls);
  });

  it('requests on its own too, with nothing armed before it', async () => {
    const { added } = stubPage();
    const { requestGsap } = await freshLoader();

    await requestGsap();
    expect(runtime.evaluations).toBe(1);
    // It armed the listeners and took them down again at once.
    expect(added).toHaveBeenCalledTimes(INTENT.length);
  });

  it('never starts on the server, where there is no visitor', async () => {
    expect(globalThis.window).toBeUndefined();
    const { loadGsap } = await freshLoader();

    void loadGsap();
    await settle();
    expect(runtime.evaluations).toBe(0);
  });

  it('marks the moment GSAP arrived, once, for e2e/support/gsap.ts to wait on', async () => {
    const { intend } = stubPage();
    const { loadGsap, GSAP_LOADED_MARK, GSAP_FAILED_MARK } = await freshLoader();

    void loadGsap();
    await settle();
    expect(performance.getEntriesByName(GSAP_LOADED_MARK, 'mark')).toHaveLength(0);

    intend();
    await loadGsap();
    await loadGsap();
    expect(performance.getEntriesByName(GSAP_LOADED_MARK, 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName(GSAP_FAILED_MARK, 'mark')).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('carries on when the browser refuses the mark', async () => {
    const { intend } = stubPage();
    const { loadGsap, runWithGsap } = await freshLoader();
    vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new Error('no marks here');
    });

    const ran = vi.fn();
    runWithGsap(ran);
    intend();
    await expect(loadGsap()).resolves.toMatchObject({ gsap: { stand: 'gsap' } });
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('treats a failed load as final: one request, a mark, one warning, and no retry', async () => {
    const { intend, added } = stubPage();
    const { loadGsap, preloadGsap, GSAP_FAILED_MARK, GSAP_LOADED_MARK } = await freshLoader();

    runtime.fail = true;
    const failed = loadGsap();
    // preloadGsap shares the failing promise and must not leave it unhandled.
    preloadGsap();
    intend();
    // Vitest wraps the stand-in's error in one of its own, so only the rejection is asserted.
    await expect(failed).rejects.toThrow();
    expect(performance.getEntriesByName(GSAP_FAILED_MARK, 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName(GSAP_LOADED_MARK, 'mark')).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/GSAP could not be loaded/);

    // The chunk would load now, but the page has given up: the same rejection, and no new request.
    runtime.fail = false;
    expect(loadGsap()).toBe(failed);
    preloadGsap();
    await settle();
    expect(added).toHaveBeenCalledTimes(INTENT.length);
    expect(runtime.evaluations).toBe(1);
  });

  it('gives up on a request that stalls, after LOAD_TIMEOUT_MS', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { intend } = stubPage();
    const { loadGsap, LOAD_TIMEOUT_MS, GSAP_FAILED_MARK } = await freshLoader();

    runtime.stall = true;
    const loading = loadGsap();
    let settled = false;
    loading.catch(() => {}).finally(() => (settled = true));
    intend();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);
    expect(runtime.evaluations).toBe(1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(loading).rejects.toThrow(`GSAP did not load within ${LOAD_TIMEOUT_MS} ms`);
    expect(performance.getEntriesByName(GSAP_FAILED_MARK, 'mark')).toHaveLength(1);
  });

  it('switches ScrollTrigger off again when the chunk arrives after the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { intend } = stubPage();
    const { loadGsap, runWithGsap, LOAD_TIMEOUT_MS } = await freshLoader();

    let release!: () => void;
    runtime.late = new Promise<void>((resolve) => (release = resolve));
    const run = vi.fn();
    runWithGsap(run);
    const loading = loadGsap();
    loading.catch(() => {});
    intend();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    await expect(loading).rejects.toThrow(`GSAP did not load within ${LOAD_TIMEOUT_MS} ms`);
    expect(runtime.disabled).toBe(0);

    // The request finally completes: the module runs, as a browser would run the chunk, and the
    // loader undoes what registering ScrollTrigger started instead of handing GSAP to anyone.
    release();
    await settle();
    expect(runtime.disabled).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('runWithGsap', () => {
  it('holds callbacks until GSAP arrives, runs them in order, and skips a cancelled one', async () => {
    const { intend } = stubPage();
    const { loadGsap, runWithGsap } = await freshLoader();
    const ran: string[] = [];

    runWithGsap(() => ran.push('enter'));
    const cancel = runWithGsap(() => ran.push('unmounted before the load'));
    runWithGsap(({ gsap }) =>
      ran.push(`leave with ${(gsap as unknown as { stand: string }).stand}`),
    );
    cancel();

    await settle();
    expect(ran).toEqual([]);

    intend();
    await loadGsap();
    // Run by the time the load's own promise resolves: nothing more to wait for.
    expect(ran).toEqual(['enter', 'leave with gsap']);
  });

  it('runs synchronously once GSAP has loaded, as the static import did', async () => {
    const { intend } = stubPage();
    const { loadGsap, runWithGsap } = await freshLoader();
    const loading = loadGsap();
    intend();
    await loading;

    const ran: string[] = [];
    const cancel = runWithGsap(() => ran.push('built'));
    // No await: the timeline exists by the time runWithGsap returns.
    expect(ran).toEqual(['built']);
    // Cancelling after the fact is harmless; undoing the work is the caller's cleanup.
    cancel();
    expect(ran).toEqual(['built']);
  });

  it('when the load fails, runs onUnavailable instead, asynchronously, unless cancelled', async () => {
    const { intend } = stubPage();
    const { loadGsap, runWithGsap } = await freshLoader();
    runtime.fail = true;

    const build = vi.fn();
    const fallBack = vi.fn();
    const cancelledFallBack = vi.fn();
    runWithGsap(build, fallBack);
    runWithGsap(build, cancelledFallBack)();
    // A hover handler passes no fallback: its callback is simply dropped.
    runWithGsap(build);
    intend();
    await expect(loadGsap()).rejects.toThrow();

    expect(build).not.toHaveBeenCalled();
    expect(fallBack).toHaveBeenCalledTimes(1);
    expect(cancelledFallBack).not.toHaveBeenCalled();

    // A phase that mounts after the failure (a soft navigation back to `/`) is told as well, but
    // never during its own effect: the fallback sets state.
    const late = vi.fn();
    const lateCancelled = vi.fn();
    runWithGsap(build, late);
    runWithGsap(build, lateCancelled)();
    expect(late).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(late).toHaveBeenCalledTimes(1);
    expect(lateCancelled).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });

  it('reports an exception the same way before and after the load, and runs the rest', async () => {
    const { intend } = stubPage();
    const { loadGsap, runWithGsap } = await freshLoader();
    const reported = captureMicrotasks();
    const early = new Error('a build that throws while waiting');
    const late = new Error('a build that throws once GSAP is in');
    const ran: string[] = [];

    runWithGsap(() => {
      throw early;
    });
    runWithGsap(() => ran.push('queued behind it'));
    intend();
    await loadGsap();
    expect(ran).toEqual(['queued behind it']);

    // Not thrown into the caller, which would be React's effect on one path and a promise nobody
    // handles on the other: rethrown from a microtask, as an uncaught error on the page.
    expect(() =>
      runWithGsap(() => {
        throw late;
      }),
    ).not.toThrow();
    expect(reported).toHaveLength(2);
    expect(reported[0]).toThrow(early);
    expect(reported[1]).toThrow(late);
  });
});

describe('isAlreadyReached', () => {
  /** A section whose box starts at `top` and whose content (its first child) at `contentTop`. */
  const section = (top: number, contentTop = top) =>
    ({
      getBoundingClientRect: () => ({ top }),
      firstElementChild: { getBoundingClientRect: () => ({ top: contentTop }) },
    }) as unknown as Element;

  it('is false at the top of the page, where the hero fills the viewport', async () => {
    vi.stubGlobal('window', { scrollY: 0, innerHeight: 800 });
    const { isAlreadyReached } = await freshLoader();
    expect(isAlreadyReached(section(100))).toBe(false);
    expect(isAlreadyReached(null)).toBe(false);
  });

  it('is true once the visitor has scrolled the section into view or past it', async () => {
    vi.stubGlobal('window', { scrollY: 1200, innerHeight: 800 });
    const { isAlreadyReached } = await freshLoader();
    expect(isAlreadyReached(section(799))).toBe(true);
    expect(isAlreadyReached(section(-3000))).toBe(true);
    expect(isAlreadyReached(section(800))).toBe(false);
    expect(isAlreadyReached(section(2400))).toBe(false);
  });

  it('measures where the content starts, not the empty padding above it', async () => {
    vi.stubGlobal('window', { scrollY: 100, innerHeight: 800 });
    const { isAlreadyReached } = await freshLoader();
    // One wheel notch past the hero: the section's top padding is on screen, its content is not.
    expect(isAlreadyReached(section(765, 861))).toBe(false);
    expect(isAlreadyReached(section(600, 700))).toBe(true);
    // A section with no child element falls back to its own box.
    const bare = { getBoundingClientRect: () => ({ top: 765 }), firstElementChild: null };
    expect(isAlreadyReached(bare as unknown as Element)).toBe(true);
  });
});
