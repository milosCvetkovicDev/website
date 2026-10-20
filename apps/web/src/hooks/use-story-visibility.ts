'use client';

import { useEffect, type RefObject } from 'react';

/**
 * The attribute the observer writes, `true` while any pixel of the section is in the viewport and
 * `false` once none is. `globals.css` pauses the endless CSS animations inside a section marked
 * `false` (ADR 0009 rule 4). It is story-scoped on purpose: `data-active` already means "hovered" on
 * the featured-work cards and drives their own paused-scan-line rule.
 */
const ATTRIBUTE = 'data-story-visible';

/**
 * One observer for every story section, created with the first section and dropped with the last,
 * and the sections it is watching. The set is also the guard in the callback: an entry the browser
 * queued before a section was unobserved can still arrive afterwards, and must not write the
 * attribute back onto an element nobody is watching any more.
 */
let observer: IntersectionObserver | null = null;
const tracked = new Set<Element>();

const markVisibility: IntersectionObserverCallback = (entries) => {
  for (const entry of entries) {
    if (!tracked.has(entry.target)) continue;
    entry.target.setAttribute(ATTRIBUTE, String(entry.isIntersecting));
  }
};

/**
 * Marks a story section as seen or unseen, so the endless animations inside it stop while nobody
 * can see them and run again when it returns. The attribute is written on the element directly, not
 * through React state: the served HTML carries none, so a section runs until the observer's first
 * report, and nothing re-renders as the visitor scrolls (ADR 0006, no setState in an effect).
 *
 * - The granularity is the section: while any pixel of it is in the viewport, every endless
 *   animation inside it runs, including one further down a tall section or one inside an element
 *   GSAP holds at opacity 0 before its entrance. Opacity is not observed at all.
 * - The ref is read once, after the first commit, so it must sit on an element rendered
 *   unconditionally and never swapped for another node. Every caller puts it on the `<section>` its
 *   component returns.
 * - Only CSS animations are paused this way. A GSAP tween that repeats is paused by its own
 *   ScrollTrigger, as GameComplete's CTA glow is on leave; `e2e/reduced-motion.spec.ts` (R18) reads
 *   `document.getAnimations()`, which never sees a GSAP tween.
 */
export function useStoryVisibility(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    // jsdom has no IntersectionObserver, and every phase test mounts a section through this hook.
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const current = (observer ??= new IntersectionObserver(markVisibility));
    tracked.add(element);
    current.observe(element);

    return () => {
      tracked.delete(element);
      current.unobserve(element);
      element.removeAttribute(ATTRIBUTE);
      if (tracked.size === 0) {
        current.disconnect();
        observer = null;
      }
    };
  }, [ref]);
}
