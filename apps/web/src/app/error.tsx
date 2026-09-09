'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <span
            aria-hidden="true"
            className="font-mono text-6xl font-bold text-[var(--accent-text)]"
          >
            !
          </span>
        </div>
        <h1 className="mb-4 text-2xl font-bold">Something went wrong</h1>
        <p className="mb-8 text-[var(--muted)]">
          An unexpected error occurred. Don&apos;t worry, it&apos;s not you—it&apos;s us.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button
            onClick={reset}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-[var(--border)] px-6 py-3 transition-colors hover:border-[var(--accent)]/50"
          >
            Go Home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 font-mono text-xs text-[var(--muted)]">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
