import { Navigation } from 'web';

// The Logo in this component blinks when the page loads, and a capture could land on the
// cursor's dim frame. Pausing the animation holds it on its first, full-opacity frame.
const pauseBlink = document.createElement('style');
pauseBlink.textContent = '[class*="mc-blink"] { animation-play-state: paused; }';
document.head.appendChild(pauseBlink);

export const Desktop = () => <Navigation />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <Navigation />
  </div>
);
