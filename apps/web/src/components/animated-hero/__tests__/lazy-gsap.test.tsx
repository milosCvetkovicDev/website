import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap, ScrollTrigger } from '../gsap-runtime';
import { loadGsap, NO_IDLE_CALLBACK_DELAY_MS } from '../load-gsap';
import { DiscoveryPhase } from '../discovery-phase';
import { StrategyPhase } from '../strategy-phase';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { LoopPhase } from '../loop-phase';
import { GameComplete } from '../game-complete';
import { AnimatedText } from '../animated-text';

/**
 * The story between hydration and GSAP's arrival.
 *
 * The phases and the hover effects no longer import GSAP; they ask `load-gsap.ts`, which fetches it
 * once the browser is idle. Until then a phase must build nothing and keep its server-rendered
 * state, a phase that unmounts must never build, and a hover that is still there when GSAP arrives
 * must play then, in the order the events came. A hover whose pointer has already left, or whose
 * component has gone, must not play at all. The first part is what a visitor who hovers before GSAP
 * arrives, and keeps the pointer there, sees; the e2e specs that measure a hover (R17, R19) wait for
 * GSAP with expectGsapLoaded instead, so they never depend on it.
 *
 * The loader holds one load per page in module state, so this file can only be "before the load"
 * once: it is one walk through that window rather than a test per step. The other hero test files
 * wait for the load up front and test what each phase does with GSAP; a load that fails is
 * `lazy-gsap-failure.test.tsx`'s subject.
 */

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-runtime registers it at
// import time, so the stub must exist before the imports above are evaluated. Motion is allowed
// throughout: under `reduce` the phases never ask for GSAP at all.
vi.hoisted(() => {
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

/** The hover target an `AnimatedText` renders: its tag carries `cursor-pointer`. */
const hoverTarget = (view: ReturnType<typeof render>) => {
  const target = view.container.querySelector<HTMLElement>('[class*="cursor-pointer"]');
  if (!target) throw new Error('AnimatedText rendered no hover target');
  return target;
};

/** The glitch variant's two `aria-hidden` copies, which exist only while it plays. */
const glitchCopies = (target: HTMLElement) => target.querySelectorAll('[aria-hidden="true"]');

describe('before GSAP has loaded', () => {
  beforeEach(() => {
    // jsdom has no requestIdleCallback and its document has loaded, so the loader waits on its
    // timer fallback, as in Safari after the load event, and faking setTimeout is what holds the
    // page in the window before the load.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Drive GSAP by hand, so nothing a queued hover built can finish on its own.
    gsap.ticker.remove(gsap.updateRoot);
    // ScrollTrigger.refresh() restores the scroll position through window.scrollTo, which jsdom
    // does not implement: every call builds an Error and prints it through the virtual console.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    gsap.ticker.add(gsap.updateRoot);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds nothing and plays only the hovers still in place, then builds and replays in order', async () => {
    expect(window.requestIdleCallback).toBeUndefined();
    // GSAP warns about a tween whose target is null, and a hover replayed into an unmounted
    // component would be exactly that: React has already cleared the ref it animates.
    const warn = vi.spyOn(console, 'warn');
    const to = vi.spyOn(gsap, 'to');

    // StrictMode, because development mounts every effect twice: the first build has to be
    // cancelled, not queued behind the second.
    const phases = render(
      <StrictMode>
        <DiscoveryPhase />
        <StrategyPhase />
      </StrictMode>,
    );
    // The four whose cleanups do more than revert a context: Execution's count, the timers of
    // Gauntlet and Loop, the glow of GameComplete. Each is unmounted before GSAP arrives, so each
    // cleanup runs with nothing built yet, and none of them may build afterwards.
    const early = render(
      <StrictMode>
        <ExecutionPhase />
        <GauntletPhase />
        <LoopPhase />
        <GameComplete />
      </StrictMode>,
    );
    const glitch = render(<AnimatedText animation="glitch">PHASE 3</AnimatedText>);
    const leftGlitch = render(<AnimatedText animation="glitch">PHASE 6</AnimatedText>);
    const scramble = render(<AnimatedText animation="scramble">SESSION COMPLETE</AnimatedText>);
    const magnetic = render(<AnimatedText animation="magnetic">Follow along</AnimatedText>);
    const unmounted = render(<AnimatedText animation="glitch">PHASE 9</AnimatedText>);
    const later = render(<AnimatedText animation="glitch">PHASE 4</AnimatedText>);

    // Nothing is built yet, and the sections are exactly as the server rendered them.
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    const [discoverySection, strategySection] = phases.container.querySelectorAll('section');
    expect(phases.container.querySelectorAll('[style*="opacity"]')).toHaveLength(0);

    // A hover that lands before the load and stays: nothing plays yet, and nothing is lost.
    const glitchTarget = hoverTarget(glitch);
    fireEvent.mouseEnter(glitchTarget);
    expect(glitchCopies(glitchTarget)).toHaveLength(0);

    // A hover whose pointer leaves before the load: by the time GSAP arrives nobody is pointing at
    // it, so it must not play then.
    const leftTarget = hoverTarget(leftGlitch);
    fireEvent.mouseEnter(leftTarget);
    fireEvent.mouseLeave(leftTarget);

    // An enter and its leave, both early. The leave replaces the enter, so the scramble never
    // starts after the pointer has gone.
    const scrambleTarget = hoverTarget(scramble);
    fireEvent.mouseEnter(scrambleTarget);
    fireEvent.mouseLeave(scrambleTarget);

    // A burst of pointer moves. jsdom lays nothing out, so the text's box is at the origin and each
    // move aims 15% of its clientX; only the last one may play, aimed from where the box was when
    // it moved, not from where it is once GSAP arrives.
    const magneticTarget = hoverTarget(magnetic);
    const magneticText = magneticTarget.firstElementChild;
    for (const clientX of [100, 200, 300]) fireEvent.mouseMove(magneticTarget, { clientX });
    vi.spyOn(magneticTarget, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 1000, y: 0, width: 0, height: 0 }),
    );

    // A hover whose component is gone before GSAP arrives, and sections that never saw it.
    fireEvent.mouseEnter(hoverTarget(unmounted));
    unmounted.unmount();
    early.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NO_IDLE_CALLBACK_DELAY_MS);
      await loadGsap();
    });

    // One trigger each for the two phases still mounted, on their own sections: StrictMode's
    // discarded first builds never ran, and the four unmounted before the load built nothing.
    const triggers = ScrollTrigger.getAll();
    expect(triggers.map((trigger) => trigger.trigger)).toEqual([discoverySection, strategySection]);

    // The glitch still hovered played once GSAP arrived; the one already left did not.
    expect(glitchCopies(glitchTarget)).toHaveLength(2);
    expect(gsap.getTweensOf(glitchTarget).length).toBeGreaterThan(0);
    expect(glitchCopies(leftTarget)).toHaveLength(0);
    expect(gsap.getTweensOf(leftTarget)).toHaveLength(0);

    // The scramble is not running and stays that way.
    act(() => gsap.updateRoot(gsap.globalTimeline.time() + 0.2));
    expect(scrambleTarget).toHaveTextContent(/^SESSION COMPLETE$/);

    // One tween for the three moves, aimed from the box as it was: 300 * 0.15.
    const magneticTweens = to.mock.calls.filter(([target]) => target === magneticText);
    expect(magneticTweens).toHaveLength(1);
    expect(magneticTweens[0][1]).toMatchObject({ x: 45, y: 0 });

    // The unmounted glitch never ran: its tween would have targeted the ref React had cleared.
    expect(warn).not.toHaveBeenCalled();

    // From here a hover plays synchronously, as it did with the static import: no waiting.
    const laterTarget = hoverTarget(later);
    act(() => {
      fireEvent.mouseEnter(laterTarget);
    });
    expect(glitchCopies(laterTarget)).toHaveLength(2);

    phases.unmount();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });
});
