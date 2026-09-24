import { Terminal, TypingCursor } from 'web';

// A card is a still frame, and the caret's one-second blink puts it in its hidden half whenever the
// capture lands there. Pausing the animation on this page holds the caret on its visible first frame.
const pauseBlink = document.createElement('style');
pauseBlink.textContent = '.animate-blink { animation-play-state: paused; }';
document.head.appendChild(pauseBlink);

export const InATerminalLine = () => (
  <Terminal>
    <p className="text-[var(--muted)]">
      I'm thinking: budget caps, confidence thresholds, human approval...
      <TypingCursor />
    </p>
  </Terminal>
);

export const Colors = () => (
  <Terminal title="cursor colours">
    <div className="space-y-2">
      <p className="text-[var(--foreground)]">
        accent
        <TypingCursor />
      </p>
      <p className="text-[var(--foreground)]">
        white
        <TypingCursor color="white" />
      </p>
      <p className="text-[var(--foreground)]">
        green
        <TypingCursor color="green" />
      </p>
    </div>
  </Terminal>
);

export const OnThePage = () => (
  <p className="font-mono text-sm text-[var(--foreground)]">
    $ pnpm deploy --prod
    <TypingCursor />
  </p>
);
