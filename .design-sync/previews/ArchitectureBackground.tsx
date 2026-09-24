import { ArchitectureBackground } from 'web';

// The section's animations (the diagram's packets, the metric count-up) run on a clock, and a card
// is a still frame. The components render their settled state under prefers-reduced-motion, so this
// page reports that preference; nothing else about the component changes.
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

export const Idle = () => (
  <div className="relative" style={{ height: 420 }}>
    <ArchitectureBackground />
  </div>
);

export const SelfHealingAgent = () => (
  <div className="relative" style={{ height: 420 }}>
    <ArchitectureBackground activeNodes={['client', 'gateway', 'worker', 'ai']} />
  </div>
);

export const EnterprisePlatform = () => (
  <div className="relative" style={{ height: 420 }}>
    <ArchitectureBackground activeNodes={['client', 'gateway', 'backend', 'db']} />
  </div>
);

export const DarkTheme = () => (
  <div className="dark relative bg-[var(--background)]" style={{ height: 420 }}>
    <ArchitectureBackground activeNodes={['client', 'gateway', 'worker', 'storage']} />
  </div>
);
