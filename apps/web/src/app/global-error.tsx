'use client';

import { useLayoutEffect } from 'react';
import './globals.css';
import { preferredTheme } from '@/lib/theme';
import { WebAnalytics } from '@/components/web-analytics';

/**
 * The error page for a throw the root layout cannot catch: one in the layout itself or in its client
 * components (`ThemeProvider`, `Navigation`, `Footer`), which `error.tsx` sits inside. It replaces
 * the root layout, so it brings the document shell the layout would have: `<html>` and `<body>`, the
 * global stylesheet, the theme, a title, and the analytics tag, so a visit that ends here is
 * still counted. It cannot use the layout's `next/font` variables, which arrive on the layout's
 * `<body>` class, so it sets a system font stack. No state: it renders once and offers a retry and
 * a way home.
 *
 * The theme is applied in a layout effect, before paint, rather than by the layout's inline script:
 * rendered on the client, where this page usually is, React never runs a `<script>` and reports one
 * as an error, and swapping the document shell drops the class the layout's script had set.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const theme = preferredTheme();
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong | Milos Cvetkovic</title>
      </head>
      <body
        className="flex min-h-screen items-center justify-center px-6 antialiased"
        style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
        suppressHydrationWarning
      >
        <main className="max-w-md text-center">
          <h1 className="mb-4 text-2xl font-bold">Something went wrong</h1>
          <p className="mb-8 text-[var(--muted)]">
            The page failed to load. Trying again usually works; if it does not, start from the home
            page.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router is what failed, so leave by a full load, not a client navigation. */}
            <a
              href="/"
              className="rounded-lg border border-[var(--border)] px-6 py-3 transition-colors hover:border-[var(--accent)]/50"
            >
              Go home
            </a>
          </div>
          {error.digest && (
            <p className="mt-8 font-mono text-xs text-[var(--muted)]">Error ID: {error.digest}</p>
          )}
        </main>
        <WebAnalytics />
      </body>
    </html>
  );
}
