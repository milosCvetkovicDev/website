import { HeroContent } from 'web';

export const LightTheme = () => (
  <div className="flex justify-center py-12">
    <HeroContent />
  </div>
);

export const DarkTheme = () => (
  <div className="dark flex justify-center bg-[var(--background)] py-12 text-[var(--foreground)]">
    <HeroContent />
  </div>
);
