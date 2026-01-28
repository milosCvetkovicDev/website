'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { Terminal } from './hud-elements';
import { AnimatedText } from './animated-text';

export function GameComplete() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top center',
          toggleActions: 'play none none reverse',
        },
      });

      // Terminal draws in
      tl.fromTo(
        terminalRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }
      );

      // CTA pulses
      tl.fromTo(
        ctaRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.3'
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
        '+=0.2'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center px-6 py-24"
    >
      <div className="w-full max-w-xl text-center">
        <div ref={terminalRef}>
          <Terminal className="text-left">
            <div className="space-y-4">
              <div className="text-center py-4 border-b border-[#30363d]">
                <span className="text-lg font-bold text-green-400">
                  <AnimatedText animation="scramble">SESSION COMPLETE</AnimatedText>
                </span>
              </div>

              <div className="space-y-2 py-4">
                <div className="flex items-center justify-center gap-2 text-[var(--muted)]">
                  <span>Ideas</span>
                  <span className="text-[var(--accent)]">→</span>
                  <span>Architecture</span>
                  <span className="text-[var(--accent)]">→</span>
                  <span>Code</span>
                  <span className="text-[var(--accent)]">→</span>
                  <span>Production</span>
                </div>
                <div className="text-center text-sm text-[var(--muted)]">
                  Time: <span className="text-[var(--accent)]">1 conversation</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[#30363d] text-center space-y-4">
                <p className="text-xl font-semibold">
                  <AnimatedText animation="perspective">This is how I work. Every time.</AnimatedText>
                </p>
                <p className="text-[var(--muted)]">
                  <AnimatedText animation="magnetic">Got a system that needs building? Let&apos;s talk.</AnimatedText>
                </p>
              </div>
            </div>
          </Terminal>
        </div>

        <Link
          ref={ctaRef}
          href="/contact"
          className="inline-flex items-center justify-center px-8 py-4 mt-8 bg-[var(--accent)] text-white font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-all text-lg"
        >
          Start a Conversation
        </Link>

        {/* Scroll indicator to continue to rest of site */}
        <div className="mt-16 text-[var(--muted)] text-sm">
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
