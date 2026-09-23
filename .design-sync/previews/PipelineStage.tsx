import { HudPanel, PipelineStage } from 'web';

export const Statuses = () => (
  <div className="space-y-3">
    <PipelineStage name="LINT" status="passed" />
    <PipelineStage name="UNIT TESTS" status="running" progress={64} />
    <PipelineStage name="E2E TESTS" status="pending" progress={0} />
    <PipelineStage name="SECURITY" status="failed" progress={38} />
  </div>
);

export const InAPipelinePanel = () => (
  <HudPanel title="CI/CD PIPELINE">
    <div className="space-y-3">
      <PipelineStage name="LINT" status="passed" />
      <PipelineStage name="TYPE CHECK" status="passed" />
      <PipelineStage name="UNIT TESTS" status="passed" />
      <PipelineStage name="E2E TESTS" status="running" progress={72} />
      <PipelineStage name="SECURITY" status="pending" progress={0} />
      <PipelineStage name="BUILD" status="pending" progress={0} />
    </div>
  </HudPanel>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="space-y-3">
      <PipelineStage name="LINT" status="passed" />
      <PipelineStage name="UNIT TESTS" status="running" progress={64} />
      <PipelineStage name="E2E TESTS" status="pending" progress={0} />
      <PipelineStage name="SECURITY" status="failed" progress={38} />
    </div>
  </div>
);
