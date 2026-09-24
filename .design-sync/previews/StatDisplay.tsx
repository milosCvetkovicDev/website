import { HudPanel, StatDisplay } from 'web';

export const Stats = () => (
  <div style={{ maxWidth: 320 }}>
    <StatDisplay label="Uptime" value="99.9%" />
    <StatDisplay label="Avg latency" value="47ms" />
    <StatDisplay label="Auto-fixes today" value={3} highlight />
  </div>
);

export const InMonitoringPanel = () => (
  <HudPanel title="MONITORING DASHBOARD">
    <StatDisplay label="Error rate" value="0.02%" />
    <StatDisplay label="Open incidents" value={0} />
    <StatDisplay label="Agent confidence" value="94%" highlight />
  </HudPanel>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div style={{ maxWidth: 320 }}>
      <StatDisplay label="Uptime" value="99.9%" />
      <StatDisplay label="Avg latency" value="47ms" />
      <StatDisplay label="Auto-fixes today" value={3} highlight />
    </div>
  </div>
);
