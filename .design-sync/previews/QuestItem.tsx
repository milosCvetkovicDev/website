import { HudPanel, QuestItem } from 'web';

export const States = () => (
  <div className="space-y-2">
    <QuestItem completed>Requirements captured</QuestItem>
    <QuestItem completed={false}>Architecture designed</QuestItem>
  </div>
);

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

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="space-y-2">
      <QuestItem completed>Requirements captured</QuestItem>
      <QuestItem completed>Scope locked</QuestItem>
      <QuestItem completed={false}>Architecture designed</QuestItem>
    </div>
  </div>
);
