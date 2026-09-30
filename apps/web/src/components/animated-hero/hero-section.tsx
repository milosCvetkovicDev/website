'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { TmuxBackground } from './tmux-background';

const SCROLL_THRESHOLD_PX = 100;
const subscribeToScroll = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
};
const getScrolled = () => window.scrollY > SCROLL_THRESHOLD_PX;
const getServerScrolled = () => false;

export function HeroSection({ children }: { children?: ReactNode }) {
  // Hidden once the user has scrolled past the top; correct on reload with a restored position too.
  const scrolled = useSyncExternalStore(subscribeToScroll, getScrolled, getServerScrolled);
  const showScrollIndicator = !scrolled;

  return (
    <section
      aria-label="Hero - Milos Cvetkovic, Senior Full Stack Engineer"
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12"
    >
      {/* 1. TmuxBackground -- absolute-positioned background. Imported statically and hydrated
          with the hero: as a lazy chunk it was a request of its own, made only once hydration
          asked for it, and its Suspense boundary hydrated after the rest of the page. It is
          served at every width but displayed from `md` up only: a phone neither lays it out nor
          paints it, and its ticks do not run there. */}
      <TmuxBackground />

      {/* 2. Overlay layers (decorative) */}
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 45% 40% at 50% 45%, rgba(139,92,246,0.06) 0%, transparent 65%)',
          animation: 'hero-breathe 6s ease-in-out infinite',
        }}
      />
      {/* Vignette - light */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] block dark:hidden"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 48% 42% at 50% 50%, transparent 10%, rgba(250,250,250,0.5) 100%)',
        }}
      />
      {/* Vignette - dark */}
      <div
        className="pointer-events-none absolute inset-0 z-[3] hidden dark:block"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 48% 42% at 50% 50%, transparent 10%, rgba(10,10,10,0.6) 100%)',
        }}
      />
      {/* Top fade - light */}
      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-[4] block dark:hidden"
        aria-hidden="true"
        style={{
          height: '8%',
          background: 'linear-gradient(to top, transparent, rgba(250,250,250,0.3))',
        }}
      />
      {/* Top fade - dark */}
      <div
        className="pointer-events-none absolute top-0 right-0 left-0 z-[4] hidden dark:block"
        aria-hidden="true"
        style={{
          height: '8%',
          background: 'linear-gradient(to top, transparent, rgba(10,10,10,0.3))',
        }}
      />
      {/* Bottom fade */}
      <div
        className="pointer-events-none absolute right-0 bottom-0 left-0 z-[4]"
        aria-hidden="true"
        style={{
          height: '15%',
          background: 'linear-gradient(to bottom, transparent, var(--background))',
        }}
      />

      {/* 3. Server-rendered content island (passed as children) */}
      {children}

      {/* 4. Scroll indicator -- fixed, bottom-11, z-20, displayed from `lg` and from 960 px and
          60rem tall only. It is pinned to the viewport while the card is centred in a section one
          small-viewport tall that starts under the sticky header, so losing height lifts the
          indicator by the full amount but the card's bottom edge by only half of it. Measured in
          Chromium for #134 (2026-09-28, 16 px default font): with the card 583 px tall and its
          centre 69 px below the viewport's, the gap from the card's bottom edge down to the
          indicator's top was (viewport height / 2) - 460.1 px at every lg size, negative where they
          overlap, so the indicator clears the card from 921 px tall and 960 px leaves about 20 px.
          Both heights guard against the visitor's default font size, which media-query rems follow
          while most of the card is set in px: a smaller default would pull 60rem alone below the
          card (720 px at 12 px), and a larger one grows the rem-sized part of the card and header,
          never by more than the 60rem it also raises. Shorter screens do not display it, and the
          card's own "Scroll to see how." invites the scroll there. A media query rather than a
          measurement, so the served markup is the same at every size (ADR 0006). The figures drift
          when the card or the header changes: 'scroll indicator clears the hero card at rest' in
          e2e/hero.spec.ts asserts the gate and a minimum clearance, at both font extremes too.
          Decorative, aria-hidden and without a handler, so it never takes the pointer. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed bottom-11 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-1.5 transition-opacity duration-300 lg:[@media(min-height:960px)_and_(min-height:60rem)]:flex ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span
          className="font-mono tracking-[0.2em] text-[var(--accent-text)] uppercase"
          style={{
            fontSize: '9px',
            textShadow: '0 1px 10px rgba(0,0,0,0.9)',
          }}
        >
          Scroll
        </span>
        <div className="relative h-[36px] w-[22px] rounded-[11px] border-[1.5px] border-[rgba(99,102,241,0.3)] bg-white/60 dark:border-[rgba(139,92,246,0.35)] dark:bg-[rgba(10,10,10,0.6)]">
          <div
            className="absolute left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[var(--accent)]"
            style={{
              animation: 'hero-scroll-bounce 1.5s ease-in-out infinite',
              top: '7px',
            }}
          />
        </div>
      </div>
    </section>
  );
}
