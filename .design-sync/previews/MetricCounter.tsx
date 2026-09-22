import { MetricCounter } from 'web';

// The count-up runs on a clock, and a card is a still frame. The component renders its settled state
// under prefers-reduced-motion, so this page reports that preference; nothing else changes.
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

export const Resting = () => (
  <div className="flex flex-wrap gap-4">
    <MetricCounter active={false} value={73} suffix="%" label="faster resolution" />
    <MetricCounter active={false} value={40} suffix="%" label="less complexity" />
    <MetricCounter active={false} value={5} suffix="×" label="faster builds" />
  </div>
);

export const Active = () => (
  <div className="flex">
    <MetricCounter active value={73} suffix="%" label="faster resolution" />
  </div>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="flex flex-wrap gap-4">
      <MetricCounter active value={73} suffix="%" label="faster resolution" />
      <MetricCounter active={false} value={5} suffix="×" label="faster builds" />
    </div>
  </div>
);
