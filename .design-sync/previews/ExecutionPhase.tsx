import { ExecutionPhase } from 'web';

// A phase plays its entrance when the visitor scrolls it into view, and a card never scrolls. The
// phases render their settled state under prefers-reduced-motion (the path the accessibility gate
// checks), so this page reports that preference; nothing else about the component changes.
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

export const LightTheme = () => <ExecutionPhase />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <ExecutionPhase />
  </div>
);
