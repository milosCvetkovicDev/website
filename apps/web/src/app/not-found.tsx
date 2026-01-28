import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-8xl font-mono font-bold text-[var(--accent)]/30">404</span>
        </div>
        <h1 className="text-2xl font-bold mb-4">Page not found</h1>
        <p className="text-[var(--muted)] mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-[var(--accent)] text-white font-semibold rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/work"
            className="px-6 py-3 border border-[var(--border)] rounded-lg hover:border-[var(--accent)]/50 transition-colors"
          >
            View Work
          </Link>
        </div>
      </div>
    </div>
  );
}
