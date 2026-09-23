import { Footer } from 'web';

export const LightTheme = () => <Footer />;

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <Footer />
  </div>
);
