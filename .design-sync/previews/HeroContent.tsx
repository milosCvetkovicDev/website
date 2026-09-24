import { HeroContent } from 'web';

export const LightTheme = () => <HeroContent />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] py-12 text-[var(--foreground)]">
    <HeroContent />
  </div>
);
