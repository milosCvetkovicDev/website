import { TechStack } from 'web';

export const LightTheme = () => <TechStack />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <TechStack />
  </div>
);
