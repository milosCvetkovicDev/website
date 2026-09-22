import { useRef } from 'react';
import { CircuitBackground } from 'web';

// The hero's pieces animate on scroll and on timers, and a card is a still frame. They render their
// settled state under prefers-reduced-motion (the path the accessibility gate checks), so this page
// reports that preference; nothing else about the component changes.
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

export const FullyDrawn = () => {
  const progressRef = useRef(100);
  return (
    <div style={{ height: 800 }}>
      <CircuitBackground progressRef={progressRef} />
    </div>
  );
};

export const DarkTheme = () => {
  const progressRef = useRef(100);
  return (
    <div className="dark bg-[var(--background)]" style={{ height: 800 }}>
      <CircuitBackground progressRef={progressRef} />
    </div>
  );
};
