import { Logo } from 'web';

// A card is a still frame, and the cursor blinks when the page loads, so a capture could land on
// its dimmed half. Pausing the animation holds the cursor on its first, full-opacity frame.
const pauseBlink = document.createElement('style');
pauseBlink.textContent = '[class*="mc-blink"] { animation-play-state: paused; }';
document.head.appendChild(pauseBlink);

export const Size14 = () => (
  <div className="flex items-center gap-2 text-[var(--foreground)]">
    <Logo size={14} />
    <p className="text-sm text-[var(--muted)]">2026 Milos Cvetkovic. Built with Next.js.</p>
  </div>
);

export const Size20 = () => (
  <a href="/" aria-label="MC" className="text-[var(--foreground)]">
    <Logo size={20} />
  </a>
);

export const Size32 = () => (
  <div className="text-[var(--foreground)]">
    <Logo size={32} />
  </div>
);

export const LightTheme = () => (
  <div className="flex items-center gap-8 rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 text-[var(--foreground)]">
    <Logo size={14} />
    <Logo size={20} />
    <Logo size={32} />
  </div>
);

export const DarkTheme = () => (
  <div className="dark flex items-center gap-8 rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 text-[var(--foreground)]">
    <Logo size={14} />
    <Logo size={20} />
    <Logo size={32} />
  </div>
);
