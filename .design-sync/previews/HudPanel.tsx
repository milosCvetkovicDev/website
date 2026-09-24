import { HudPanel, QuestItem, StatDisplay } from 'web';

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
    <StatDisplay label="Uptime" value="99.9%" />
    <StatDisplay label="P95 latency" value="47ms" />
    <StatDisplay label="Auto-fixes today" value={3} highlight />
  </HudPanel>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <HudPanel title="BUILD STATS" glow>
      <StatDisplay label="Files changed" value={42} />
      <StatDisplay label="Tests" value="318 passed" />
      <StatDisplay label="Coverage" value="94%" highlight />
    </HudPanel>
  </div>
);
