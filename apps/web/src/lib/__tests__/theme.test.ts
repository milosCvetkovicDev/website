import { createContext, runInContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DARK_COLOR_SCHEME_QUERY, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '../theme';

/**
 * The pre-paint init script's branches.
 *
 * `e2e/theme.spec.ts` proves the outcome in a real browser for the two cases a browser can reach. The
 * two it cannot are here: storage that *throws* (private mode, site data disabled, quota exceeded) and
 * a `matchMedia` that throws or is missing, which a few embedded browsers still manage. Both are
 * guarded in the script and neither guard had a test, so either could have been deleted and nothing
 * would have failed — the visible symptom is a flash of the wrong theme on someone else's machine.
 *
 * The script ships as a string, so it has to be evaluated to be tested at all, and it is evaluated in
 * a `node:vm` context whose only globals are the three things it touches: `localStorage`, `matchMedia`
 * and `document`. That is what makes the branches reachable. Two approaches that look simpler do not
 * work here and are worth naming so they are not tried again:
 *
 * - Appending it as an inline `<script>`, the way `app/layout.tsx` does, runs it in jsdom's own window
 *   realm. That realm is not the one this file's `window` and `vi.stubGlobal` write to, so the script
 *   reads the real `localStorage` (empty) and the real `matchMedia` (always `matches: false`) and
 *   every case collapses to `light` — five of these tests pass and the rest fail, for no reason to do
 *   with the script.
 * - `vi.stubGlobal` alone has the same problem from the other end: it replaces Vitest's global, which
 *   nothing the script can see reads.
 *
 * The `document` handed to the context is the real jsdom one, so the assertions are about the class
 * actually landing on a real `<html>` element rather than on a mock that records calls.
 */

/** Runs the shipped init-script string against exactly the globals it is allowed to see. */
function runWith(globals: { localStorage?: unknown; matchMedia?: unknown }) {
  runInContext(THEME_INIT_SCRIPT, createContext({ document, ...globals }));
}

const classes = () => [...document.documentElement.classList];

beforeEach(() => {
  document.documentElement.className = '';
});

afterEach(() => {
  document.documentElement.className = '';
});

/** A `localStorage` whose `getItem` returns this value. */
const storageReturning = (value: string | null) => ({ getItem: () => value });
/** A `localStorage` whose `getItem` throws, as a blocked store does. */
const storageThrowing = () => ({
  getItem: () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  },
});
/** A `matchMedia` answering `matches` for every query. */
const mediaMatching = (matches: boolean) => () => ({ matches });

describe('THEME_INIT_SCRIPT', () => {
  it('takes a stored dark choice over a light OS preference', () => {
    runWith({ localStorage: storageReturning('dark'), matchMedia: mediaMatching(false) });

    expect(classes()).toEqual(['dark']);
  });

  it('takes a stored light choice over a dark OS preference', () => {
    runWith({ localStorage: storageReturning('light'), matchMedia: mediaMatching(true) });

    expect(classes()).toEqual(['light']);
  });

  it('reads the stored value under the key the provider writes', () => {
    // A key that drifted from THEME_STORAGE_KEY would leave the script reading nothing and following
    // the OS on every load, with no error anywhere: the flash would just be back.
    const getItem = vi.fn(() => 'light');
    runWith({ localStorage: { getItem }, matchMedia: mediaMatching(true) });

    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });

  it.each([
    ['dark', true],
    ['light', false],
  ])('with nothing stored, follows the OS preference (%s)', (expected, matches) => {
    const matchMedia = vi.fn(() => ({ matches }));
    runWith({ localStorage: storageReturning(null), matchMedia });

    expect(classes()).toEqual([expected]);
    expect(matchMedia).toHaveBeenCalledWith(DARK_COLOR_SCHEME_QUERY);
  });

  it.each(['', 'DARK', 'system', 'null', 'true'])(
    'treats the unrecognised stored value %j as nothing stored',
    (stored) => {
      // The script's test is `s === 'dark' || (s !== 'light' && prefersDark)`, so anything else has to
      // fall through to the OS rather than land on a hard-coded default.
      runWith({ localStorage: storageReturning(stored), matchMedia: mediaMatching(true) });

      expect(classes()).toEqual(['dark']);
    },
  );

  it('falls back to the OS preference when storage throws', () => {
    runWith({ localStorage: storageThrowing(), matchMedia: mediaMatching(true) });

    expect(classes()).toEqual(['dark']);
  });

  it('still picks a theme when storage throws and the OS prefers light', () => {
    runWith({ localStorage: storageThrowing(), matchMedia: mediaMatching(false) });

    // The class is never left off: an unclassed <html> resolves the light tokens while the provider
    // believes the server default of dark, which is the mismatch the script exists to prevent.
    expect(classes()).toEqual(['light']);
  });

  it('falls back to light when matchMedia throws', () => {
    runWith({
      localStorage: storageReturning(null),
      matchMedia: () => {
        throw new TypeError('matchMedia is not supported');
      },
    });

    expect(classes()).toEqual(['light']);
  });

  it('falls back to light when matchMedia is missing entirely', () => {
    // A few embedded browsers have no matchMedia at all, which is a ReferenceError rather than a
    // throwing call: the same `catch` has to cover it.
    runWith({ localStorage: storageReturning(null) });

    expect(classes()).toEqual(['light']);
  });

  it('falls back to light when both storage and matchMedia throw', () => {
    runWith({
      localStorage: storageThrowing(),
      matchMedia: () => {
        throw new Error('unsupported');
      },
    });

    expect(classes()).toEqual(['light']);
  });

  it('never leaves <html> unclassed, whatever fails', () => {
    // The summary of all of the above, and the property that actually matters: the provider's server
    // snapshot is `dark`, so an unclassed <html> resolving the light tokens is the mismatch the
    // script exists to prevent. Nothing available: no storage, no matchMedia.
    runWith({});

    expect(classes()).toHaveLength(1);
    expect(classes()[0]).toMatch(/^(light|dark)$/);
  });

  it('adds exactly one class and leaves an existing one alone', () => {
    // It runs in <head> before the body exists, but `<html>` may carry a class already: the script
    // must add, not replace.
    document.documentElement.className = 'js-enabled';

    runWith({ localStorage: storageReturning('dark'), matchMedia: mediaMatching(false) });

    expect(classes()).toEqual(['js-enabled', 'dark']);
  });
});
