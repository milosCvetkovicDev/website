import Link from 'next/link';

export default function CaseStudyNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <span
            aria-hidden="true"
            className="font-mono text-6xl font-bold text-[var(--accent-text)]"
          >
            ?
          </span>
        </div>
        <h1 className="mb-4 text-2xl font-bold">Case study not found</h1>
        <p className="mb-8 text-[var(--muted)]">
          This project doesn&apos;t exist or may have been removed.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/work"
            className="rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            View All Projects
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-[var(--border)] px-6 py-3 transition-colors hover:border-[var(--accent)]/50"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
