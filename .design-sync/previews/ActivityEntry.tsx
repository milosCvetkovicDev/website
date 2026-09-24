import { ActivityEntry, HudPanel } from 'web';

export const Statuses = () => (
  <div className="space-y-1">
    <ActivityEntry status="error" timestamp="03:14">
      NullPointerException in /api/orders
    </ActivityEntry>
    <ActivityEntry status="pending" timestamp="03:15">
      Root cause analysis running
    </ActivityEntry>
    <ActivityEntry status="success" timestamp="03:16">
      Fix generated, PR #847 opened
    </ActivityEntry>
  </div>
);

export const InActivityLog = () => (
  <HudPanel title="ACTIVITY LOG">
    <div className="grid gap-2 md:grid-cols-2">
      <ActivityEntry status="success">
        <span className="text-[var(--accent-text)]">src/agent/analyzer.ts</span>
        <span className="text-[var(--muted)]"> — Error pattern recognition</span>
      </ActivityEntry>
      <ActivityEntry status="success">
        <span className="text-[var(--accent-text)]">src/agent/fixer.ts</span>
        <span className="text-[var(--muted)]"> — Autonomous fix generation</span>
      </ActivityEntry>
      <ActivityEntry status="success">
        <span className="text-[var(--accent-text)]">src/safety/limits.ts</span>
        <span className="text-[var(--muted)]"> — Budget caps, daily limits</span>
      </ActivityEntry>
      <ActivityEntry status="success">
        <span className="text-[var(--accent-text)]">tests/agent.test.ts</span>
        <span className="text-[var(--muted)]"> — Unit test suite</span>
      </ActivityEntry>
    </div>
  </HudPanel>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="space-y-1">
      <ActivityEntry status="error" timestamp="03:14">
        NullPointerException in /api/orders
      </ActivityEntry>
      <ActivityEntry status="pending" timestamp="03:15">
        Root cause analysis running
      </ActivityEntry>
      <ActivityEntry status="success" timestamp="03:16">
        Fix generated, PR #847 opened
      </ActivityEntry>
    </div>
  </div>
);
