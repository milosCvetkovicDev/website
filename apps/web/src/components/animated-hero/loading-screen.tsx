'use client';

import { useRef, useEffect, useState } from 'react';
import { Terminal, StatDisplay, NotificationToast } from './hud-elements';

export function LoadingScreen() {
  const sectionRef = useRef<HTMLDivElement>(null);
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
      ref={sectionRef}
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
    >
      {/* HUD Panel - shows immediately, BootstrapLoader handles initial loading */}
      <div className="w-full max-w-md">
        <Terminal className="mb-6">
          <div className="space-y-2">
            <StatDisplay label="PLAYER" value="Milos Cvetkovic" />
            <StatDisplay label="CLASS" value="AI-Native Engineer" />
            <StatDisplay label="LEVEL" value="10+ years" />
            <div className="flex justify-between items-center pt-2 border-t border-[#30363d]">
              <span className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                STATUS
              </span>
              <span className="font-mono text-green-400 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Ready
              </span>
            </div>
          </div>
        </Terminal>

        {/* Notification */}
        <div className="mt-6">
          <NotificationToast type="info">
            <span className="flex items-center gap-2">
              <span>⚡</span>
              <span>NEW QUEST RECEIVED</span>
            </span>
          </NotificationToast>
        </div>
      </div>

      {/* Headline */}
      <div className="text-center mt-12 max-w-2xl">
        <h1 className="text-3xl md:text-5xl font-bold mb-4 glitch-text">
          Most engineers show you the finished product.
        </h1>
        <p className="text-lg text-[var(--muted)]">
          I&apos;ll show you how the sausage gets made.{' '}
          <span className="gradient-text font-semibold">Scroll to watch me work.</span>
        </p>
      </div>

      {/* Scroll Indicator - fixed at bottom of viewport, fades on scroll */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 transition-opacity duration-300 ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span className="text-[10px] font-mono text-[var(--accent)] tracking-widest uppercase">
          Scroll
        </span>
        <div className="relative w-6 h-10 border-2 border-[var(--accent)]/50 rounded-full">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  );
}
