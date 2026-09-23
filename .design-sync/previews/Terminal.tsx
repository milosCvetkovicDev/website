import { Terminal, TypingCursor } from 'web';

export const Conversation = () => (
  <Terminal>
    <div className="space-y-4">
      <div className="flex gap-3">
        <span className="text-[var(--accent-text)]">&gt;</span>
        <p className="text-[var(--foreground)]">
          "I'm tired of 3am pages. Build something that fixes itself."
        </p>
      </div>
      <div className="flex gap-3 text-[var(--muted)]">
        <span className="text-[var(--status-ok)]">←</span>
        <p>Interesting. What does "fix itself" mean to you?</p>
      </div>
      <div className="flex gap-3 text-[var(--muted)]">
        <span className="text-[var(--status-ok)]">←</span>
        <p>
          I'm thinking: budget caps, confidence thresholds, human approval...
          <TypingCursor />
        </p>
      </div>
    </div>
  </Terminal>
);

export const WithTitle = () => (
  <Terminal title="self-healing-agent.log">
    <div className="space-y-1">
      <p className="text-[var(--status-err)]">03:14 AM NullPointerException in /api/orders</p>
      <p className="text-[var(--muted)]">03:15 AM Root cause identified: missing null check</p>
      <p className="text-[var(--status-ok)]">03:16 AM PR #847 opened, tests passing</p>
    </div>
  </Terminal>
);

export const OnDarkPage = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <Terminal title="~/portfolio">
      <p className="text-[var(--foreground)]">
        <span className="text-[var(--accent-text)]">$ </span>pnpm build
      </p>
      <p className="text-[var(--status-ok)]">✓ Compiled successfully</p>
    </Terminal>
  </div>
);
