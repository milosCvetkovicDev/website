'use client';

import { useEffect, useState, useRef, useCallback, type RefObject } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/** Smallest gap between two measurements, ~30fps. The dots move a whole step at a time. */
const MEASURE_THROTTLE_MS = 33;

const sections = [
  { id: 'loading', label: 'INIT' },
  { id: 'discovery', label: 'DISCOVER' },
  { id: 'strategy', label: 'PLAN' },
  { id: 'execution', label: 'BUILD' },
  { id: 'gauntlet', label: 'TEST' },
  { id: 'loop', label: 'SHIP' },
  { id: 'complete', label: 'CTA' },
];

/**
 * Where the story starts in the document, and the scroll it takes to run from its first section to
 * its last. The dots name the seven sections of the AnimatedHero story, so they have to be measured
 * against the story: `/` opens with a sticky nav and carries on with Featured Work, Tech Stack and
 * the footer, so dividing the document instead started the dots above the story and sent the last
 * one to the bottom of the page. One wrapper stands in for all seven sections, which makes the
 * indicator proportional rather than exact: the phases are not all the same height, so a dot lights
 * near its section rather than on its boundary. Measuring the seven separately would put that
 * right, at seven more refs. The box is read on each use rather than cached, so nothing needs
 * invalidating when the story or the viewport is resized, and `top` comes from the rect rather than
 * `offsetTop`, which is measured from the nearest positioned ancestor: a `relative` appearing on a
 * layout element above the wrapper would quietly take it off the document. `range` is 0 for a story
 * shorter than the viewport, and before the wrapper has been laid out.
 */
function measureStory(wrapper: HTMLElement | null) {
  if (!wrapper) return { top: 0, range: 0 };
  const { top, height } = wrapper.getBoundingClientRect();
  return { top: top + window.scrollY, range: Math.max(0, height - window.innerHeight) };
}

export function SectionProgress({
  storyRef,
}: {
  /** The story's wrapper. Everything in flow inside it is a section one of the dots names. */
  storyRef: RefObject<HTMLElement | null>;
}) {
  const [activeSection, setActiveSection] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const rafRef = useRef<number | null>(null);
  // No measurement has been taken yet, so the first one is never throttled: the pass scheduled when
  // the listeners are attached has to land on the frame it asked for.
  const lastMeasureRef = useRef(Number.NEGATIVE_INFINITY);

  // Refs for direct DOM manipulation (avoid React re-renders during scroll)
  const progressLineRef = useRef<HTMLDivElement>(null);
  const mobileProgressRef = useRef<HTMLDivElement>(null);

  /**
   * Reads the position and paints it, on an animation frame and at most every
   * `MEASURE_THROTTLE_MS`. A frame that arrives inside the throttle window comes back on the next
   * one rather than returning: the event that scheduled it may well be the last one there is —
   * momentum settling, or the single `scroll` event that an `instant` `window.scrollTo` dispatches
   * under reduced motion — and dropping it would leave the dots, the readout and both bars showing
   * the previous position for as long as the visitor stays there. Deferring costs a frame callback
   * that compares two numbers; dropping costs a wrong indicator at rest.
   */
  const scheduleMeasure = useCallback(() => {
    // A pass is already pending, and it will read the position as it is when it runs.
    if (rafRef.current !== null) return;

    const measure = () => {
      const now = performance.now();
      if (now - lastMeasureRef.current < MEASURE_THROTTLE_MS) {
        rafRef.current = requestAnimationFrame(measure);
        return;
      }
      lastMeasureRef.current = now;
      rafRef.current = null;

      // Everything above the story, rubber-band overscroll and the pages of content below the story
      // all fall outside its range, and a story that fits the viewport has no range to divide by:
      // clamp to the first and last section either way.
      const { top, range } = measureStory(storyRef.current);
      const scrolledIntoStory = window.scrollY - top;
      const progress = range > 0 ? Math.min(1, Math.max(0, scrolledIntoStory) / range) : 0;

      // Direct DOM manipulation for progress bars (no React re-render)
      if (mobileProgressRef.current) {
        mobileProgressRef.current.style.width = `${progress * 100}%`;
      }

      // Calculate active section based on scroll position
      const sectionIndex = Math.min(Math.floor(progress * sections.length), sections.length - 1);

      // Update progress line directly
      if (progressLineRef.current) {
        progressLineRef.current.style.height = `${(sectionIndex / (sections.length - 1)) * 100}%`;
      }

      // Only trigger React re-render when section actually changes
      setActiveSection((prev) => (prev !== sectionIndex ? sectionIndex : prev));
    };

    rafRef.current = requestAnimationFrame(measure);
  }, [storyRef]);

  // Position tracking is not motion, so the listeners are attached whatever the preference is.
  useEffect(() => {
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    // `measureStory` reads `innerHeight` live, so a rotation or a window drag changes how much
    // story there is to scroll while the position itself has not moved. `resize` covers an
    // orientation change too.
    window.addEventListener('resize', scheduleMeasure);
    // A scroll event announces a change, never a position, so nothing has yet said where the page
    // is. A reload at a restored scroll position, and a back-navigation into the middle of the
    // story, both arrive already scrolled and dispatch nothing: without this pass the indicator
    // reads [01/07] INIT, with a 0% bar, until the visitor scrolls. It measures on an animation
    // frame rather than here, which is also what keeps `setActiveSection` out of the effect body.
    scheduleMeasure();
    return () => {
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        // The handle is what `scheduleMeasure` reads to decide a pass is already pending, so a
        // cancelled one left in place makes it return early for good. React re-runs this effect on
        // its own — StrictMode does it on every mount in development — and there is now always a
        // frame in flight to cancel, because attaching the listeners schedules one.
        rafRef.current = null;
      }
    };
  }, [scheduleMeasure]);

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
                const { top, range } = measureStory(storyRef.current);
                const targetScroll = top + (index / (sections.length - 1)) * range;
                // Smooth scrolling is motion; jump straight there when the user has opted out
                // ('auto' would defer to a CSS scroll-behavior, 'instant' does not).
                window.scrollTo({
                  top: targetScroll,
                  behavior: prefersReducedMotion ? 'instant' : 'smooth',
                });
              }}
              className="group flex items-center gap-2"
              aria-label={`Go to ${section.label} section`}
            >
              {/* Dot */}
              <div
                className={`relative h-3 w-3 rounded-full transition-all duration-300 ${
                  index <= activeSection ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                } ${index === activeSection ? 'shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_60%,transparent)]' : ''}`}
              />

              {/* Label (shows on hover) */}
              <span
                className={`font-mono text-[10px] tracking-wider transition-all duration-300 ${
                  index === activeSection
                    ? 'text-[var(--accent-text)] opacity-100'
                    : 'text-[var(--muted)] opacity-0 group-hover:opacity-100'
                }`}
              >
                {section.label}
              </span>
            </button>
          ))}
        </div>

        {/* Connecting line */}
        <div className="absolute top-0 left-1.5 -z-10 h-full w-px">
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

      {/* Corner frame elements and the section readout: visual chrome only. The dots above carry
          the accessible navigation, so this layer is hidden from assistive technology. */}
      <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
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
        <div className="absolute bottom-4 left-16 font-mono text-[10px] tracking-widest text-[var(--accent-text)]">
          [{String(activeSection + 1).padStart(2, '0')}/{String(sections.length).padStart(2, '0')}]{' '}
          {sections[activeSection]?.label}
        </div>
      </div>
    </>
  );
}
