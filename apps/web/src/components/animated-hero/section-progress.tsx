'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

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
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

  // Refs for direct DOM manipulation (avoid React re-renders during scroll)
  const progressLineRef = useRef<HTMLDivElement>(null);
  const mobileProgressRef = useRef<HTMLDivElement>(null);

  // Throttled scroll handler using RAF for smooth updates
  const handleScroll = useCallback(() => {
    if (rafRef.current) return; // Skip if already scheduled

    rafRef.current = requestAnimationFrame(() => {
      const now = performance.now();
      // Throttle to ~30fps to reduce work
      if (now - lastUpdateRef.current < 33) {
        rafRef.current = null;
        return;
      }
      lastUpdateRef.current = now;

      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (scrollTop / docHeight) * 100;

      // Direct DOM manipulation for progress bars (no React re-render)
      if (mobileProgressRef.current) {
        mobileProgressRef.current.style.width = `${progress}%`;
      }

      // Calculate active section based on scroll position
      const sectionIndex = Math.min(
        Math.floor((scrollTop / docHeight) * sections.length),
        sections.length - 1,
      );

      // Update progress line directly
      if (progressLineRef.current) {
        progressLineRef.current.style.height = `${(sectionIndex / (sections.length - 1)) * 100}%`;
      }

      // Only trigger React re-render when section actually changes
      setActiveSection((prev) => (prev !== sectionIndex ? sectionIndex : prev));

      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleScroll]);

  return (
    <>
      {/* Vertical progress bar on the right */}
      <div className="fixed top-1/2 right-6 z-50 hidden -translate-y-1/2 flex-col items-center gap-2 lg:flex">
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
                className={`relative h-3 w-3 rounded-full transition-all duration-300 ${
                  index <= activeSection ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                } ${index === activeSection ? 'shadow-[0_0_8px_rgba(139,92,246,0.6)]' : ''}`}
              />

              {/* Label (shows on hover) */}
              <span
                className={`font-mono text-[10px] tracking-wider transition-all duration-300 ${
                  index === activeSection
                    ? 'text-[var(--accent)] opacity-100'
                    : 'text-[var(--muted)] opacity-0 group-hover:opacity-100'
                }`}
              >
                {section.label}
              </span>
            </button>
          ))}
        </div>

        {/* Connecting line */}
        <div className="absolute top-0 left-1.5 -z-10 h-full w-[1px]">
          <div className="h-full w-full bg-[var(--border)]" />
          <div
            ref={progressLineRef}
            className="absolute top-0 w-full bg-[var(--accent)] will-change-[height]"
            style={{
              height: `${(activeSection / (sections.length - 1)) * 100}%`,
              transition: 'none',
            }}
          />
        </div>
      </div>

      {/* Mobile progress bar at top */}
      <div className="fixed top-0 right-0 left-0 z-50 lg:hidden">
        <div className="h-1 bg-[var(--border)]">
          <div
            ref={mobileProgressRef}
            className="h-full bg-[var(--accent)] will-change-[width]"
            style={{ width: '0%', transition: 'none' }}
          />
        </div>
      </div>

      {/* Corner frame elements */}
      <div className="pointer-events-none fixed inset-0 z-40">
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
        <div className="absolute right-4 bottom-4">
          <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
            <path d="M20 40 L40 40 L40 20" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        {/* Current section indicator - positioned bottom-left to avoid overlap with scroll indicator */}
        <div className="absolute bottom-4 left-16 font-mono text-[10px] tracking-widest text-[var(--accent)]/50">
          [{String(activeSection + 1).padStart(2, '0')}/{String(sections.length).padStart(2, '0')}]{' '}
          {sections[activeSection]?.label}
        </div>
      </div>
    </>
  );
}
