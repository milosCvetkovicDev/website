import type { ReactElement } from 'react';
import Link from 'next/link';
import { socialProfiles, type SocialProfileId } from '@/data/social';
import { Logo } from './logo';

/**
 * The year in the copyright line. The footer is prerendered, so `new Date().getFullYear()` here would
 * be the year of the build, current only by accident; the year is a decision written down instead.
 */
const COPYRIGHT_YEAR = 2026;

/** Each profile's mark, keyed by its id in `data/social.ts`, which supplies the name and the URL. */
const icons: Record<SocialProfileId, ReactElement> = {
  linkedin: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  github: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  ),
  // The X mark `/contact` draws, filled: it has no stroke outline to draw.
  x: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
};

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2">
              <Logo size={14} />
              <p className="text-sm text-[var(--muted)]">
                © {COPYRIGHT_YEAR} Milos Cvetkovic. Built with Next.js.
              </p>
            </div>
            <Link
              href="/privacy"
              className="-my-1 py-1 text-sm text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--foreground)]"
            >
              Privacy
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {socialProfiles.map((profile) => (
              <Link
                key={profile.id}
                href={profile.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                aria-label={profile.name}
              >
                {icons[profile.id]}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
