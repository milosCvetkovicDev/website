const highlights = [
  {
    title: 'AI That Ships',
    description:
      '24/7 incident response without the 3am pages. I built an agent that detects production errors, diagnoses root causes, and opens PRs with fixes—while you sleep.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 8V4H8" />
        <rect width="16" height="12" x="4" y="8" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <path d="M15 13v2" />
        <path d="M9 13v2" />
      </svg>
    ),
  },
  {
    title: 'Legacy Rescue',
    description:
      'Your "untouchable" legacy system? I\'ve rescued worse. Incremental modernization that ships value every sprint—not a risky big-bang rewrite.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <line x1="12" x2="12" y1="22" y2="12" />
      </svg>
    ),
  },
  {
    title: 'Full Ownership',
    description:
      'One engineer, zero handoffs. I architect systems, write the code, configure the infrastructure, and ship it to production. No gaps, no excuses.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" x2="16" y1="21" y2="21" />
        <line x1="12" x2="12" y1="17" y2="21" />
        <path d="m7 10 2 2 4-4" />
      </svg>
    ),
  },
];

export function Highlights() {
  return (
    <section className="border-t border-[var(--border)] py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-8 text-sm font-medium tracking-wider text-[var(--muted)] uppercase">
          What I Do
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 transition-colors hover:bg-[var(--card-hover)]"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent-text)]">
                {item.icon}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--muted)]">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
