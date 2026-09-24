import { HudPanel, ProgressBar } from 'web';

export const Variants = () => (
  <div className="space-y-3">
    <ProgressBar label="FILES" progress={100} />
    <ProgressBar label="TESTS" progress={86} variant="success" />
    <ProgressBar label="COVERAGE" progress={64} variant="warning" />
    <ProgressBar label="BUDGET" progress={23} variant="error" />
  </div>
);

export const InBuildStats = () => (
  <HudPanel title="BUILD STATS">
    <div className="space-y-4">
      <ProgressBar label="FILES" progress={100} />
      <ProgressBar label="TESTS" progress={100} />
      <ProgressBar label="COVERAGE" progress={94} />
    </div>
  </HudPanel>
);

export const WithoutLabel = () => <ProgressBar progress={45} />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="space-y-3">
      <ProgressBar label="FILES" progress={100} />
      <ProgressBar label="TESTS" progress={86} variant="success" />
      <ProgressBar label="COVERAGE" progress={64} variant="warning" />
      <ProgressBar label="BUDGET" progress={23} variant="error" />
    </div>
  </div>
);
