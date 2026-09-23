import { HexBadge } from 'web';

export const Achievements = () => (
  <div className="flex flex-wrap gap-4">
    <HexBadge>🏆</HexBadge>
    <HexBadge>🚀</HexBadge>
    <HexBadge>🛡️</HexBadge>
    <HexBadge>⚡</HexBadge>
  </div>
);

export const WithLabel = () => (
  <div className="flex items-center gap-3">
    <HexBadge>🏆</HexBadge>
    <div>
      <div className="font-semibold text-[var(--foreground)]">Zero Trust, Full Send</div>
      <div className="font-mono text-xs text-[var(--muted)]">+500 XP</div>
    </div>
  </div>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <div className="flex flex-wrap gap-4">
      <HexBadge>🏆</HexBadge>
      <HexBadge>🚀</HexBadge>
      <HexBadge>🛡️</HexBadge>
      <HexBadge>⚡</HexBadge>
    </div>
  </div>
);
