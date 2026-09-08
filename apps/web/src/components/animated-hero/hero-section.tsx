'use client';

import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

const TmuxBackground = lazy(() =>
  import('./tmux-background').then((m) => ({ default: m.TmuxBackground })),
);

export function HeroSection({ children }: { children?: ReactNode }) {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  // Hide scroll indicator when user starts scrolling
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 100;
      setShowScrollIndicator(!scrolled);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section
      aria-label="Hero - Milos Cvetkovic, Senior Full Stack Engineer"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
    >
      {/* 1. TmuxBackground -- absolute-positioned background (lazy loaded) */}
      <Suspense fallback={null}>
        <TmuxBackground />
      </Suspense>

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

      {/* 4. Scroll indicator -- fixed, bottom-11, z-20 */}
      <div
        aria-hidden="true"
        className={`fixed bottom-11 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5 transition-opacity duration-300 ${
          showScrollIndicator ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <span
          className="font-mono tracking-[0.2em] uppercase"
          style={{
            fontSize: '9px',
            color: 'rgba(139, 92, 246, 0.7)',
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
