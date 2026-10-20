import Link from 'next/link';
import { blogCopy, blogRecord } from '@/data/pages/blog';
import { hasPublishedPosts, publishedPosts, type PublishedPost } from '@/data/posts';
import { formatContentDates } from '@/lib/content-date';
import { WebPageJsonLd } from '@/components/json-ld';
import { buildMetadata } from '@/lib/metadata';

export const metadata = buildMetadata({
  title: blogRecord.title,
  description: blogRecord.summary,
  path: blogRecord.path,
  // `hasPublishedPosts` is the switch (ADR 0028, #61): while no post is published this page is the
  // Coming Soon placeholder, out of search as it is out of `sitemap.ts`, with its nav link kept.
  // The owner's commit that publishes the first post makes it indexable and puts it in the sitemap.
  index: hasPublishedPosts,
});

export default function BlogPage() {
  return (
    <div className="py-16 md:py-24">
      <WebPageJsonLd path={blogRecord.path} name={blogRecord.title} />
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-4xl font-bold md:text-5xl">{blogRecord.heading}</h1>
        <p className="mb-12 text-xl text-[var(--muted)]">{blogCopy.intro}</p>

        {hasPublishedPosts ? <PostList posts={publishedPosts} /> : <ComingSoon />}
      </div>
    </div>
  );
}

/**
 * The published posts, newest first: each one's title, linked to the post, the day it was published
 * and its summary. The day is labelled and marked up as the post's own page shows it.
 */
function PostList({ posts }: { posts: readonly PublishedPost[] }) {
  return (
    // `role="list"` restates the element's own role because Safari drops list semantics from a list
    // styled without markers, and VoiceOver would then announce neither the list nor its count.
    <ol role="list" data-post-list className="space-y-6">
      {posts.map((post) => {
        // Checked as the post page checks it: a date that does not format fails the prerender.
        const { published } = formatContentDates(
          `/blog/${post.slug}`,
          post.publishedAt,
          post.updatedAt,
        );
        return (
          <li
            key={post.slug}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <h2 className="mb-2 text-xl font-semibold wrap-break-word md:text-2xl">
              <Link
                href={`/blog/${post.slug}`}
                className="transition-colors hover:text-[var(--accent-text)] focus-visible:text-[var(--accent-text)]"
              >
                {post.title}
              </Link>
            </h2>
            <dl className="mb-3 flex gap-2 text-sm">
              <dt className="text-[var(--muted)]">Published</dt>
              <dd>
                <time dateTime={post.publishedAt}>{published}</time>
              </dd>
            </dl>
            <p className="wrap-break-word text-[var(--muted)]">{post.summary}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** The Coming Soon placeholder: the page while no post is published, as since the site launched. */
function ComingSoon() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12 text-center">
      <div className="mb-6">
        <svg
          aria-hidden="true"
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
      {blogCopy.comingSoon.paragraphs.map((paragraph, index) => (
        <p key={index} className="mx-auto max-w-md text-[var(--muted)]">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
