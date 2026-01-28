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
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-6xl font-mono font-bold text-[var(--accent)]/30">!</span>
        </div>
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-[var(--muted)] mb-8">
          An unexpected error occurred. Don&apos;t worry, it&apos;s not you—it&apos;s us.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[var(--accent)] text-white font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-3 border border-[var(--border)] rounded-lg hover:border-[var(--accent)]/50 transition-colors"
          >
            Go Home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 text-xs text-[var(--muted)] font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
