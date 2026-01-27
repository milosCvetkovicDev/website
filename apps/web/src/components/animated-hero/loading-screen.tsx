'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { Terminal, HudPanel, StatDisplay, NotificationToast } from './hud-elements';

export function LoadingScreen() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      setShowContent(true);
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => setShowContent(true),
      });

      // Progress bar animation
      tl.to(progressRef.current, {
        width: '100%',
        duration: 2,
        ease: 'power2.inOut',
      })
        .to(
          progressTextRef.current,
          {
            textContent: 100,
            duration: 2,
            snap: { textContent: 1 },
            ease: 'power2.inOut',
          },
          '<'
        )
        // Fade out progress bar
        .to(
          [progressRef.current?.parentElement, progressTextRef.current?.parentElement],
          {
            opacity: 0,
            duration: 0.3,
          }
        )
        // Reveal HUD
        .fromTo(
          hudRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5 }
        )
        // Notification pops in
        .fromTo(
          notificationRef.current,
          { opacity: 0, scale: 0.9, y: -10 },
          { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)' },
          '+=0.3'
        )
        // Headline fades in
        .fromTo(
          headlineRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5 },
          '+=0.2'
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex flex-col items-center justify-center px-6 relative"
    >
      {/* Loading Progress */}
      <div className={`text-center mb-12 ${showContent ? 'hidden' : ''}`}>
        <p className="font-mono text-sm text-[var(--muted)] mb-4">
          Initializing development environment...
        </p>
        <div className="w-64 h-2 bg-[var(--border)] rounded-full overflow-hidden mx-auto">
          <div
            ref={progressRef}
            className="h-full bg-[var(--accent)] rounded-full"
            style={{ width: '0%' }}
          />
        </div>
        <p className="font-mono text-xs text-[var(--muted)] mt-2">
          <span ref={progressTextRef}>0</span>%
        </p>
      </div>

      {/* HUD Panel */}
      <div
        ref={hudRef}
        className={`w-full max-w-md ${showContent ? '' : 'opacity-0'}`}
      >
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
        <div ref={notificationRef} className={showContent ? '' : 'opacity-0'}>
          <NotificationToast type="info">
            <span className="flex items-center gap-2">
              <span>⚡</span>
              <span>NEW QUEST RECEIVED</span>
            </span>
          </NotificationToast>
        </div>
      </div>

      {/* Headline */}
      <div
        ref={headlineRef}
        className={`text-center mt-16 max-w-2xl ${showContent ? '' : 'opacity-0'}`}
      >
        <h1 className="text-3xl md:text-5xl font-bold mb-4">
          You&apos;re about to watch how the game is actually played.
        </h1>
        <p className="text-lg text-[var(--muted)]">
          Most devs show you the trophy. I&apos;ll show you the raid.
        </p>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--muted)]"
        >
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </svg>
      </div>
    </section>
  );
}
