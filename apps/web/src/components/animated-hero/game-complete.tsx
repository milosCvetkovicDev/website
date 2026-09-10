'use client';

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { Terminal } from './hud-elements';
import { AnimatedText } from './animated-text';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

export function GameComplete() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);

  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Reduced motion: the section is shown as it is, with no scroll-driven timeline.
    if (prefersReducedMotion) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top center',
          // The CTA glow below repeats forever; pause it while the section is scrolled past.
          toggleActions: 'play pause resume reverse',
        },
      });

      // Terminal draws in
      tl.fromTo(
        terminalRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' },
      );

      // CTA pulses
      tl.fromTo(
        ctaRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.3',
      );

      // Add subtle pulse to CTA
      tl.to(
        ctaRef.current,
        {
          boxShadow: '0 0 30px rgba(139, 92, 246, 0.4)',
          duration: 1,
          repeat: -1,
          yoyo: true,
          ease: 'power1.inOut',
        },
        '+=0.2',
      );
    }, sectionRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section ref={sectionRef} className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-xl text-center">
        <div ref={terminalRef}>
          <Terminal className="text-left">
            <div className="space-y-4">
              <div className="border-b border-[#30363d] py-4 text-center">
                <span className="text-lg font-bold text-[var(--status-ok)]">
                  <AnimatedText animation="scramble">SESSION COMPLETE</AnimatedText>
                </span>
              </div>

              <div className="space-y-2 py-4">
                <div className="flex items-center justify-center gap-2 text-[var(--muted)]">
                  <span>Ideas</span>
                  <span className="text-[var(--accent-text)]">→</span>
                  <span>Architecture</span>
                  <span className="text-[var(--accent-text)]">→</span>
                  <span>Code</span>
                  <span className="text-[var(--accent-text)]">→</span>
                  <span>Production</span>
                </div>
                <div className="text-center text-sm text-[var(--muted)]">
                  Time: <span className="text-[var(--accent-text)]">1 conversation</span>
                </div>
              </div>

              <div className="space-y-4 border-t border-[#30363d] pt-4 text-center">
                <p className="text-xl font-semibold">
                  <AnimatedText animation="perspective">
                    This is how I work. Every time.
                  </AnimatedText>
                </p>
                <p className="text-[var(--muted)]">
                  <AnimatedText animation="magnetic">
                    Follow along for more engineering deep dives.
                  </AnimatedText>
                </p>
              </div>
            </div>
          </Terminal>
        </div>

        <a
          ref={ctaRef}
          href="https://www.linkedin.com/in/milos-cvetkovic-dev"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-[var(--accent-hover)]"
        >
          Connect on LinkedIn
        </a>

        {/* Scroll indicator to continue to rest of site */}
        <div className="mt-16 text-sm text-[var(--muted)]">
          <p>Or scroll down to see more of my work</p>
          <div className="mt-4 animate-bounce">
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
              className="mx-auto"
            >
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
