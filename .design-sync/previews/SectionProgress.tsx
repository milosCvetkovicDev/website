import * as React from 'react';
import { SectionProgress } from 'web';

// The hero's pieces animate on scroll and on timers, and a card is a still frame. They render their
// settled state under prefers-reduced-motion (the path the accessibility gate checks), so this page
// reports that preference; nothing else about the component changes. The stories call
// React.useRef, without a type argument: they become the plain-JSX usage examples, and React is a
// global in a design.
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = (query: string) =>
  query === reducedMotionQuery
    ? ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList)
    : matchMedia(query);

export const AtTheStart = () => {
  const storyRef = React.useRef(null);
  return (
    <div ref={storyRef} style={{ height: 700 }}>
      <SectionProgress storyRef={storyRef} />
    </div>
  );
};

export const DarkTheme = () => {
  const storyRef = React.useRef(null);
  return (
    <div ref={storyRef} className="dark bg-[var(--background)]" style={{ height: 700 }}>
      <SectionProgress storyRef={storyRef} />
    </div>
  );
};
