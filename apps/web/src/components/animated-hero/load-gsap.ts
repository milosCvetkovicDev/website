import type * as GsapRuntimeModule from './gsap-runtime';

/**
 * GSAP, loaded on the visitor's first intent instead of in the home page's initial chunk.
 *
 * GSAP and ScrollTrigger are about 45 KB gzip, and every story phase used to import them at module
 * scope, so they shipped in the chunk the served HTML loads and evaluated during load. The phases
 * stay statically imported and server-rendered (ADR 0009, rule 4); only GSAP waits. It is fetched
 * once, on the visitor's first scroll, wheel, touch, pointer press or key press, or at once when
 * the page is already scrolled when the story asks for it (a restored position, a deep link, a
 * soft navigation back), and every caller on the page shares that one request. An event handler
 * that asks for GSAP, such as a hover, is intent as well (`requestGsap`). Until then every section
 * shows what the server rendered, and a visitor who never interacts never downloads GSAP.
 *
 * Not at idle, as before, and not on a timer or when the first phase nears the viewport: each of
 * those fetches GSAP, and builds every timeline, inside the window Lighthouse measures blocking
 * time in, and the first phase starts 73 px below the fold on a 412x823 phone, so any observer
 * margin fires at load. ADR 0023 records the decision.
 *
 * Only this module may reach `./gsap-runtime`, and only through `import()`: a static import from
 * anywhere in the home page's client graph puts GSAP back into the initial chunk. Everything else
 * uses the runtime handed out here, or `import type`. `apps/web/eslint.config.mjs` enforces it.
 *
 * A load that fails, or does not finish within `LOAD_TIMEOUT_MS`, is final for the page: the
 * phases that wait with an `onUnavailable` render their finished state instead, as they do under
 * reduced motion, and nothing retries. Turbopack's chunk loader already retries a network error
 * once before it gives up, and a chunk that fails twice (a deploy that removed it, a blocked
 * request) would only fail again.
 */
export type GsapRuntime = typeof GsapRuntimeModule;
export type Gsap = GsapRuntime['gsap'];

/**
 * The User Timing mark set once GSAP has loaded and every callback that was waiting for it has run.
 * `e2e/support/gsap.ts` waits on it: the story's from-states and any hover that landed before the
 * load only exist from this point on.
 */
export const GSAP_LOADED_MARK = 'gsap-loaded';

/** The mark set instead when the load has failed for good, before the phases fall back. */
export const GSAP_FAILED_MARK = 'gsap-load-failed';

/**
 * The events on `window` that count as the visitor's first intent to go further than the first
 * screen. Listened for in the capture phase, passively, and all removed after the first one.
 */
export const INTENT_EVENTS = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * How long the chunk may take once it has been requested. A request that stalls instead of failing
 * would otherwise leave the story waiting for good. 44 KB gzip takes about two seconds on a slow 3G
 * connection, so this only ends a load that is not going to finish.
 */
export const LOAD_TIMEOUT_MS = 15_000;

type Waiting = { run: (runtime: GsapRuntime) => void; unavailable?: () => void };

const noop = () => {};

let runtime: GsapRuntime | undefined;
let failed = false;
let loading: Promise<GsapRuntime> | undefined;
/** Callbacks waiting for the load, in the order they asked. Cancelling one deletes it. */
const waiting = new Set<Waiting>();

const INTENT_LISTENER = { capture: true, passive: true } as const;

let intent: Promise<void> | undefined;
/** Set while the intent listeners are armed: resolves `intent` and removes them. */
let intentReached: (() => void) | undefined;

/**
 * Resolves on the visitor's first intent, and is memoised: armed once per page. A page that is
 * already scrolled when it is armed has had its intent, so it resolves at once without listening.
 * On the server, where nothing asks for GSAP, it never resolves.
 */
function whenIntent(): Promise<void> {
  intent ??= new Promise<void>((resolve) => {
    if (typeof window === 'undefined') return;
    if (window.scrollY > 0) {
      resolve();
      return;
    }
    const reached = () => {
      for (const type of INTENT_EVENTS) window.removeEventListener(type, reached, INTENT_LISTENER);
      intentReached = undefined;
      resolve();
    };
    intentReached = reached;
    for (const type of INTENT_EVENTS) window.addEventListener(type, reached, INTENT_LISTENER);
  });
  return intent;
}

function importWithDeadline(): Promise<GsapRuntime> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      reject(new Error(`GSAP did not load within ${LOAD_TIMEOUT_MS} ms`));
    }, LOAD_TIMEOUT_MS);
    import('./gsap-runtime').then(
      (loaded) => {
        clearTimeout(deadline);
        // The import cannot be abandoned, so a chunk that arrives after the deadline still runs,
        // and registering ScrollTrigger starts its listeners and its 250 ms sync for the rest of
        // the visit. The page already shows the finished story without it: switch them off.
        if (timedOut) loaded.ScrollTrigger.disable();
        else resolve(loaded);
      },
      (error: unknown) => {
        clearTimeout(deadline);
        reject(error);
      },
    );
  });
}

/** The marks are diagnostics: a browser that refuses one must not stop the story. */
function mark(name: string) {
  try {
    globalThis.performance?.mark?.(name);
  } catch {
    // Nothing depends on the mark but the e2e helper.
  }
}

/**
 * Runs a callback so that an exception in it is reported the same way whether GSAP had already
 * loaded or the callback waited for it: as an uncaught error on the page, like one thrown by an
 * event handler, and without stopping the callbacks queued behind it. An animation that throws
 * never takes the page down with it.
 */
function invoke(callback: () => void) {
  try {
    callback();
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

type YieldingScheduler = { yield?: () => Promise<void> };

/** Hands the main thread back to the browser: `scheduler.yield()` where it exists, a task otherwise. */
function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: YieldingScheduler }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Hands GSAP to the callbacks that waited for it, one per task. Each phase builds its timeline in a
 * callback, and building all of them in one go was a single long task, 28 to 38 ms of CPU here and
 * about four times that on a mid-range phone, landing in the visitor's first scroll. Yielding after
 * each lets the browser handle input and paint in between.
 *
 * `runtime` stays unset until the queue is empty, so a callback passed meanwhile joins the end of
 * the queue instead of running ahead of the ones before it, and one cancelled meanwhile never runs.
 * The loaded mark, and the load's own promise, follow the last callback.
 */
async function arrived(loaded: GsapRuntime): Promise<GsapRuntime> {
  while (waiting.size > 0) {
    // A Set iterates in insertion order: the first entry is the one that has waited longest.
    const [entry] = waiting;
    waiting.delete(entry);
    invoke(() => entry.run(loaded));
    await yieldToBrowser();
  }
  runtime = loaded;
  mark(GSAP_LOADED_MARK);
  return loaded;
}

function gaveUp(error: unknown): never {
  failed = true;
  mark(GSAP_FAILED_MARK);
  console.warn('GSAP could not be loaded, so the story is shown without its animation.', error);
  for (const entry of waiting) {
    waiting.delete(entry);
    if (entry.unavailable) invoke(entry.unavailable);
  }
  throw error;
}

/**
 * GSAP and ScrollTrigger (registered), fetched on the visitor's first intent. Memoised: every call
 * returns the same promise, so the whole page makes one request, and it rejects for good when that
 * request fails or stalls.
 */
export function loadGsap(): Promise<GsapRuntime> {
  loading ??= whenIntent().then(importWithDeadline).then(arrived, gaveUp);
  return loading;
}

/**
 * Arms the load without waiting for it: GSAP is fetched on the first intent. A failure is reported
 * by the loader itself.
 */
export function preloadGsap(): void {
  loadGsap().catch(noop);
}

/**
 * Starts the load now, as intent. For an event handler that wants GSAP: a hover is the visitor's
 * intent as much as a scroll is. Returns the load's promise, which a caller may ignore (a failure
 * is reported by the loader and the promise is already handled) or await, as the tests that need
 * GSAP before they start do.
 */
export function requestGsap(): Promise<GsapRuntime> {
  const loaded = loadGsap();
  loaded.catch(noop);
  intentReached?.();
  return loaded;
}

/**
 * Runs `run` with GSAP: synchronously once it has loaded and the callbacks that waited for it have
 * run, which is exactly what the static import used to do, and otherwise once it has arrived, in
 * the order the callbacks were passed in, one per task. A callback passed while that queue drains
 * joins its end. When the load fails for good, `run` never runs and `onUnavailable` does instead,
 * asynchronously; a phase passes one to render its finished state.
 *
 * Returns a function that stops a callback which has not run yet from ever running, and releases
 * it; it does nothing afterwards.
 *
 * A callback that builds on a component's DOM reads its refs once, returns when they are already
 * null, and scopes its `gsap.context` to the element, never to the ref. A soft navigation that
 * removes the component nulls its refs in that commit, but the effect cleanup that cancels or
 * reverts the build runs in a later task: a navigation is a transition, and React yields to the
 * browser before it runs a transition's passive effects. GSAP's arrival, a GSAP tick or a timer
 * can land in between. A build that lands there finds no element. And GSAP resolves targets
 * through a context's scope whenever it runs work the context owns, whether or not the context is
 * current: every refresh of a ScrollTrigger created in it (the deferred first refresh of a
 * timeline's trigger, one a resize starts) and its trigger callbacks. A null ref logs "Invalid
 * scope", while an element still answers after it has left the page. A timer that reads refs when
 * it fires checks for them the same way.
 */
export function runWithGsap(
  run: (runtime: GsapRuntime) => void,
  onUnavailable?: () => void,
): () => void {
  if (runtime) {
    const loaded = runtime;
    invoke(() => run(loaded));
    return noop;
  }
  if (failed) {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && onUnavailable) invoke(onUnavailable);
    });
    return () => {
      cancelled = true;
    };
  }
  const entry: Waiting = { run, unavailable: onUnavailable };
  waiting.add(entry);
  // Starts the load if nothing has yet. The one handler that attaches covers every later waiter,
  // so a burst of events adds nothing to the pending promise.
  if (!loading) preloadGsap();
  return () => {
    waiting.delete(entry);
  };
}

/**
 * Whether `section`'s content is on screen, or already scrolled past, when its timeline is built.
 * The page starts at the top with the hero filling the viewport, so a phase that is built later
 * than hydration, because GSAP arrived after the visitor had scrolled, or on a soft navigation back
 * that restored the scroll position, can find its section already in view. Such a phase finishes
 * its entrance at once instead of hiding what the visitor is reading behind its from-state and
 * playing it again: the entrance is for arriving at the section, and the visitor has arrived.
 *
 * Measured at the section's first child, where its content starts, not at its own box: every phase
 * section is `min-h-screen` with `py-16`, and `py-24` from `sm`, and centred content, so its top
 * edge is 64 px (96 px from `sm`) or more of empty padding, and one wheel notch past the hero would
 * otherwise count as arriving and skip an entrance nobody had seen.
 */
export function isAlreadyReached(section: Element | null): boolean {
  if (!section || window.scrollY <= 0) return false;
  const content = section.firstElementChild ?? section;
  return content.getBoundingClientRect().top < window.innerHeight;
}
