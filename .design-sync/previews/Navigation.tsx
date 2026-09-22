import { Navigation } from 'web';

export const Desktop = () => <Navigation />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <Navigation />
  </div>
);
