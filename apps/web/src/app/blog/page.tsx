import { blogCopy, blogRecord } from '@/data/pages/blog';
import { buildMetadata } from '@/lib/metadata';

export const metadata = buildMetadata({
  title: blogRecord.title,
  description: blogRecord.summary,
  path: blogRecord.path,
  // Out of search while this is a Coming Soon placeholder, as it is out of `sitemap.ts`; the nav
  // link stays. When the first post ships, delete this line and put /blog back in the sitemap.
  index: false,
});

export default function BlogPage() {
  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-4xl font-bold md:text-5xl">Writing</h1>
        <p className="mb-12 text-xl text-[var(--muted)]">{blogCopy.intro}</p>

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
          <h2 className="mb-3 text-xl font-semibold">{blogCopy.comingSoon.heading}</h2>
          {blogCopy.comingSoon.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mx-auto max-w-md text-[var(--muted)]">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
