'use client';

import { useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useStoryVisibility } from '@/hooks/use-story-visibility';
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
  // Pauses the glow, the status pulse and the dot while the hero is out of view (globals.css).
  const sectionRef = useRef<HTMLElement>(null);
  useStoryVisibility(sectionRef);

  return (
    <section
      ref={sectionRef}
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
        className="animate-hero-breathe pointer-events-none absolute inset-0 z-[2]"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 45% 40% at 50% 45%, rgba(139,92,246,0.06) 0%, transparent 65%)',
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

      {/* 4. Scroll indicator -- fixed, bottom-11, z-20, displayed from `lg` and from 1024 px and
          64rem tall only. It is pinned to the viewport while the card is centred in a section one
          small-viewport tall that starts under the sticky header, so losing height lifts the
          indicator by the full amount but the card's bottom edge by only half of it. Measured in
          Chromium for #134 (2026-09-28, 16 px default font): with the card 583 px tall and its
          centre 69 px below the viewport's, the gap from the card's bottom edge down to the
          indicator's top was (viewport height / 2) - 460.1 px at every lg size, negative where they
          overlap, so the indicator cleared the card from 921 px tall and the gate was 960 px and
          60rem. Since #58 the card is 637 px tall at 1280 wide, with the h1 naming who the site is
          about above the hook, so the gap is (viewport height / 2) - 487.0 px: it clears the card
          from 974 px, and 1024 px leaves about 25 px (measured 2026-10-03, -7.0 px at 1280x960).
          Both heights guard against the visitor's default font size, which media-query rems follow
          while most of the card is set in px: a smaller default would pull 64rem alone below the
          card (768 px at 12 px), and a larger one grows the rem-sized part of the card and header,
          never by more than the 64rem it also raises. Shorter screens do not display it, and the
          card's own "Scroll to see how." invites the scroll there. A media query rather than a
          measurement, so the served markup is the same at every size (ADR 0006). The figures drift
          when the card or the header changes: 'scroll indicator clears the hero card at rest' in
          e2e/hero.spec.ts asserts the gate and a minimum clearance, at both font extremes too.
          Decorative, aria-hidden and without a handler, so it never takes the pointer. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed bottom-11 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-1.5 transition-opacity duration-300 lg:[@media(min-height:1024px)_and_(min-height:64rem)]:flex ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span
          className="font-mono tracking-[0.2em] text-[var(--accent-text)] uppercase"
          style={{
            fontSize: '9px',
            // A halo of the page's own colour lifts the label off the tmux panes behind it in both
            // themes. A black one in light pulled the pixels under the glyphs down to rgb(219):
            // e2e/hero-contrast.spec.ts measures the label against --background and holds the halo
            // to it, since its probe cannot see a shadow.
            textShadow: '0 1px 10px var(--background)',
          }}
        >
          Scroll
        </span>
        <div className="relative h-[36px] w-[22px] rounded-[11px] border-[1.5px] border-[var(--accent)]/30 bg-[var(--background)]/60">
          {/* Paused while the indicator is faded out, since nobody can see it bounce then. Only
              `paused` is ever written inline: an inline `running` would outrank the stylesheet's
              pause for a hero scrolled out of view. */}
          <div
            className="animate-hero-scroll-bounce absolute left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[var(--accent)]"
            style={{
              top: '7px',
              animationPlayState: showScrollIndicator ? undefined : 'paused',
            }}
          />
        </div>
      </div>
    </section>
  );
}
