import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact | Milos Cvetkovic',
  description:
    'Get in touch for collaboration opportunities, consulting, or just to say hello.',
};

const socialLinks = [
  {
    name: 'LinkedIn',
    url: 'https://linkedin.com/in/milos-cvetkovic',
    description: 'Connect professionally and see my work history',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    name: 'GitHub',
    url: 'https://github.com/miloscvetkovic',
    description: 'Check out my open source projects and contributions',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    name: 'Twitter / X',
    url: 'https://twitter.com/miloscvetkovic',
    description: 'Follow for tech insights and industry updates',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

export default function ContactPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Get In Touch</h1>
        <p className="text-xl text-[var(--muted)] mb-12">
          Interested in working together? I&apos;m open to consulting
          opportunities, technical collaborations, and interesting projects.
        </p>

        {/* Social Links */}
        <section className="mb-16">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wider mb-6">
            Connect With Me
          </h2>
          <div className="grid gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--card-hover)] hover:border-[var(--accent)]/50 transition-all group"
              >
                <span className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
                  {link.icon}
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold group-hover:text-[var(--accent)] transition-colors">
                    {link.name}
                  </h3>
                  <p className="text-sm text-[var(--muted)]">
                    {link.description}
                  </p>
                </div>
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
                  className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors"
                >
                  <path d="M7 7h10v10" />
                  <path d="M7 17 17 7" />
                </svg>
              </a>
            ))}
          </div>
        </section>

        {/* Availability */}
        <section className="p-6 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5">
          <div className="flex items-start gap-4">
            <span className="flex-shrink-0 w-3 h-3 mt-1.5 rounded-full bg-green-500 animate-pulse" />
            <div>
              <h3 className="font-semibold mb-2">Currently Available</h3>
              <p className="text-[var(--muted)]">
                I&apos;m open to consulting engagements and interesting projects.
                Reach out through any of the channels above to start a
                conversation.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
