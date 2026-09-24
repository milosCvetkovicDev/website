import { Highlights } from 'web';

export const LightTheme = () => <Highlights />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <Highlights />
  </div>
);
