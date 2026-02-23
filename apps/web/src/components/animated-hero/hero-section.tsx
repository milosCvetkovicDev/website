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
      className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
    >
      {/* 1. TmuxBackground -- absolute-positioned background (lazy loaded) */}
      <Suspense fallback={null}>
        <TmuxBackground />
      </Suspense>

      {/* 2. Overlay layers (decorative) */}
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 45% 40% at 50% 45%, rgba(139,92,246,0.06) 0%, transparent 65%)',
          animation: 'hero-breathe 6s ease-in-out infinite',
        }}
      />
      {/* Vignette - light */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] block dark:hidden"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 48% 42% at 50% 50%, transparent 10%, rgba(250,250,250,0.5) 100%)',
        }}
      />
      {/* Vignette - dark */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] hidden dark:block"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 48% 42% at 50% 50%, transparent 10%, rgba(10,10,10,0.6) 100%)',
        }}
      />
      {/* Top fade - light */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-[4] block dark:hidden"
        aria-hidden="true"
        style={{
          height: '8%',
          background: 'linear-gradient(to top, transparent, rgba(250,250,250,0.3))',
        }}
      />
      {/* Top fade - dark */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-[4] hidden dark:block"
        aria-hidden="true"
        style={{
          height: '8%',
          background: 'linear-gradient(to top, transparent, rgba(10,10,10,0.3))',
        }}
      />
      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-[4]"
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
        className={`fixed bottom-11 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20 transition-opacity duration-300 ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span
          className="font-mono uppercase tracking-[0.2em]"
          style={{
            fontSize: '9px',
            color: 'rgba(139, 92, 246, 0.7)',
            textShadow: '0 1px 10px rgba(0,0,0,0.9)',
          }}
        >
          Scroll
        </span>
        <div
          className="relative w-[22px] h-[36px] rounded-[11px] border-[1.5px] border-[rgba(99,102,241,0.3)] dark:border-[rgba(139,92,246,0.35)] bg-white/60 dark:bg-[rgba(10,10,10,0.6)]"
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-[var(--accent)] rounded-full"
            style={{ animation: 'hero-scroll-bounce 1.5s ease-in-out infinite', top: '7px' }}
          />
        </div>
      </div>
    </section>
  );
}
