import { HudPanel, QuestItem } from 'web';

export const QuestLog = () => (
  <HudPanel title="QUEST LOG">
    <div className="space-y-2">
      <QuestItem completed>Requirements captured</QuestItem>
      <QuestItem completed>Constraints identified</QuestItem>
      <QuestItem completed>Scope locked</QuestItem>
      <QuestItem completed={false}>Architecture designed</QuestItem>
    </div>
  </HudPanel>
);

export const WithGlow = () => (
  <HudPanel title="EXTRACTED REQUIREMENTS" glow>
    <div className="flex flex-wrap gap-2">
      {['Self-healing', 'Budget caps', 'Confidence gates', 'Human approval', 'Audit trail'].map(
        (requirement, index) => (
          <span
            key={requirement}
            className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 font-mono text-sm text-[var(--accent-text)]"
          >
            <span className="mr-1 text-[var(--muted)]">#{index + 1}</span>
            {requirement}
          </span>
        ),
      )}
    </div>
  </HudPanel>
);

export const Untitled = () => (
  <HudPanel>
    <div className="flex items-center justify-between py-1">
      <span className="font-mono text-xs text-[var(--muted)]">UPTIME</span>
      <span className="font-mono text-[var(--accent-text)]">99.9%</span>
    </div>
    <div className="flex items-center justify-between py-1">
      <span className="font-mono text-xs text-[var(--muted)]">P95 LATENCY</span>
      <span className="font-mono text-[var(--accent-text)]">47ms</span>
    </div>
    <div className="flex items-center justify-between py-1">
      <span className="font-mono text-xs text-[var(--muted)]">AUTO-FIXES TODAY</span>
      <span className="font-mono text-[var(--accent-text)]">3</span>
    </div>
  </HudPanel>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <HudPanel title="BUILD STATS" glow>
      <div className="flex items-center justify-between py-1">
        <span className="font-mono text-xs text-[var(--muted)]">FILES CHANGED</span>
        <span className="font-mono text-[var(--accent-text)]">42</span>
      </div>
      <div className="flex items-center justify-between py-1">
        <span className="font-mono text-xs text-[var(--muted)]">TESTS</span>
        <span className="font-mono text-[var(--accent-text)]">318 passed</span>
      </div>
      <div className="flex items-center justify-between py-1">
        <span className="font-mono text-xs text-[var(--muted)]">COVERAGE</span>
        <span className="font-mono text-[var(--accent-text)]">94%</span>
      </div>
    </HudPanel>
  </div>
);
