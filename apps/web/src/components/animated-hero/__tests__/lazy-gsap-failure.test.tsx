import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GSAP_FAILED_MARK, loadGsap, NO_IDLE_CALLBACK_DELAY_MS } from '../load-gsap';
import { DiscoveryPhase } from '../discovery-phase';
import { ExecutionPhase } from '../execution-phase';
import { GauntletPhase } from '../gauntlet-phase';
import { LoopPhase } from '../loop-phase';
import { AnimatedText } from '../animated-text';

/**
 * The story when GSAP never arrives: the chunk 404s after a deploy, a blocker refuses it, the
 * network drops it twice.
 *
 * Three phases do not server-render their finished state under `no-preference`: Execution's code
 * and counters start empty, and the headlines and toasts of Gauntlet and Loop start at
 * `opacity-0`, revealed only by the sequences GSAP runs (R16 in `e2e/served-html.spec.ts`). Before
 * GSAP was loaded lazily it could not fail on its own, because it shipped in the chunk that
 * hydrates the page. Now it can, and each of the three must then show what it shows under reduced
 * motion rather than stay empty and invisible for the rest of the visit.
 */

vi.mock('../gsap-runtime', () => {
  throw new Error('the GSAP chunk failed to load');
});

// usePrefersReducedMotion reads matchMedia. Motion is allowed: under `reduce` every phase renders
// its finished state anyway, and the fallback would be invisible.
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

/**
 * The wrapper that carries a reveal's `opacity-0`, found from a heading or a line of text inside
 * it. Headings by their whole text, because the animated ones split it into a span per character.
 */
function revealContainer(text: RegExp) {
  const inside =
    screen.queryAllByRole('heading', { level: 2 }).find((h2) => text.test(h2.textContent ?? '')) ??
    screen.getByText(text);
  const container = inside.closest('div.mt-6, div.mt-16');
  if (!container) throw new Error(`no reveal container around ${text}`);
  return container;
}

describe('when GSAP fails to load', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the finished story instead of the sections GSAP would have revealed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <>
        <DiscoveryPhase />
        <ExecutionPhase />
        <GauntletPhase />
        <LoopPhase />
      </>,
    );
    const glitch = render(<AnimatedText animation="glitch">PHASE 3</AnimatedText>);

    // Before the load has settled: the server-rendered state, empty counters and hidden headlines.
    expect(screen.queryByText('00:14:32')).not.toBeInTheDocument();
    expect(revealContainer(/It worked on my machine/)).toHaveClass('opacity-0');
    expect(revealContainer(/This happened at 3:14am/)).toHaveClass('opacity-0');

    // A hover that was waiting for GSAP is dropped with the load, and throws nothing.
    fireEvent.mouseEnter(glitch.container.querySelector('[class*="cursor-pointer"]')!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NO_IDLE_CALLBACK_DELAY_MS);
      await expect(loadGsap()).rejects.toThrow();
    });

    // Said once, and marked for the e2e helper to stop waiting on.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/GSAP could not be loaded/);
    expect(performance.getEntriesByName(GSAP_FAILED_MARK, 'mark')).toHaveLength(1);

    // Execution: the finished build, every line of the code sample shown.
    expect(screen.getAllByText('100%')).toHaveLength(3);
    expect(screen.getByText('00:14:32')).toBeInTheDocument();
    expect(screen.getByText('x12')).toBeInTheDocument();
    const codeSpans = screen.getByText('export class').parentElement!.querySelectorAll('span');
    for (const span of codeSpans) {
      if (span.style.opacity) expect(span.style.opacity).toBe('1');
    }

    // Gauntlet: the finished pipeline, the deployment, the achievement and the headline.
    expect(screen.getByText('DEPLOYMENT SUCCESSFUL')).toBeInTheDocument();
    expect(revealContainer(/Achievement Unlocked/)).not.toHaveClass('opacity-0');
    expect(revealContainer(/It worked on my machine/)).not.toHaveClass('opacity-0');

    // Loop: the resolved alert, the whole log, the protocol toast and the headline.
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
    expect(screen.getByText('Awaiting human approval')).toBeInTheDocument();
    expect(revealContainer(/SELF-HEALING PROTOCOL ACTIVE/)).not.toHaveClass('opacity-0');
    expect(revealContainer(/This happened at 3:14am/)).not.toHaveClass('opacity-0');

    // A phase that mounts after the failure, as on a soft navigation back to `/`, falls back too.
    cleanup();
    render(<LoopPhase />);
    await act(async () => {});
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
    expect(revealContainer(/This happened at 3:14am/)).not.toHaveClass('opacity-0');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
