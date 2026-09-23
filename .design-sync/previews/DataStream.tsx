import { DataStream, HudPanel, StatDisplay } from 'web';

export const BehindAPanel = () => (
  <div className="relative overflow-hidden rounded-lg" style={{ height: 220 }}>
    <DataStream />
    <div className="relative p-6">
      <HudPanel title="TELEMETRY">
        <StatDisplay label="Events / min" value="12,480" />
        <StatDisplay label="Anomalies" value={0} />
      </HudPanel>
    </div>
  </div>
);

export const DarkTheme = () => (
  <div
    className="dark relative overflow-hidden bg-[var(--background)] text-[var(--foreground)]"
    style={{ height: 220 }}
  >
    <DataStream />
    <div className="relative p-6">
      <p className="font-mono text-xs tracking-wider text-[var(--muted)] uppercase">
        Live data stream
      </p>
    </div>
  </div>
);
