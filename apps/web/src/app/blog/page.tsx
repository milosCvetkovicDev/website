import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Writing',
  description:
    'Hard-won lessons on AI agents, legacy rescue, and building systems that scale. No fluff, no hype—just what actually works.',
  openGraph: {
    title: 'Writing',
    description: 'Hard-won lessons from the trenches.',
  },
};

export default function BlogPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-4xl font-bold md:text-5xl">Writing</h1>
        <p className="mb-12 text-xl text-[var(--muted)]">
          Hard-won lessons from the trenches. No fluff, no hype—just what actually works.
        </p>

        {/* Coming soon placeholder */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <div className="mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto text-[var(--muted)]"
            >
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </div>
          <h2 className="mb-3 text-xl font-semibold">Coming Soon</h2>
          <p className="mx-auto max-w-md text-[var(--muted)]">
            I&apos;m writing about building AI agents that actually ship, rescuing legacy codebases
            without losing your mind, and the patterns that make complex systems manageable. Stay
            tuned.
          </p>
        </div>
      </div>
    </div>
  );
}
