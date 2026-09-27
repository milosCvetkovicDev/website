import Link from 'next/link';
import { buildMetadata } from '@/lib/metadata';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

export const metadata = buildMetadata({
  title: 'Privacy',
  description:
    'What this site collects: page-view statistics through Vercel Web Analytics, with no cookies, accounts, forms, ads or cross-site tracking.',
  path: '/privacy',
});

// Each claim here is sourced: the analytics ones from Vercel's "Privacy and Compliance" page for
// Web Analytics (https://vercel.com/docs/analytics/privacy-policy, read 2026-09-27), the rest from
// this repository: ADR 0026 for the tracker, ADR 0023 for the CSP that refuses every other origin,
// and `components/theme-provider.tsx` for the one thing stored in the browser. The tracker writes
// local storage only when a site calls its identify API with a user or group ID, which this one
// never does (read from the served script on 2026-09-27). Change the copy with its sources, and bump
// STATIC_ROUTE_UPDATED['/privacy'] in the same commit.
const COLLECTED = [
  'the page you viewed, the route it belongs to, and query parameters in its address',
  'the site that linked you here, if your browser sends one',
  'your approximate location: country, region and city',
  'your operating system and browser, with their versions, and your device type',
  'the time of the visit',
  'the version of the analytics script',
];

export default function PrivacyPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-4xl font-bold md:text-5xl">Privacy</h1>
        <p className="mb-12 text-xl text-[var(--muted)]">
          This site sets no cookies, has no accounts, forms or ads, and does not follow you to other
          sites. Beyond what any web host receives, it counts page views, and that is all.
        </p>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Page-view statistics</h2>
          <p className="mb-4 text-[var(--muted)]">
            The site uses Vercel Web Analytics to count visits. For each page view it sends Vercel:
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-6 text-[var(--muted)]">
            {COLLECTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-[var(--muted)]">
            Vercel tells visitors apart with a hash of the request instead of a cookie, and discards
            the session after 24 hours. Vercel says it does not tie the page views to you or your IP
            address, and the site sees only aggregated numbers. Vercel describes this in its{' '}
            <a
              href="https://vercel.com/docs/analytics/privacy-policy"
              className="text-[var(--accent-text)] underline underline-offset-4"
            >
              Web Analytics privacy documentation
            </a>
            . A content or ad blocker that stops the script means your visit is not counted, and the
            site works exactly the same.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Hosting</h2>
          <p className="text-[var(--muted)]">
            Vercel hosts the site. Like any web server, it receives your IP address and browser
            details with each request in order to deliver the page. Everything the site loads, fonts
            included, comes from this domain: the site’s security policy tells your browser to
            refuse anything from another one, so your browser contacts no other site when you visit.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Your browser</h2>
          <p className="text-[var(--muted)]">
            If you use the light and dark switch, your browser remembers the choice in its local
            storage. It never leaves your device, and clearing the site’s data removes it.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">Questions</h2>
          <p className="text-[var(--muted)]">
            This site is run by Milos Cvetkovic. Ask me about any of this through the{' '}
            <Link
              href="/contact"
              className="text-[var(--accent-text)] underline underline-offset-4"
            >
              contact page
            </Link>
            .
          </p>
        </section>

        <p className="text-sm text-[var(--muted)]">
          Last updated{' '}
          <time dateTime={STATIC_ROUTE_UPDATED['/privacy']}>
            {STATIC_ROUTE_UPDATED['/privacy']}
          </time>
          .
        </p>
      </div>
    </div>
  );
}
