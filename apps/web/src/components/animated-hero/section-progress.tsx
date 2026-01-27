'use client';

import { useEffect, useState } from 'react';

const sections = [
  { id: 'loading', label: 'INIT' },
  { id: 'discovery', label: 'DISCOVER' },
  { id: 'strategy', label: 'PLAN' },
  { id: 'execution', label: 'BUILD' },
  { id: 'gauntlet', label: 'TEST' },
  { id: 'loop', label: 'SHIP' },
  { id: 'complete', label: 'CTA' },
];

export function SectionProgress() {
  const [activeSection, setActiveSection] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (scrollTop / docHeight) * 100;
      setScrollProgress(progress);

      // Calculate active section based on scroll position
      const sectionIndex = Math.min(
        Math.floor((scrollTop / docHeight) * sections.length),
        sections.length - 1
      );
      setActiveSection(sectionIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Vertical progress bar on the right */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden lg:flex flex-col items-center gap-2">
        {/* Section dots */}
        <div className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <button
              key={section.id}
              onClick={() => {
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const targetScroll = (index / (sections.length - 1)) * docHeight;
                window.scrollTo({ top: targetScroll, behavior: 'smooth' });
              }}
              className="group flex items-center gap-2"
              aria-label={`Go to ${section.label} section`}
            >
              {/* Dot */}
              <div
                className={`relative w-3 h-3 rounded-full transition-all duration-300 ${
                  index <= activeSection
                    ? 'bg-[var(--accent)]'
                    : 'bg-[var(--border)]'
                }`}
              >
                {/* Active glow */}
                {index === activeSection && (
                  <div className="absolute inset-0 bg-[var(--accent)] rounded-full animate-ping opacity-30" />
                )}
              </div>

              {/* Label (shows on hover) */}
              <span
                className={`font-mono text-[10px] tracking-wider transition-all duration-300 ${
                  index === activeSection
                    ? 'opacity-100 text-[var(--accent)]'
                    : 'opacity-0 group-hover:opacity-100 text-[var(--muted)]'
                }`}
              >
                {section.label}
              </span>
            </button>
          ))}
        </div>

        {/* Connecting line */}
        <div className="absolute top-0 left-1.5 w-[1px] h-full -z-10">
          <div className="w-full h-full bg-[var(--border)]" />
          <div
            className="absolute top-0 w-full bg-[var(--accent)] transition-all duration-300"
            style={{ height: `${(activeSection / (sections.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Mobile progress bar at top */}
      <div className="fixed top-0 left-0 right-0 z-50 lg:hidden">
        <div className="h-1 bg-[var(--border)]">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-150"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </div>

      {/* Corner frame elements */}
      <div className="fixed inset-0 pointer-events-none z-40">
        {/* Top-left corner */}
        <div className="absolute top-4 left-4">
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
            <path d="M0 20 L0 0 L20 0" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        {/* Top-right corner */}
        <div className="absolute top-4 right-4">
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
            <path d="M20 0 L40 0 L40 20" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        {/* Bottom-left corner */}
        <div className="absolute bottom-4 left-4">
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
            <path d="M0 20 L0 40 L20 40" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        {/* Bottom-right corner */}
        <div className="absolute bottom-4 right-4">
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
            <path d="M20 40 L40 40 L40 20" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        {/* Current section indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[10px] text-[var(--accent)]/50 tracking-widest">
          [{String(activeSection + 1).padStart(2, '0')}/{String(sections.length).padStart(2, '0')}] {sections[activeSection]?.label}
        </div>
      </div>
    </>
  );
}
