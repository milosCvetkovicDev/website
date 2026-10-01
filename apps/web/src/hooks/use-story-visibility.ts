'use client';

import { useEffect, type RefObject } from 'react';

/**
 * The attribute the observer writes, `true` while any pixel of the section is in the viewport and
 * `false` once none is. `globals.css` pauses the endless CSS animations inside a section marked
 * `false` (ADR 0009 rule 4). It is story-scoped on purpose: `data-active` already means "hovered" on
 * the featured-work cards and drives their own paused-scan-line rule.
 */
const ATTRIBUTE = 'data-story-visible';

/** One observer for every story section; created with the first section, dropped with the last. */
let observer: IntersectionObserver | null = null;
let observed = 0;

const markVisibility: IntersectionObserverCallback = (entries) => {
  for (const entry of entries) {
    entry.target.setAttribute(ATTRIBUTE, String(entry.isIntersecting));
  }
};

/**
 * Marks a story section as seen or unseen, so the endless animations inside it stop while nobody
 * can see them and run again when it returns. The attribute is written on the element directly, not
 * through React state: the served HTML carries none, so a section runs until the observer's first
 * report, and nothing re-renders as the visitor scrolls (ADR 0006, no setState in an effect).
 *
 * Only CSS animations are paused this way. GSAP tweens that repeat are paused by their own
 * ScrollTrigger's toggle actions.
 */
export function useStoryVisibility(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    // jsdom has no IntersectionObserver, and every phase test mounts a section through this hook.
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const current = (observer ??= new IntersectionObserver(markVisibility));
    current.observe(element);
    observed += 1;

    return () => {
      current.unobserve(element);
      element.removeAttribute(ATTRIBUTE);
      observed -= 1;
      if (observed === 0) {
        current.disconnect();
        observer = null;
      }
    };
  }, [ref]);
}
